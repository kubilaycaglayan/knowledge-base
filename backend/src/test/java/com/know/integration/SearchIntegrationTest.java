package com.know.integration;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.web.server.LocalServerPort;

/** Global search (GET /api/v1/search) across every owned record type. */
class SearchIntegrationTest extends IntegrationTestSupport {
  @LocalServerPort int port;
  ApiClient api;
  String token;

  @BeforeEach
  void setUp() {
    api = new ApiClient(port);
    token = api.register();
  }

  // --- helpers -----------------------------------------------------------------------------------

  JsonNode search(String query) {
    return search(query, "");
  }

  JsonNode search(String query, String extra) {
    ApiClient.Reply reply = api.get("/api/v1/search?q=" + encode(query) + extra, token);
    assertEquals(200, reply.status(), reply.body());
    return reply.json();
  }

  static String encode(String value) {
    return URLEncoder.encode(value, StandardCharsets.UTF_8);
  }

  static JsonNode group(JsonNode response, String type) {
    for (JsonNode group : response.get("groups")) if (group.get("type").asText().equals(type)) return group;
    return null;
  }

  static List<String> ids(JsonNode response, String type) {
    JsonNode group = group(response, type);
    List<String> ids = new ArrayList<>();
    if (group != null) for (JsonNode result : group.get("results")) ids.add(result.get("id").asText());
    return ids;
  }

  static List<String> titles(JsonNode response, String type) {
    JsonNode group = group(response, type);
    List<String> titles = new ArrayList<>();
    if (group != null) for (JsonNode result : group.get("results")) titles.add(result.get("title").asText());
    return titles;
  }

  static JsonNode result(JsonNode response, String type, String id) {
    JsonNode group = group(response, type);
    assertNotNull(group, type + " group missing from " + response);
    for (JsonNode result : group.get("results")) if (result.get("id").asText().equals(id)) return result;
    fail(type + " " + id + " missing from " + response);
    return null;
  }

  static String json(String value) {
    return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t") + "\"";
  }

  static String doc(String... paragraphs) {
    StringBuilder out = new StringBuilder("{\"type\":\"doc\",\"content\":[");
    for (int i = 0; i < paragraphs.length; i++) {
      if (i > 0) out.append(',');
      out.append("{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":").append(json(paragraphs[i])).append("}]}");
    }
    return out.append("]}").toString();
  }

  String path(String name) {
    return path(name, null);
  }

  String path(String name, String description) {
    return api.created("POST", "/api/v1/paths", token,
            "{\"name\":" + json(name) + (description == null ? "" : ",\"description\":" + json(description)) + "}")
        .get("id").asText();
  }

  String label(String name) {
    return api.created("POST", "/api/v1/labels", token,
            "{\"name\":" + json(name) + ",\"scopes\":[\"NOTE\",\"TIME_ENTRY\",\"LOG\",\"BOARD\",\"CALENDAR\"]}")
        .get("id").asText();
  }

  String note(String title, String text) {
    return note(title, text, null, List.of());
  }

  String note(String title, String text, String pathId, List<String> tags) {
    StringBuilder body = new StringBuilder("{\"title\":").append(json(title))
        .append(",\"content\":").append(json(doc(text))).append(",\"contentText\":").append(json(text));
    if (pathId != null) body.append(",\"pathId\":").append(json(pathId));
    body.append(",\"tags\":[");
    for (int i = 0; i < tags.size(); i++) body.append(i > 0 ? "," : "").append(json(tags.get(i)));
    return api.created("POST", "/api/v1/notes", token, body.append("]}").toString()).get("id").asText();
  }

  String log(String body) {
    return log(body, "2026-09-01T09:00:00Z");
  }

  String log(String body, String occurredAt) {
    return api.created("POST", "/api/v1/logs", token,
            "{\"body\":" + json(body) + ",\"occurredAt\":" + json(occurredAt) + "}")
        .get("id").asText();
  }

  String session(String pathId, String description, List<String> labelIds) {
    return session(pathId, description, labelIds, "2026-09-01T09:00:00Z", "2026-09-01T10:00:00Z");
  }

  String session(String pathId, String description, List<String> labelIds, String start, String end) {
    StringBuilder labels = new StringBuilder("[");
    for (int i = 0; i < labelIds.size(); i++) labels.append(i > 0 ? "," : "").append(json(labelIds.get(i)));
    return api.created("POST", "/api/v1/time-entries", token,
            "{" + (pathId == null ? "" : "\"pathId\":" + json(pathId) + ",") + "\"labelIds\":" + labels + "]"
                + (description == null ? "" : ",\"description\":" + json(description))
                + ",\"startedAt\":" + json(start) + ",\"endedAt\":" + json(end) + "}")
        .get("id").asText();
  }

  String board(String name) {
    return api.created("POST", "/api/v1/boards", token, "{\"name\":" + json(name) + "}").get("id").asText();
  }

  String card(String boardId, String title, String body) {
    return api.created("POST", "/api/v1/boards/" + boardId + "/cards", token,
            "{\"title\":" + json(title) + (body == null ? "" : ",\"body\":" + json(body)) + "}")
        .get("id").asText();
  }

  void calendarDay(String date, String note, List<String> labelIds) {
    StringBuilder labels = new StringBuilder("[");
    for (int i = 0; i < labelIds.size(); i++)
      labels.append(i > 0 ? "," : "").append("{\"labelId\":").append(json(labelIds.get(i))).append("}");
    api.created("PUT", "/api/v1/calendar/days/" + date, token,
        "{\"note\":" + (note == null ? "null" : json(note)) + ",\"labels\":" + labels + "]}");
  }

  // --- coverage ----------------------------------------------------------------------------------

  @Test
  void findsEveryRecordTypeByItsOwnText() {
    String pathId = path("Zephyr path", "Learning the zephyr toolkit");
    String labelId = label("Zephyr label");
    String noteId = note("Zephyr note", "Notes about zephyr winds");
    String logId = log("Zephyr log entry\nSecond line about zephyr");
    String sessionId = session(null, "Zephyr session", List.of());
    String boardId = board("Zephyr board");
    String cardId = card(boardId, "Zephyr card", doc("Card body"));
    calendarDay("2026-09-03", "Zephyr calendar note", List.of());

    JsonNode response = search("zephyr", "&limit=10");
    assertTrue(ids(response, "PATH").contains(pathId));
    assertTrue(ids(response, "LABEL").contains(labelId));
    assertTrue(ids(response, "NOTE").contains(noteId));
    assertTrue(ids(response, "LOG").contains(logId));
    assertTrue(ids(response, "SESSION").contains(sessionId));
    assertTrue(ids(response, "BOARD").contains(boardId));
    assertTrue(ids(response, "CARD").contains(cardId));
    assertEquals(List.of("2026-09-03"), titles(response, "CALENDAR_DAY"));

    JsonNode card = result(response, "CARD", cardId);
    assertEquals(boardId, card.get("boardId").asText());
    assertEquals("Zephyr board", card.get("boardName").asText());
    assertEquals("Backlog", card.get("statusName").asText());
    assertFalse(card.get("archived").asBoolean());
    assertTrue(card.get("via").isNull());

    JsonNode log = result(response, "LOG", logId);
    assertEquals("Zephyr log entry", log.get("title").asText());
    assertEquals("Zephyr log entry Second line about zephyr", log.get("snippet").asText());
    assertEquals("2026-09-01T09:00:00Z", log.get("at").asText());

    JsonNode day = group(response, "CALENDAR_DAY").get("results").get(0);
    assertEquals("2026-09-03", day.get("date").asText());
    assertEquals("Zephyr calendar note", day.get("snippet").asText());

    JsonNode session = result(response, "SESSION", sessionId);
    assertEquals("Zephyr session", session.get("title").asText());
    assertEquals(3600, session.get("durationSeconds").asLong());
    assertEquals("2026-09-01T10:00:00Z", session.get("endedAt").asText());

    JsonNode path = result(response, "PATH", pathId);
    assertEquals("Learning the zephyr toolkit", path.get("snippet").asText());
    assertTrue(path.get("color").asText().startsWith("#"));
  }

  @Test
  void otherUsersNeverSeeTheResults() {
    String marker = "isolated" + UUID.randomUUID().toString().replace("-", "");
    note(marker, marker);
    log(marker);
    path(marker);
    label(marker);
    // The path brings its own board along.
    assertEquals(5, search(marker).get("groups").size());

    token = api.register();
    assertEquals(0, search(marker).get("groups").size());
    // Near misses of the owner's words don't reach across users either.
    assertEquals(0, search(marker.substring(0, marker.length() - 1) + "x").get("groups").size());
  }

  @Test
  void blankQueriesReturnNothingAndAnUnauthenticatedCallIsRefused() {
    note("Anything", "Anything at all");
    assertEquals(0, search("   ").get("groups").size());
    assertEquals(0, search("").get("groups").size());
    assertEquals(401, api.get("/api/v1/search?q=anything", null).status());
  }

  @Test
  void bodiesMatchAsWellAsTitlesAndCardJsonKeysNeverMatch() {
    String boardId = board("Body board");
    String cardId = card(boardId, "Plain title", doc("The quokka hides in the second line"));
    String noteId = note("Another title", "A quokka in the note body");

    JsonNode response = search("quokka");
    assertEquals(List.of(cardId), ids(response, "CARD"));
    assertEquals(List.of(noteId), ids(response, "NOTE"));
    assertEquals("The quokka hides in the second line", result(response, "CARD", cardId).get("snippet").asText());

    // The rich-text JSON of the body is not searched, only its text.
    for (String key : List.of("paragraph", "content", "type", "doc", "text", "{"))
      assertFalse(ids(search(key), "CARD").contains(cardId), key);
  }

  @Test
  void cardBodyTextFollowsEdits() {
    String boardId = board("Edit board");
    String cardId = card(boardId, "Editable", doc("Original walrus"));
    assertEquals(List.of(cardId), ids(search("walrus"), "CARD"));
    api.created("PUT", "/api/v1/boards/" + boardId + "/cards/" + cardId, token,
        "{\"title\":\"Editable\",\"body\":" + json(doc("Replaced narwhal")) + "}");
    assertTrue(ids(search("walrus"), "CARD").isEmpty());
    assertEquals(List.of(cardId), ids(search("narwhal"), "CARD"));
  }

  // --- matching ----------------------------------------------------------------------------------

  @Test
  void matchingIsCaseInsensitiveAndFindsWordParts() {
    String noteId = note("Kubernetes Operators", "Reconcile loops");
    assertEquals(List.of(noteId), ids(search("KUBER"), "NOTE"));
    assertEquals(List.of(noteId), ids(search("netes oper"), "NOTE"));
    assertEquals(List.of(noteId), ids(search("ConCILE"), "NOTE"));
  }

  @Test
  void nearMissSpellingsMatchLongerTermsWhenNothingMatchesLiterally() {
    String noteId = note("Kubernetes cluster upgrade", "Steps");
    String logId = log("Practised photography at dusk");
    JsonNode typo = search("kubernets");
    assertTrue(typo.get("fuzzy").asBoolean());
    assertEquals(List.of(noteId), ids(typo, "NOTE"));
    assertEquals(List.of(logId), ids(search("photografy"), "LOG"));
    assertEquals(List.of(logId), ids(search("photograpy"), "LOG"));
    // Swapped letters in the middle of a word break too many trigrams.
    assertTrue(ids(search("kuberentes"), "NOTE").isEmpty());
    // Literal matches are not flagged as near misses.
    JsonNode literal = search("kub");
    assertFalse(literal.get("fuzzy").asBoolean());
    assertTrue(ids(literal, "NOTE").contains(noteId));
    // A slip in a term shorter than four characters is not enough to match.
    JsonNode tooShort = search("kbu");
    assertEquals(0, tooShort.get("groups").size());
    assertFalse(tooShort.get("fuzzy").asBoolean());
    // Unrelated words don't match, and an empty answer isn't flagged as near misses.
    JsonNode unrelated = search("giraffe");
    assertEquals(0, unrelated.get("groups").size());
    assertFalse(unrelated.get("fuzzy").asBoolean());
    assertFalse(unrelated.get("incomplete").asBoolean());
  }

  @Test
  void literalMatchesAnywhereKeepNearMissesOut() {
    String exact = note("Kubernetes", "x");
    String misspelt = log("Notes on kubernets setup");
    JsonNode correct = search("kubernetes");
    assertFalse(correct.get("fuzzy").asBoolean());
    assertEquals(List.of(exact), ids(correct, "NOTE"));
    assertTrue(ids(correct, "LOG").isEmpty(), "the misspelt log is only a near miss");
    // Asking for near misses explicitly includes both.
    JsonNode both = search("kubernetes", "&fuzzy=true");
    assertTrue(both.get("fuzzy").asBoolean());
    assertEquals(List.of(exact), ids(both, "NOTE"));
    assertEquals(List.of(misspelt), ids(both, "LOG"));
    // And fuzzy=false never falls back.
    assertEquals(0, search("kubernetez", "&fuzzy=false").get("groups").size());
  }

  @Test
  void laterPagesFollowTheModeOfTheFirstPage() {
    List<String> created = new ArrayList<>();
    for (int i = 0; i < 4; i++)
      created.add(0, log("Saxophone practice " + i, "2026-09-01T09:0" + i + ":00Z"));
    JsonNode first = search("saxophome", "&limit=2");
    assertTrue(first.get("fuzzy").asBoolean());
    assertEquals(created.subList(0, 2), ids(first, "LOG"));
    assertEquals(created.subList(2, 4), ids(search("saxophome", "&types=LOG&limit=2&offset=2&fuzzy=true"), "LOG"));
    // Without the mode, a later page is literal and doesn't silently switch.
    assertEquals(0, search("saxophome", "&types=LOG&limit=2&offset=2").get("groups").size());
  }

  @Test
  void everyTermMustMatchSomewhere() {
    String both = note("Alpha project", "beta release notes");
    String alphaOnly = note("Alpha only", "nothing else");
    note("Gamma", "beta only");
    JsonNode response = search("alpha beta");
    assertEquals(List.of(both), ids(response, "NOTE"));
    assertTrue(ids(search("alpha"), "NOTE").containsAll(List.of(both, alphaOnly)));
    // Extra whitespace and repeated terms change nothing.
    assertEquals(List.of(both), ids(search("  alpha   BETA alpha "), "NOTE"));
  }

  @Test
  void likeWildcardsAreLiteral() {
    String percent = note("Discount 100% off", "deal");
    note("Discount ten off", "deal");
    String underscore = note("snake_case naming", "style");
    note("snakeXcase naming", "style");
    String backslash = note("C:\\temp folder", "windows");
    assertEquals(List.of(percent), ids(search("100%"), "NOTE"));
    assertEquals(List.of(percent), ids(search("%"), "NOTE"));
    assertEquals(List.of(underscore), ids(search("_"), "NOTE"));
    assertEquals(List.of(underscore), ids(search("snake_case"), "NOTE"));
    assertEquals(List.of(backslash), ids(search("c:\\temp"), "NOTE"));
  }

  @Test
  void sqlLikeInputIsHandledAsPlainText() {
    String noteId = note("Robert'); drop table note;--", "little bobby");
    assertEquals(List.of(noteId), ids(search("'); drop table"), "NOTE"));
    assertEquals(0, search("' or 1=1 --").get("groups").size());
    assertEquals(List.of(noteId), ids(search("bobby"), "NOTE"));
  }

  @Test
  void unicodeTextMatchesCaseInsensitively() {
    String noteId = note("Über café notes 🎉", "Ünïcödé body");
    assertEquals(List.of(noteId), ids(search("über"), "NOTE"));
    assertEquals(List.of(noteId), ids(search("CAFÉ"), "NOTE"));
    assertEquals(List.of(noteId), ids(search("🎉"), "NOTE"));
    assertEquals(List.of(noteId), ids(search("ünïcödé"), "NOTE"));
  }

  // --- matches through paths and labels ----------------------------------------------------------

  @Test
  void recordsMatchThroughTheirPathAndLabels() {
    String pathId = path("Photography");
    String labelId = label("Deepwork");
    String sessionId = session(pathId, "Edited shots", List.of());
    String labelledSession = session(null, "Morning focus", List.of(labelId));
    String logId = log("Wrote two pages");
    api.created("PUT", "/api/v1/logs/" + logId + "/labels", token, "{\"labelIds\":[" + json(labelId) + "]}");
    String noteId = note("Lens list", "Primes", pathId, List.of("Deepwork"));
    String boardId = board("Studio");
    String cardId = card(boardId, "Print portfolio", null);
    api.created("PUT", "/api/v1/boards/" + boardId + "/cards/" + cardId, token,
        "{\"title\":\"Print portfolio\",\"pathIds\":[" + json(pathId) + "],\"labelIds\":[" + json(labelId) + "]}");
    calendarDay("2026-09-05", null, List.of(labelId));

    JsonNode byPath = search("photography", "&limit=10");
    assertTrue(ids(byPath, "PATH").contains(pathId));
    JsonNode session = result(byPath, "SESSION", sessionId);
    assertEquals("PATH", session.get("via").asText());
    assertEquals("Photography", session.get("viaName").asText());
    assertEquals("Photography", session.get("pathName").asText());
    assertEquals(pathId, session.get("pathId").asText());
    assertEquals("PATH", result(byPath, "NOTE", noteId).get("via").asText());
    assertEquals("PATH", result(byPath, "CARD", cardId).get("via").asText());
    // The path's own board matches by its name, which follows the path.
    assertFalse(ids(byPath, "BOARD").isEmpty());

    JsonNode byLabel = search("deepwork", "&limit=10");
    assertEquals(List.of(labelId), ids(byLabel, "LABEL"));
    assertEquals(List.of(labelledSession), ids(byLabel, "SESSION"));
    assertEquals("LABEL", result(byLabel, "LOG", logId).get("via").asText());
    assertEquals("Deepwork", result(byLabel, "LOG", logId).get("viaName").asText());
    assertEquals("LABEL", result(byLabel, "NOTE", noteId).get("via").asText());
    assertEquals("LABEL", result(byLabel, "CARD", cardId).get("via").asText());
    JsonNode day = group(byLabel, "CALENDAR_DAY").get("results").get(0);
    assertEquals("2026-09-05", day.get("date").asText());
    assertEquals("LABEL", day.get("via").asText());
    assertTrue(day.get("snippet").isNull());

    // A near miss of the label name still finds the labelled records.
    assertTrue(ids(search("depwork"), "LOG").contains(logId));
    // One term may match the label while another matches the record's own text.
    assertEquals(List.of(logId), ids(search("deepwork pages"), "LOG"));
    assertTrue(ids(search("deepwork absent"), "LOG").isEmpty());
  }

  @Test
  void directMatchesRankAboveMatchesThroughALabel() {
    String labelId = label("Rust");
    String labelled = log("Borrow checker practice");
    api.created("PUT", "/api/v1/logs/" + labelled + "/labels", token, "{\"labelIds\":[" + json(labelId) + "]}");
    String direct = log("Rust ownership notes", "2026-01-01T00:00:00Z");
    JsonNode response = search("rust");
    assertEquals(List.of(direct, labelled), ids(response, "LOG"));
    assertTrue(result(response, "LOG", direct).get("via").isNull());
    assertEquals("LABEL", result(response, "LOG", labelled).get("via").asText());
  }

  @Test
  void anotherUsersLabelOrPathNeverCausesAMatch() {
    String marker = "foreign" + UUID.randomUUID().toString().substring(0, 8);
    String mine = log("Plain entry");
    String myToken = token;
    token = api.register();
    label(marker);
    path(marker);
    token = myToken;
    assertTrue(ids(search(marker), "LOG").isEmpty());
    assertFalse(ids(search("plain"), "LOG").isEmpty());
    assertEquals(List.of(mine), ids(search("plain"), "LOG"));
  }

  // --- archived and removed records --------------------------------------------------------------

  @Test
  void archivedRecordsAreIncludedAndFlagged() {
    String active = note("Archive test active", "body");
    String archived = note("Archive test archived", "body");
    assertEquals(204, api.delete("/api/v1/notes/" + archived, token).status());

    String boardId = board("Archive test board");
    String archivedCard = card(boardId, "Archive test card", null);
    api.created("POST", "/api/v1/boards/" + boardId + "/cards/" + archivedCard + "/archive", token, null);
    String otherBoard = board("Archive test shelf");
    String cardOnArchivedBoard = card(otherBoard, "Archive test shelved card", null);
    api.created("POST", "/api/v1/boards/" + otherBoard + "/archive", token, null);

    JsonNode response = search("archive test", "&limit=10");
    assertFalse(result(response, "NOTE", active).get("archived").asBoolean());
    assertTrue(result(response, "NOTE", archived).get("archived").asBoolean());
    assertTrue(result(response, "CARD", archivedCard).get("archived").asBoolean());
    assertTrue(result(response, "CARD", cardOnArchivedBoard).get("archived").asBoolean());
    assertTrue(result(response, "BOARD", otherBoard).get("archived").asBoolean());
    assertFalse(result(response, "BOARD", boardId).get("archived").asBoolean());
  }

  @Test
  void deletedSessionsAndPathsAreLeftOut() {
    String pathId = path("Removed pathway");
    String sessionId = session(pathId, "Removed pathway practice", List.of());
    assertEquals(3, search("removed pathway").get("groups").size()); // path, its board, session
    assertEquals(204, api.delete("/api/v1/time-entries/" + sessionId, token).status());
    assertEquals(204, api.delete("/api/v1/paths/" + pathId, token).status());
    JsonNode response = search("removed pathway");
    assertTrue(ids(response, "PATH").isEmpty());
    assertTrue(ids(response, "SESSION").isEmpty());
    assertTrue(ids(response, "BOARD").isEmpty(), "a deleted path's board is gone with it");
  }

  @Test
  void deletedLogsDisappear() {
    String logId = log("Ephemeral thought");
    assertEquals(List.of(logId), ids(search("ephemeral"), "LOG"));
    assertEquals(204, api.delete("/api/v1/logs/" + logId, token).status());
    assertEquals(0, search("ephemeral").get("groups").size());
  }

  // --- ranking and paging ------------------------------------------------------------------------

  @Test
  void titlesRankExactThenPrefixThenContainedThenBody() {
    String body = note("Unrelated", "mentions orbit in passing");
    String contained = note("Low orbit", "x");
    String prefix = note("Orbital mechanics", "x");
    String exact = note("Orbit", "x");
    assertEquals(List.of(exact, prefix, contained, body), ids(search("orbit", "&limit=10"), "NOTE"));
  }

  @Test
  void equalMatchesRankMostRecentFirst() {
    String older = log("Tide reading", "2026-01-01T09:00:00Z");
    String newer = log("Tide reading", "2026-06-01T09:00:00Z");
    String newest = log("Tide reading", "2026-09-01T09:00:00Z");
    assertEquals(List.of(newest, newer, older), ids(search("tide"), "LOG"));
  }

  @Test
  void phraseMatchesRankAboveScatteredTerms() {
    String scattered = note("Machine shop", "learning to weld");
    String phrase = note("Machine learning basics", "x");
    assertEquals(List.of(phrase, scattered), ids(search("machine learning"), "NOTE"));
  }

  @Test
  void groupsAreLimitedAndPagedWithATotal() {
    List<String> created = new ArrayList<>();
    for (int i = 0; i < 12; i++) created.add(0, log("Pager entry " + i, "2026-09-01T09:" + String.format("%02d", i) + ":00Z"));
    JsonNode first = search("pager");
    JsonNode group = group(first, "LOG");
    assertEquals(12, group.get("total").asLong());
    assertFalse(group.get("capped").asBoolean());
    assertEquals(created.subList(0, 5), ids(first, "LOG"));

    JsonNode second = search("pager", "&types=LOG&limit=5&offset=5");
    assertEquals(created.subList(5, 10), ids(second, "LOG"));
    assertEquals(12, group(second, "LOG").get("total").asLong());
    assertEquals(1, second.get("groups").size());

    assertEquals(created.subList(10, 12), ids(search("pager", "&types=log&limit=50&offset=10"), "LOG"));
    assertEquals(0, search("pager", "&types=LOG&offset=40").get("groups").size());
  }

  @Test
  void totalsAreCappedAtTheCandidateLimit() {
    for (int i = 0; i < 1003; i++) log("Capped entry " + i, java.time.Instant.parse("2026-01-01T00:00:00Z").plusSeconds(i).toString());
    JsonNode group = group(search("capped entry"), "LOG");
    assertEquals(1000, group.get("total").asLong());
    assertTrue(group.get("capped").asBoolean());
    assertEquals("Capped entry 1002", group.get("results").get(0).get("title").asText());
  }

  @Test
  void typesFilterNarrowsTheGroups() {
    note("Filter marker", "x");
    log("Filter marker");
    path("Filter marker");
    JsonNode response = search("filter marker", "&types=NOTE,%20path");
    List<String> types = new ArrayList<>();
    response.get("groups").forEach(group -> types.add(group.get("type").asText()));
    assertEquals(2, types.size());
    assertTrue(types.containsAll(List.of("NOTE", "PATH")));
  }

  @Test
  void groupsWithTheStrongestMatchComeFirst() {
    note("Mentions a heron in passing", "x");
    path("Heron");
    JsonNode response = search("heron");
    assertEquals("PATH", response.get("groups").get(0).get("type").asText());
  }

  // --- presentation ------------------------------------------------------------------------------

  @Test
  void snippetsCentreOnTheFirstMatchOfLongText() {
    String filler = "lorem ipsum dolor sit amet ".repeat(20);
    String noteId = note("Long note", filler + "the platypus appears here " + filler);
    String snippet = result(search("platypus"), "NOTE", noteId).get("snippet").asText();
    assertTrue(snippet.startsWith("…"), snippet);
    assertTrue(snippet.endsWith("…"), snippet);
    assertTrue(snippet.contains("the platypus appears here"), snippet);
    assertTrue(snippet.length() <= 162, snippet.length() + ": " + snippet);
  }

  @Test
  void untitledAndEmptyRecordsGetReadableTitles() {
    String pathId = path("Untitled marker path");
    String sessionId = session(pathId, null, List.of());
    JsonNode session = result(search("untitled marker"), "SESSION", sessionId);
    assertEquals("Untitled marker path", session.get("title").asText());
    assertEquals("PATH", session.get("via").asText());

    String noteId = note("", "a body with a capybara");
    assertEquals("Untitled note", result(search("capybara"), "NOTE", noteId).get("title").asText());

    String logId = log("\n\n   \nCormorant sighting after blank lines");
    assertEquals("Cormorant sighting after blank lines", result(search("cormorant"), "LOG", logId).get("title").asText());
  }

  @Test
  void longTitlesAreClipped() {
    String noteId = note("Albatross " + "x".repeat(200), "body");
    String clipped = result(search("albatross"), "NOTE", noteId).get("title").asText();
    assertTrue(clipped.length() <= 120, clipped);
    assertTrue(clipped.endsWith("…"));
  }

  // --- validation --------------------------------------------------------------------------------

  @Test
  void invalidParametersAreRejected() {
    assertEquals(400, api.get("/api/v1/search?q=" + "x".repeat(201), token).status());
    assertEquals(200, api.get("/api/v1/search?q=" + "x".repeat(200), token).status());
    assertEquals(400, api.get("/api/v1/search", token).status());
    assertEquals(400, api.get("/api/v1/search?q=a&limit=0", token).status());
    assertEquals(400, api.get("/api/v1/search?q=a&limit=51", token).status());
    assertEquals(400, api.get("/api/v1/search?q=a&limit=abc", token).status());
    assertEquals(400, api.get("/api/v1/search?q=a&offset=-1", token).status());
    assertEquals(400, api.get("/api/v1/search?q=a&offset=1001", token).status());
    assertEquals(400, api.get("/api/v1/search?q=a&types=NOTE,BOGUS", token).status());
    assertEquals(200, api.get("/api/v1/search?q=a&types=,NOTE,", token).status());
  }

  @Test
  void manyTermsAreCappedRatherThanRejected() {
    String noteId = note("one two three four five six seven eight", "x");
    // Terms past the eighth are ignored.
    assertEquals(List.of(noteId), ids(search("one two three four five six seven eight nine ten"), "NOTE"));
  }
}
