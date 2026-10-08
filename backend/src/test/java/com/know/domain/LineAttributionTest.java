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
