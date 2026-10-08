package com.know.domain;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;

class LineAttributionTest {
  private static final Instant EARLIER = Instant.parse("2026-10-01T09:15:00Z");
  private static final Instant NOW = Instant.parse("2026-10-08T13:34:00Z");

  private static String doc(String... paragraphs) {
    StringBuilder json = new StringBuilder("{\"type\":\"doc\",\"content\":[");
    for (int i = 0; i < paragraphs.length; i++) {
      if (i > 0) json.append(',');
      json.append("{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"")
          .append(paragraphs[i])
          .append("\"}]}");
    }
    return json.append("]}").toString();
  }

  private static List<Instant> edit(String before, String after) {
    String stamps = LineAttribution.fresh(before, EARLIER);
    return LineAttribution.times(after, LineAttribution.next(before, stamps, EARLIER, after, NOW), null);
  }

  // The same cases drive frontend/src/lib/line-history.test.ts, keeping both extractors identical.
  @Test
  void extractsTheSharedFixtureLines() throws Exception {
    try (InputStream fixture = getClass().getResourceAsStream("/line-history-cases.json")) {
      for (JsonNode testCase : new ObjectMapper().readTree(fixture)) {
        List<String> expected = new ArrayList<>();
        testCase.get("lines").forEach(line -> expected.add(line.asText()));
        assertEquals(expected, LineAttribution.lines(testCase.get("content").asText()), testCase.get("name").asText());
      }
    }
  }

  // The same cases drive frontend/src/lib/line-history.test.ts.
  @Test
  void matchesLinesByTheSharedFixtureRules() throws Exception {
    try (InputStream fixture = getClass().getResourceAsStream("/line-match-cases.json")) {
      for (JsonNode testCase : new ObjectMapper().readTree(fixture)) {
        String a = testCase.get("a").asText(), b = testCase.get("b").asText();
        assertEquals(testCase.get("same").asBoolean(), LineAttribution.same(a, b), a + " vs " + b);
        assertEquals(testCase.get("same").asBoolean(), LineAttribution.same(b, a), b + " vs " + a);
      }
    }
  }

  // The extension and iOS rebuild bodies from the plain-text copy, which has no checkboxes.
  @Test
  void aPlainTextClientSaveKeepsTaskLineTimes() {
    String tasks = "{\"type\":\"doc\",\"content\":[{\"type\":\"taskList\",\"content\":["
        + "{\"type\":\"taskItem\",\"attrs\":{\"checked\":true},\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Done\"}]}]},"
        + "{\"type\":\"taskItem\",\"attrs\":{\"checked\":false},\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Open\"}]}]}]}]}";
    assertEquals(List.of(EARLIER, EARLIER, NOW), edit(tasks, doc("Done", "Open", "Added")));
    // And a later web save that restores the checkboxes is not an edit either.
    String flattened = LineAttribution.next(tasks, LineAttribution.fresh(tasks, EARLIER), EARLIER, doc("Done", "Open"), NOW);
    assertEquals(List.of(EARLIER, EARLIER), LineAttribution.times(tasks, LineAttribution.next(doc("Done", "Open"), flattened, NOW, tasks, NOW.plusSeconds(60)), null));
  }

  @Test
  void onlyTheEditedLineTakesTheSaveTime() {
    assertEquals(List.of(EARLIER, NOW, EARLIER), edit(doc("One", "Two", "Three"), doc("One", "Two!", "Three")));
  }

  @Test
  void insertedLinesAreNewAndDeletedLinesDropOut() {
    assertEquals(List.of(EARLIER, NOW, EARLIER), edit(doc("One", "Three"), doc("One", "Two", "Three")));
    assertEquals(List.of(EARLIER, EARLIER), edit(doc("One", "Two", "Three"), doc("One", "Three")));
  }

  @Test
  void aMovedLineIsAnEditButTheLinesItPassedKeepTheirTimes() {
    assertEquals(List.of(EARLIER, EARLIER, NOW), edit(doc("A", "B", "C"), doc("B", "C", "A")));
  }

  @Test
  void checkingATaskIsAnEdit() {
    String open = "{\"type\":\"doc\",\"content\":[{\"type\":\"taskList\",\"content\":[{\"type\":\"taskItem\",\"attrs\":{\"checked\":false},\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Ship\"}]}]}]}]}";
    assertEquals(List.of(NOW), edit(open, open.replace("false", "true")));
  }

  // iOS and the Chrome extension save bodies as plain paragraphs; flattening a list keeps line times.
  @Test
  void flatteningAListIntoParagraphsKeepsTheTimes() {
    String list = "{\"type\":\"doc\",\"content\":[{\"type\":\"bulletList\",\"content\":[{\"type\":\"listItem\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Milk\"}]}]}]}]}";
    assertEquals(List.of(EARLIER), edit(list, doc("Milk")));
  }

  @Test
  void bodiesWithoutStoredTimesDateFromTheFallback() {
    assertEquals(List.of(EARLIER, EARLIER), LineAttribution.times(doc("A", "B"), null, EARLIER));
    assertEquals(List.of(EARLIER, NOW), LineAttribution.times(doc("A", "B!"), LineAttribution.next(doc("A", "B"), null, EARLIER, doc("A", "B!"), NOW), EARLIER));
  }

  @Test
  void storedTimesThatNoLongerMatchTheBodyAreIgnored() {
    String stamps = LineAttribution.fresh(doc("A"), NOW);
    assertEquals(List.of(EARLIER), LineAttribution.times(doc("B"), stamps, EARLIER));
    assertEquals(List.of(EARLIER), LineAttribution.times(doc("A"), "not json", EARLIER));
  }

  @Test
  void hugeRewritesStillKeepTheCommonHeadAndTail() {
    String[] before = IntStream.range(0, 3000).mapToObj(i -> "line " + i).toArray(String[]::new);
    String[] after = IntStream.range(0, 3000).mapToObj(i -> i == 0 || i == 2999 ? "line " + i : "changed " + i).toArray(String[]::new);
    List<Instant> times = edit(doc(before), doc(after));
    assertEquals(EARLIER, times.get(0));
    assertEquals(NOW, times.get(1500));
    assertEquals(EARLIER, times.get(2999));
  }

  @Test
  void bodiesPastTheLineCapReportNoLineTimes() {
    String[] tooMany = IntStream.range(0, LineAttribution.MAX_LINES + 1).mapToObj(i -> "l" + i).toArray(String[]::new);
    assertNull(LineAttribution.times(doc(tooMany), null, EARLIER));
    assertNull(LineAttribution.next(doc("A"), null, EARLIER, doc(tooMany), NOW));
    // Trimming back under the cap starts tracking again; the long body's lines date from the fallback.
    assertEquals(List.of(EARLIER, NOW), LineAttribution.times(doc("l0", "new"), LineAttribution.next(doc(tooMany), null, EARLIER, doc("l0", "new"), NOW), null));
  }

  @Test
  void lineTimesKeepTheDatabasePrecision() {
    Instant precise = Instant.parse("2026-10-08T13:34:00.123456789Z");
    assertEquals(List.of(Instant.parse("2026-10-08T13:34:00.123456Z")), LineAttribution.times(doc("A"), LineAttribution.fresh(doc("A"), precise), null));
    assertEquals(List.of(Instant.parse("2026-10-08T13:34:00.123456Z")), LineAttribution.times(doc("A"), null, precise));
  }

  @Test
  void rowsWithoutStoredTimesKeepThemThroughOtherChanges() {
    Note note = Note.imported(java.util.UUID.randomUUID(), null, null, null, null, "Old", doc("A", "B"), "A\nB", EARLIER, EARLIER);
    note.setPinned(true);
    note.setSortOrder(3);
    note.update("Renamed", doc("A", "B"), "A\nB");
    note.delete();
    note.restore();
    assertNotEquals(EARLIER, note.getUpdatedAt());
    assertEquals(List.of(EARLIER, EARLIER), note.getLineEdits());
    note.update("Renamed", doc("A", "B!"), "A\nB!");
    assertEquals(EARLIER, note.getLineEdits().get(0));
    assertNotEquals(EARLIER, note.getLineEdits().get(1));
  }

  @Test
  void notesAndCardsStampTheirBodies() {
    Note note = new Note(null, null, null, "Title", doc("A", "B"));
    List<Instant> created = note.getLineEdits();
    note.update("Renamed", doc("A", "B"), "A\nB");
    assertEquals(created, note.getLineEdits());
    note.update("Renamed", doc("A", "B!"), "A\nB!");
    assertEquals(created.get(0), note.getLineEdits().get(0));
    assertNotEquals(created.get(1), note.getLineEdits().get(1));

    BoardCard card = new BoardCard(null, null, 0);
    assertEquals(List.of(), card.getLineEdits());
    card.update("Card", doc("Step"), BoardPriority.MEDIUM, null, null);
    assertEquals(List.of(card.getUpdatedAt()), card.getLineEdits());
  }
}
