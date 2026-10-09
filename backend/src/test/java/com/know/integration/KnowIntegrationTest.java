package com.know.integration;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doReturn;

import com.know.domain.BoardCardRepository;
import com.know.domain.BoardStatusRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.know.realtime.TimerWebSocketHandler;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.nio.ByteBuffer;
import java.util.Base64;
import java.time.Instant;
import java.time.Clock;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.springframework.scheduling.config.FixedRateTask;
import org.springframework.scheduling.config.ScheduledTaskHolder;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Full integration test suite.
 *
 * <p>Each test registers a fresh user so tests are independent and can run in any order. Covers the
 * product behaviors covered by this integration suite.
 */
class KnowIntegrationTest extends IntegrationTestSupport {

  private static String quote(String value) {
    return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
  }

  private static String csvRow(String entity, UUID id, String payload) {
    return entity + "," + id + ",\"" + payload.replace("\"", "\"\"") + "\"\n";
  }

  // Infrastructure

  @LocalServerPort int port;

  @Autowired TestRestTemplate rest;

  @Autowired ObjectMapper mapper;

  @Autowired JdbcTemplate jdbc;

  @Autowired TimerWebSocketHandler timerSockets;

  @Autowired ScheduledTaskHolder scheduledTasks;

  @MockBean Clock clock;

  @Autowired BoardCardRepository boardCards;

  @Autowired BoardStatusRepository boardStatuses;

  String base;

  @BeforeEach
  void setUp() {
    base = "http://localhost:" + port;
    doAnswer(invocation -> Instant.now()).when(clock).instant();
    doReturn(ZoneOffset.UTC).when(clock).getZone();
  }

  // Helpers

  /** Register a user and return their JWT bearer token. */
  String registerAndLogin(String email, String password) {
    String body = json("email", email, "password", password);
    ResponseEntity<JsonNode> res = post("/api/v1/auth/register", null, body);
    if (res.getStatusCode() == HttpStatus.CONFLICT) {
      res = post("/api/v1/auth/login", null, body);
    }
    assertEquals(HttpStatus.OK, res.getStatusCode(), "Login/register failed: " + res.getBody());
    return res.getBody().get("token").asText();
  }

  String freshToken() {
    String u = UUID.randomUUID() + "@test.example";
    return registerAndLogin(u, "SecurePassword123!");
  }

  String json(String... kvPairs) {
    StringBuilder sb = new StringBuilder("{");
    for (int i = 0; i < kvPairs.length; i += 2) {
      if (i > 0) sb.append(',');
      sb.append('"')
          .append(kvPairs[i])
          .append('"')
          .append(':')
          .append('"')
          .append(kvPairs[i + 1])
          .append('"');
    }
    return sb.append('}').toString();
  }

  HttpHeaders bearer(String token) {
    HttpHeaders h = new HttpHeaders();
    h.setContentType(MediaType.APPLICATION_JSON);
    if (token != null) h.setBearerAuth(token);
    return h;
  }

  ResponseEntity<JsonNode> post(String path, String token, String body) {
    return rest.exchange(
        base + path, HttpMethod.POST, new HttpEntity<>(body, bearer(token)), JsonNode.class);
  }

  ResponseEntity<JsonNode> put(String path, String token, String body) {
    return rest.exchange(
        base + path, HttpMethod.PUT, new HttpEntity<>(body, bearer(token)), JsonNode.class);
  }

  ResponseEntity<JsonNode> patch(String path, String token, String body) {
    return rest.exchange(
        base + path, HttpMethod.PATCH, new HttpEntity<>(body, bearer(token)), JsonNode.class);
  }

  ResponseEntity<JsonNode> get(String path, String token) {
    return rest.exchange(
        base + path, HttpMethod.GET, new HttpEntity<>(bearer(token)), JsonNode.class);
  }

  ResponseEntity<JsonNode> delete(String path, String token) {
    return rest.exchange(
        base + path, HttpMethod.DELETE, new HttpEntity<>(bearer(token)), JsonNode.class);
  }

  ResponseEntity<JsonNode> importCsv(String token, String csv) {
    HttpHeaders headers = bearer(token);
    headers.setContentType(MediaType.parseMediaType("text/csv"));
    return rest.exchange(
        base + "/api/v1/imports/knowledge-base",
        HttpMethod.POST,
        new HttpEntity<>(csv, headers),
        JsonNode.class);
  }

  ResponseEntity<String> exportCsv(String token) {
    return rest.exchange(
        base + "/api/v1/imports/knowledge-base/export",
        HttpMethod.GET,
        new HttpEntity<>(bearer(token)),
        String.class);
  }

  @Test
  void ganttReturnsDatedCardsWithOpenViewDisabled() {
    String token = freshToken();
    ResponseEntity<JsonNode> board = post("/api/v1/boards", token, json("name", "Gantt integration"));
    assertEquals(HttpStatus.CREATED, board.getStatusCode());
    String boardId = board.getBody().get("id").asText();

    ResponseEntity<JsonNode> card = post("/api/v1/boards/" + boardId + "/cards", token,
        "{\"title\":\"Timeline card\",\"body\":\"{}\",\"priority\":\"MEDIUM\",\"startDate\":\"2026-09-22\",\"dueDate\":\"2026-09-24\"}");
    assertEquals(HttpStatus.CREATED, card.getStatusCode());

    ResponseEntity<JsonNode> gantt = get("/api/v1/boards/" + boardId + "/gantt?from=2026-09-22&to=2026-09-24", token);
    assertEquals(HttpStatus.OK, gantt.getStatusCode());
    assertEquals("Timeline card", gantt.getBody().get(0).get("title").asText());
  }

  @Test
  void boardCardsAcceptMultiplePathsAndBoardScopedLabels() {
    String token = freshToken();
    String boardId = post("/api/v1/boards", token, json("name", "Relationships"))
        .getBody().get("id").asText();
    String firstPath = post("/api/v1/paths", token, "{\"name\":\"One\"}")
        .getBody().get("id").asText();
    String secondPath = post("/api/v1/paths", token, "{\"name\":\"Two\"}")
        .getBody().get("id").asText();
    String labelId = post("/api/v1/labels", token,
        "{\"name\":\"Board label\",\"scopes\":[\"BOARD\"]}")
        .getBody().get("id").asText();

    ResponseEntity<JsonNode> card = post("/api/v1/boards/" + boardId + "/cards", token,
        "{\"title\":\"Linked card\",\"pathIds\":[\"" + firstPath + "\",\"" + secondPath
            + "\"],\"labelIds\":[\"" + labelId + "\"]}");

    assertEquals(HttpStatus.CREATED, card.getStatusCode());
    assertEquals(2, card.getBody().get("pathIds").size());
    assertEquals(labelId, card.getBody().get("labelIds").get(0).asText());
    assertEquals("Board label", get("/api/v1/labels?scope=BOARD", token).getBody().get(0).get("name").asText());
  }

  /**
   * Archiving and restoring must return the card view over a real persistence
   * context. CardView reads the lazy paths and labels collections, so an endpoint
   * without a transaction fails here even though a mocked-repository web test
   * passes, because mocked entities never lazy-load.
   */
  @Test
  void archivingAndRestoringACardReturnsItsRelationships() {
    String token = freshToken();
    String boardId = post("/api/v1/boards", token, json("name", "Archive round trip"))
        .getBody().get("id").asText();
    String pathId = post("/api/v1/paths", token, "{\"name\":\"Archive path\"}")
        .getBody().get("id").asText();
    String labelId = post("/api/v1/labels", token,
        "{\"name\":\"Archive label\",\"scopes\":[\"BOARD\"]}")
        .getBody().get("id").asText();
    String cardId = post("/api/v1/boards/" + boardId + "/cards", token,
        "{\"title\":\"Archivable\",\"pathIds\":[\"" + pathId + "\"],\"labelIds\":[\"" + labelId + "\"]}")
        .getBody().get("id").asText();

    ResponseEntity<JsonNode> archived =
        post("/api/v1/boards/" + boardId + "/cards/" + cardId + "/archive", token, null);
    assertEquals(HttpStatus.OK, archived.getStatusCode());
    assertTrue(archived.getBody().get("archived").asBoolean());
    assertEquals(pathId, archived.getBody().get("pathIds").get(0).asText());
    assertEquals(labelId, archived.getBody().get("labelIds").get(0).asText());

    assertEquals(1, get("/api/v1/boards/" + boardId + "/cards?archived=true", token).getBody().size());

    ResponseEntity<JsonNode> restored =
        post("/api/v1/boards/" + boardId + "/cards/" + cardId + "/restore", token, null);
    assertEquals(HttpStatus.OK, restored.getStatusCode());
    assertFalse(restored.getBody().get("archived").asBoolean());
    assertEquals(pathId, restored.getBody().get("pathIds").get(0).asText());
  }

  @Test
  void ganttExcludesCardsInArchivedStatuses() {
    String token = freshToken();
    ResponseEntity<JsonNode> board = post("/api/v1/boards", token, json("name", "Archived status Gantt"));
    String boardId = board.getBody().get("id").asText();
    ResponseEntity<JsonNode> card = post("/api/v1/boards/" + boardId + "/cards", token,
        "{\"title\":\"Hidden timeline card\",\"body\":\"{}\",\"priority\":\"MEDIUM\",\"startDate\":\"2026-09-22\",\"dueDate\":\"2026-09-24\"}");
    UUID cardId = UUID.fromString(card.getBody().get("id").asText());
    UUID statusId = UUID.fromString(card.getBody().get("statusId").asText());
    var archivedStatus = boardStatuses.findById(statusId).orElseThrow();
    archivedStatus.archive();
    boardStatuses.save(archivedStatus);
    boardStatuses.flush();
    boardCards.findById(cardId).orElseThrow().move(statusId, 0);
    boardCards.flush();

    ResponseEntity<JsonNode> gantt = get("/api/v1/boards/" + boardId + "/gantt?from=2026-09-22&to=2026-09-24", token);

    assertEquals(HttpStatus.OK, gantt.getStatusCode());
    assertTrue(gantt.getBody().isEmpty());
  }

  @Test
  void archivedBoardsAreRetainedReadOnlyAndArchiveRestoreIsIdempotent() {
    String token = freshToken();
    ResponseEntity<JsonNode> created = post("/api/v1/boards", token, json("name", "Retained board"));
    assertEquals(HttpStatus.CREATED, created.getStatusCode());
    String boardId = created.getBody().get("id").asText();

    assertEquals(HttpStatus.OK, post("/api/v1/boards/" + boardId + "/archive", token, "{}").getStatusCode());
    assertEquals(HttpStatus.OK, post("/api/v1/boards/" + boardId + "/archive", token, "{}").getStatusCode());
    assertEquals(HttpStatus.CONFLICT, post("/api/v1/boards/" + boardId + "/cards", token, "{\"title\":\"blocked\"}").getStatusCode());

    ResponseEntity<JsonNode> archived = get("/api/v1/boards?archived=true", token);
    assertEquals(HttpStatus.OK, archived.getStatusCode());
    assertTrue(archived.getBody().findValuesAsText("id").contains(boardId));

    assertEquals(HttpStatus.OK, post("/api/v1/boards/" + boardId + "/restore", token, "{}").getStatusCode());
    assertEquals(HttpStatus.OK, post("/api/v1/boards/" + boardId + "/restore", token, "{}").getStatusCode());
  }

  // Criteria: password-hashed registration / login and JWT auth

  @Test
  void registrationCreatesUserAndLoginReturnsJwt() {
    String email = UUID.randomUUID() + "@integration.test";
    String pw = "MyStr0ngPassword!";

    ResponseEntity<JsonNode> reg =
        post("/api/v1/auth/register", null, json("email", email, "password", pw));
    assertEquals(HttpStatus.OK, reg.getStatusCode());
    assertNotNull(reg.getBody().get("token").asText());
    assertFalse(reg.getBody().get("userId").asText().isBlank());

    // Duplicate registration is rejected
    ResponseEntity<JsonNode> dup =
        post("/api/v1/auth/register", null, json("email", email, "password", pw));
    assertEquals(HttpStatus.CONFLICT, dup.getStatusCode());

    // Login succeeds
    ResponseEntity<JsonNode> login =
        post("/api/v1/auth/login", null, json("email", email, "password", pw));
    assertEquals(HttpStatus.OK, login.getStatusCode());
    assertNotNull(login.getBody().get("token").asText());

    // Wrong password is rejected
    ResponseEntity<JsonNode> bad =
        post("/api/v1/auth/login", null, json("email", email, "password", "WrongPassword!"));
    assertEquals(HttpStatus.UNAUTHORIZED, bad.getStatusCode());
  }

  @Test
  void unauthenticatedRequestsAreRejected() {
    assertEquals(HttpStatus.UNAUTHORIZED, get("/api/v1/paths", null).getStatusCode());
    assertEquals(HttpStatus.UNAUTHORIZED, get("/api/v1/notes", null).getStatusCode());
    assertEquals(HttpStatus.UNAUTHORIZED, get("/api/v1/timers/current", null).getStatusCode());
  }

  @Test
  void emailUniquenessIsCaseInsensitive() {
    String base = UUID.randomUUID().toString();
    String lower = base + "@example.com";
    String upper = base.toUpperCase() + "@EXAMPLE.COM";
    post("/api/v1/auth/register", null, json("email", lower, "password", "SecurePassword123!"));
    ResponseEntity<JsonNode> dup =
        post("/api/v1/auth/register", null, json("email", upper, "password", "SecurePassword123!"));
    assertEquals(HttpStatus.CONFLICT, dup.getStatusCode());
  }

  @Test
  void changingPasswordRequiresTheCurrentPasswordAndInvalidatesTheOldOne() {
    String email = UUID.randomUUID() + "@integration.test";
    String oldPassword = "OldSecurePassword!";
    String newPassword = "NewSecurePassword!";
    String token = registerAndLogin(email, oldPassword);

    ResponseEntity<JsonNode> missingCurrent =
        put("/api/v1/auth/password", token, json("newPassword", newPassword));
    assertEquals(HttpStatus.BAD_REQUEST, missingCurrent.getStatusCode());

    ResponseEntity<JsonNode> wrongCurrent =
        put(
            "/api/v1/auth/password",
            token,
            json("currentPassword", "WrongCurrentPassword!", "newPassword", newPassword));
    assertEquals(HttpStatus.BAD_REQUEST, wrongCurrent.getStatusCode());

    ResponseEntity<JsonNode> changed =
        put(
            "/api/v1/auth/password",
            token,
            json("currentPassword", oldPassword, "newPassword", newPassword));
    assertEquals(HttpStatus.OK, changed.getStatusCode());

    assertEquals(
        HttpStatus.UNAUTHORIZED,
        post("/api/v1/auth/login", null, json("email", email, "password", oldPassword))
            .getStatusCode());
    assertEquals(
        HttpStatus.OK,
        post("/api/v1/auth/login", null, json("email", email, "password", newPassword))
            .getStatusCode());
  }

  // Criteria: path CRUD (list / create / read / update / soft delete)

  @Test
  void pathLifecycleCreateReadUpdateSoftDelete() {
    String token = freshToken();

    // Create
    ResponseEntity<JsonNode> created =
        post(
            "/api/v1/paths",
            token,
            "{\"name\":\"Algorithms\",\"description\":\"DSA study\",\"color\":\"#3B82F6\",\"textColor\":\"#F8FAFC\"}");
    assertEquals(HttpStatus.CREATED, created.getStatusCode());
    String pathId = created.getBody().get("id").asText();
    assertEquals("Algorithms", created.getBody().get("name").asText());
    assertEquals("#3B82F6", created.getBody().get("color").asText());
    assertEquals("#F8FAFC", created.getBody().get("textColor").asText());

    // Read
    ResponseEntity<JsonNode> fetched = get("/api/v1/paths/" + pathId, token);
    assertEquals(HttpStatus.OK, fetched.getStatusCode());
    assertEquals("Algorithms", fetched.getBody().get("name").asText());
    assertEquals("#F8FAFC", fetched.getBody().get("textColor").asText());

    // Update (editable-paths criteria): name, description, and color
    ResponseEntity<JsonNode> updated =
        put(
            "/api/v1/paths/" + pathId,
            token,
            "{\"name\":\"Algorithms Updated\",\"description\":\"Updated"
                + " desc\",\"color\":\"#EF4444\",\"textColor\":\"#102030\"}");
    assertEquals(HttpStatus.OK, updated.getStatusCode());
    assertEquals("Algorithms Updated", updated.getBody().get("name").asText());
    assertEquals("#EF4444", updated.getBody().get("color").asText());
    assertEquals("#102030", updated.getBody().get("textColor").asText());
    ResponseEntity<JsonNode> reloaded = get("/api/v1/paths/" + pathId, token);
    assertEquals(HttpStatus.OK, reloaded.getStatusCode());
    assertEquals("Algorithms Updated", reloaded.getBody().get("name").asText());
    assertEquals("Updated desc", reloaded.getBody().get("description").asText());
    assertEquals("#EF4444", reloaded.getBody().get("color").asText());
    assertEquals("#102030", reloaded.getBody().get("textColor").asText());

    // List includes path
    ResponseEntity<JsonNode> list = get("/api/v1/paths", token);
    assertEquals(HttpStatus.OK, list.getStatusCode());
    assertTrue(list.getBody().isArray());
    boolean found = false;
    for (JsonNode n : list.getBody()) {
      if (n.get("id").asText().equals(pathId)) {
        found = true;
        break;
      }
    }
    assertTrue(found, "path should appear in list");

    // Soft delete preserves the database row but hides it from normal reads.
    ResponseEntity<JsonNode> deleted = delete("/api/v1/paths/" + pathId, token);
    assertEquals(HttpStatus.NO_CONTENT, deleted.getStatusCode());
    assertEquals(HttpStatus.NOT_FOUND, get("/api/v1/paths/" + pathId, token).getStatusCode());

    ResponseEntity<JsonNode> restored = post("/api/v1/paths/" + pathId + "/restore", token, "{}");
    assertEquals(HttpStatus.OK, restored.getStatusCode());
    ResponseEntity<JsonNode> activeAgain = get("/api/v1/paths/" + pathId, token);
    assertEquals(HttpStatus.OK, activeAgain.getStatusCode());
    assertEquals("ACTIVE", activeAgain.getBody().get("status").asText());
  }

  @Test
  void pathListIsOwnerScopedAndExcludesSoftDeletedPaths() {
    String owner = freshToken();
    String other = freshToken();
    String activeId =
        post("/api/v1/paths", owner, "{\"name\":\"Visible path\"}")
            .getBody()
            .get("id")
            .asText();
    String deletedId =
        post("/api/v1/paths", owner, "{\"name\":\"Deleted path\"}")
            .getBody()
            .get("id")
            .asText();
    String foreignId =
        post("/api/v1/paths", other, "{\"name\":\"Foreign path\"}")
            .getBody()
            .get("id")
            .asText();
    assertEquals(HttpStatus.NO_CONTENT, delete("/api/v1/paths/" + deletedId, owner).getStatusCode());

    JsonNode listed = get("/api/v1/paths", owner).getBody();
    List<String> ids = new ArrayList<>();
    listed.forEach(path -> ids.add(path.get("id").asText()));
    assertTrue(ids.contains(activeId));
    assertFalse(ids.contains(deletedId));
    assertFalse(ids.contains(foreignId));
  }

  @Test
  void pathColorValidationRejectsInvalidHex() {
    String token = freshToken();
    ResponseEntity<JsonNode> bad =
        post("/api/v1/paths", token, "{\"name\":\"Bad Color\",\"color\":\"red\"}");
    assertEquals(HttpStatus.BAD_REQUEST, bad.getStatusCode());
    ResponseEntity<JsonNode> badTextColor =
        post("/api/v1/paths", token, "{\"name\":\"Bad text color\",\"textColor\":\"red\"}");
    assertEquals(HttpStatus.BAD_REQUEST, badTextColor.getStatusCode());
  }

  @Test
  void knowledgeBaseImportRoundTripsAllEntitiesPropertiesRelationshipsAndUndo() {
    String token = freshToken();
    UUID pathId = UUID.randomUUID(), labelId = UUID.randomUUID(), sessionId = UUID.randomUUID();
    UUID activityId = UUID.randomUUID(),
        dayId = UUID.randomUUID(),
        noteId = UUID.randomUUID(),
        logId = UUID.randomUUID();
    String started = "2026-09-10T10:00:00Z";
    String ended = "2026-09-10T11:00:00Z";
    String created = "2026-09-10T09:00:00Z";
    String updated = "2026-09-10T12:00:00Z";
    String content = "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\"}]}";
    String csv =
        "entity,id,payload\n"
            + csvRow(
                "path",
                pathId,
                "{\"name\":\"Imported path\",\"description\":\"All"
                    + " fields\",\"color\":\"#123456\",\"status\":\"ARCHIVED\",\"createdAt\":\""
                    + created
                    + "\",\"updatedAt\":\""
                    + updated
                    + "\"}")
            + csvRow(
                "label",
                labelId,
                "{\"name\":\"Imported label\",\"color\":\"#ABCDEF\",\"createdAt\":\""
                    + created
                    + "\",\"scopes\":[\"NOTE\",\"CALENDAR\",\"TIME_ENTRY\"]}")
            + csvRow(
                "session",
                sessionId,
                "{\"pathId\":\""
                    + pathId
                    + "\",\"startedAt\":\""
                    + started
                    + "\",\"endedAt\":\""
                    + ended
                    + "\",\"durationSeconds\":3600,\"description\":\"Imported"
                    + " session\",\"source\":\"MANUAL\",\"labelIds\":[\""
                    + labelId
                    + "\"]}")
            + csvRow(
                "timeline",
                activityId,
                "{\"pathId\":\""
                    + pathId
                    + "\",\"timeEntryId\":\""
                    + sessionId
                    + "\",\"type\":\"TIME_TRACKED\",\"title\":\"Imported"
                    + " activity\",\"detail\":\"Activity detail\",\"occurredAt\":\""
                    + updated
                    + "\"}")
            + csvRow(
                "calendar",
                dayId,
                "{\"recordDate\":\"2026-09-10\",\"note\":\"Day note\",\"createdAt\":\""
                    + created
                    + "\",\"updatedAt\":\""
                    + updated
                    + "\",\"labels\":[{\"labelId\":\""
                    + labelId
                    + "\",\"portion\":\"0.50\"}]}")
            + csvRow(
                "note",
                noteId,
                "{\"pathId\":\""
                    + pathId
                    + "\",\"activityId\":null,\"timeEntryId\":null,\"title\":\"Imported"
                    + " note\",\"content\":"
                    + quote(content)
                    + ",\"contentText\":\"Plain content\",\"createdAt\":\""
                    + created
                    + "\",\"updatedAt\":\""
                    + updated
                    + "\",\"tagIds\":[\""
                    + labelId
                    + "\"]}")
            + csvRow(
                "log",
                logId,
                "{\"body\":\"Imported log\",\"occurredAt\":\""
                    + updated
                    + "\",\"createdAt\":\""
                    + created
                    + "\",\"updatedAt\":\""
                    + updated
                    + "\",\"labelIds\":[\""
                    + labelId
                    + "\"]}");

    ResponseEntity<JsonNode> imported = importCsv(token, csv);
    assertEquals(HttpStatus.OK, imported.getStatusCode(), String.valueOf(imported.getBody()));
    assertEquals(7, imported.getBody().get("imported").asInt());
    assertEquals(0, imported.getBody().get("skipped").asInt());

    String exported = exportCsv(token).getBody();
    assertNotNull(exported);
    assertTrue(
        exported.contains("Imported path")
            && exported.contains("#123456")
            && exported.contains("ARCHIVED"));
    assertTrue(
        exported.contains("Imported label")
            && exported.contains("#ABCDEF")
            && exported.contains("NOTE")
            && exported.contains("CALENDAR")
            && exported.contains("TIME_ENTRY"));
    assertTrue(
        exported.contains("Imported session")
            && exported.contains("3600")
            && exported.contains("MANUAL")
            && exported.contains(labelId.toString()));
    assertTrue(
        exported.contains("Imported activity")
            && exported.contains("Activity detail")
            && exported.contains(sessionId.toString()));
    assertTrue(
        exported.contains("2026-09-10")
            && exported.contains("Day note")
            && exported.contains("0.50"));
    assertTrue(
        exported.contains("Imported note")
            && exported.contains("Plain content")
            && exported.contains("paragraph"));
    assertTrue(
        exported.contains("Imported log")
            && exported.contains(logId.toString())
            && exported.contains(labelId.toString()));

    JsonNode batches = get("/api/v1/imports/knowledge-base/batches", token).getBody();
    assertEquals(1, batches.size());
    String batchId = batches.get(0).get("id").asText();
    assertEquals(7, batches.get(0).get("imported").asInt());

    ResponseEntity<JsonNode> undone =
        delete("/api/v1/imports/knowledge-base/batches/" + batchId, token);
    assertEquals(HttpStatus.OK, undone.getStatusCode());
    assertEquals(1, undone.getBody().get("deletedEntries").asInt());
    assertEquals(1, undone.getBody().get("deletedActivities").asInt());
    assertEquals(1, undone.getBody().get("deletedPaths").asInt());
    assertEquals(1, undone.getBody().get("deletedLogs").asInt());
    assertTrue(get("/api/v1/paths", token).getBody().isEmpty());
    assertTrue(get("/api/v1/labels", token).getBody().isEmpty());
    assertTrue(get("/api/v1/time-entries", token).getBody().isEmpty());
    assertTrue(get("/api/v1/activities", token).getBody().isEmpty());
    assertTrue(get("/api/v1/notes", token).getBody().isEmpty());
    assertTrue(get("/api/v1/logs", token).getBody().isEmpty());
    assertTrue(
        get("/api/v1/calendar/days?startDate=2026-09-10&endDate=2026-09-10", token)
            .getBody()
            .isEmpty());
  }

  @Test
  void knowledgeBaseCsvExportHasDownloadHeadersIsOwnerScopedAndRoundTripsEscapedText() {
    String owner = freshToken();
    String importer = freshToken();
    String other = freshToken();
    String name = "Café, \"Focus\"";
    String description = "first line, comma\nsecond line — 東京";
    ResponseEntity<JsonNode> created =
        post(
            "/api/v1/paths",
            owner,
            "{\"name\":\"Café, \\\"Focus\\\"\",\"description\":\"first line, comma\\nsecond line — 東京\"}");
    assertEquals(HttpStatus.CREATED, created.getStatusCode());
    String pathId = created.getBody().get("id").asText();
    ResponseEntity<JsonNode> foreignPath =
        post("/api/v1/paths", other, "{\"name\":\"Private export row\"}");
    String foreignPathId = foreignPath.getBody().get("id").asText();

    ResponseEntity<String> exported = exportCsv(owner);
    assertEquals(HttpStatus.OK, exported.getStatusCode());
    assertTrue(exported.getHeaders().getContentType().isCompatibleWith(MediaType.parseMediaType("text/csv")));
    assertEquals("UTF-8", exported.getHeaders().getContentType().getCharset().name());
    assertEquals(
        "attachment; filename=knowledge-base-export.csv",
        exported.getHeaders().getFirst(HttpHeaders.CONTENT_DISPOSITION));
    assertTrue(exported.getBody().contains("Café"));
    assertTrue(exported.getBody().contains(pathId));
    assertTrue(exported.getBody().contains("first line, comma\\nsecond line — 東京"));
    assertEquals(HttpStatus.NOT_FOUND, get("/api/v1/paths/" + pathId, importer).getStatusCode());
    assertFalse(exported.getBody().contains("Private export row"));
    assertFalse(exported.getBody().contains(foreignPathId));

    UUID roundTripId = UUID.randomUUID();
    ResponseEntity<JsonNode> imported =
        importCsv(importer, exported.getBody().replace(pathId, roundTripId.toString()));
    assertEquals(HttpStatus.OK, imported.getStatusCode(), String.valueOf(imported.getBody()));
    assertEquals(1, imported.getBody().get("imported").asInt());
    ResponseEntity<JsonNode> reloaded = get("/api/v1/paths/" + roundTripId, importer);
    assertEquals(HttpStatus.OK, reloaded.getStatusCode(), String.valueOf(reloaded.getBody()));
    JsonNode roundTripped = reloaded.getBody();
    assertEquals(name, roundTripped.get("name").asText());
    assertEquals(description, roundTripped.get("description").asText());
  }

  @Test
  void knowledgeBaseImportRestoresSoftDeletedRecordsAndUndoRemovesRestoredRecords() {
    String token = freshToken();
    String pathId =
        post("/api/v1/paths", token, "{\"name\":\"Restore path\"}").getBody().get("id").asText();
    assertEquals(HttpStatus.NO_CONTENT, delete("/api/v1/paths/" + pathId, token).getStatusCode());

    String noteId =
        post("/api/v1/notes", token, "{\"title\":\"Restore note\",\"content\":\"body\"}")
            .getBody()
            .get("id")
            .asText();
    assertEquals(HttpStatus.NO_CONTENT, delete("/api/v1/notes/" + noteId, token).getStatusCode());

    String start = "2026-09-11T10:00:00Z";
    String end = "2026-09-11T11:00:00Z";
    String sessionId =
        post(
                "/api/v1/time-entries",
                token,
                "{\"pathId\":null,\"labelIds\":[],\"startedAt\":\""
                    + start
                    + "\",\"endedAt\":\""
                    + end
                    + "\",\"description\":\"Restore session\"}")
            .getBody()
            .get("id")
            .asText();
    assertEquals(
        HttpStatus.NO_CONTENT, delete("/api/v1/time-entries/" + sessionId, token).getStatusCode());

    String csv =
        "entity,id,payload\n"
            + csvRow(
                "path",
                UUID.fromString(pathId),
                "{\"name\":\"Restore"
                    + " path\",\"description\":null,\"color\":\"#E8754E\",\"status\":\"ACTIVE\"}")
            + csvRow(
                "session",
                UUID.fromString(sessionId),
                "{\"pathId\":null,\"startedAt\":\""
                    + start
                    + "\",\"endedAt\":\""
                    + end
                    + "\",\"durationSeconds\":3600,\"description\":\"Restore"
                    + " session\",\"source\":\"MANUAL\",\"labelIds\":[]}")
            + csvRow(
                "note",
                UUID.fromString(noteId),
                "{\"pathId\":null,\"activityId\":null,\"timeEntryId\":null,\"title\":\"Restore"
                    + " note\",\"content\":\"body\",\"contentText\":\"body\",\"tagIds\":[]}");

    ResponseEntity<JsonNode> imported = importCsv(token, csv);
    assertEquals(HttpStatus.OK, imported.getStatusCode(), String.valueOf(imported.getBody()));
    assertEquals(3, imported.getBody().get("imported").asInt());
    assertEquals(0, imported.getBody().get("skipped").asInt());
    assertEquals(HttpStatus.OK, get("/api/v1/paths/" + pathId, token).getStatusCode());
    assertFalse(get("/api/v1/time-entries", token).getBody().isEmpty());
    assertFalse(get("/api/v1/notes", token).getBody().isEmpty());

    String batchId =
        get("/api/v1/imports/knowledge-base/batches", token).getBody().get(0).get("id").asText();
    ResponseEntity<JsonNode> undone =
        delete("/api/v1/imports/knowledge-base/batches/" + batchId, token);
    assertEquals(HttpStatus.OK, undone.getStatusCode());
    assertEquals(1, undone.getBody().get("deletedEntries").asInt());
    assertEquals(1, undone.getBody().get("deletedPaths").asInt());
    assertTrue(get("/api/v1/paths", token).getBody().isEmpty());
    assertTrue(get("/api/v1/time-entries", token).getBody().isEmpty());
    assertTrue(get("/api/v1/notes", token).getBody().isEmpty());
  }

  @Test
  void knowledgeBaseBatchListAndUndoAreOwnerScopedAndRepeatedUndoIsIdempotent() {
    String owner = freshToken();
    String other = freshToken();
    UUID pathId = UUID.randomUUID();
    String csv =
        "entity,id,payload\n"
            + csvRow(
                "path",
                pathId,
                "{\"name\":\"Batch-owned path\",\"description\":null,\"color\":\"#123456\",\"status\":\"ACTIVE\"}");

    ResponseEntity<JsonNode> imported = importCsv(owner, csv);
    assertEquals(HttpStatus.OK, imported.getStatusCode(), String.valueOf(imported.getBody()));
    assertEquals(1, imported.getBody().get("imported").asInt());
    JsonNode ownerBatches = get("/api/v1/imports/knowledge-base/batches", owner).getBody();
    assertEquals(1, ownerBatches.size());
    String batchId = ownerBatches.get(0).get("id").asText();

    assertTrue(get("/api/v1/imports/knowledge-base/batches", other).getBody().isEmpty());
    assertEquals(
        HttpStatus.NOT_FOUND,
        delete("/api/v1/imports/knowledge-base/batches/" + batchId, other).getStatusCode());
    assertEquals(HttpStatus.OK, get("/api/v1/paths/" + pathId, owner).getStatusCode());

    ResponseEntity<JsonNode> undo =
        delete("/api/v1/imports/knowledge-base/batches/" + batchId, owner);
    assertEquals(HttpStatus.OK, undo.getStatusCode());
    assertEquals(1, undo.getBody().get("deletedPaths").asInt());
    assertEquals(HttpStatus.NOT_FOUND, get("/api/v1/paths/" + pathId, owner).getStatusCode());

    ResponseEntity<JsonNode> repeatedUndo =
        delete("/api/v1/imports/knowledge-base/batches/" + batchId, owner);
    assertEquals(HttpStatus.OK, repeatedUndo.getStatusCode());
    assertEquals(0, repeatedUndo.getBody().get("deletedPaths").asInt());
    assertEquals(1, get("/api/v1/imports/knowledge-base/batches", owner).getBody().size());
  }

  @Test
  void knowledgeBaseImportSkipsDuplicatesWithinFileAndPreservesOtherUsersData() {
    String ownerToken = freshToken();
    String importingToken = freshToken();
    String foreignPathId =
        post("/api/v1/paths", ownerToken, "{\"name\":\"Foreign path\"}")
            .getBody()
            .get("id")
            .asText();
    UUID duplicatePathId = UUID.randomUUID();
    String csv =
        "entity,id,payload\n"
            + csvRow(
                "path",
                duplicatePathId,
                "{\"name\":\"First\",\"description\":null,\"color\":\"#123456\",\"status\":\"ACTIVE\"}")
            + csvRow(
                "path",
                duplicatePathId,
                "{\"name\":\"Second\",\"description\":null,\"color\":\"#654321\",\"status\":\"ARCHIVED\"}")
            + csvRow(
                "path",
                UUID.fromString(foreignPathId),
                "{\"name\":\"Should not cross"
                    + " ownership\",\"description\":null,\"color\":\"#ABCDEF\",\"status\":\"ACTIVE\"}");

    ResponseEntity<JsonNode> imported = importCsv(importingToken, csv);
    assertEquals(HttpStatus.OK, imported.getStatusCode(), String.valueOf(imported.getBody()));
    assertEquals(1, imported.getBody().get("imported").asInt());
    assertEquals(2, imported.getBody().get("skipped").asInt());
    assertEquals(
        "First",
        get("/api/v1/paths/" + duplicatePathId, importingToken).getBody().get("name").asText());
    assertEquals(
        "Foreign path",
        get("/api/v1/paths/" + foreignPathId, ownerToken).getBody().get("name").asText());
    assertEquals(
        HttpStatus.NOT_FOUND,
        get("/api/v1/paths/" + foreignPathId, importingToken).getStatusCode());
  }

  @Test
  void postgresImportRollsBackEarlierRowsWhenALaterRecordViolatesAConstraint() {
    if (System.getenv("KB_TEST_POSTGRES_URL") == null) {
      org.junit.jupiter.api.Assumptions.assumeTrue(
          false, "This rollback boundary runs against PostgreSQL");
    }
    String token = freshToken();
    UUID pathId = UUID.randomUUID();
    UUID noteId = UUID.randomUUID();
    String created = "2024-02-29T12:00:00Z";
    String csv =
        "entity,id,payload\n"
            + csvRow(
                "path",
                pathId,
                "{\"name\":\"Rollback-only path\",\"status\":\"ACTIVE\",\"createdAt\":\""
                    + created
                    + "\",\"updatedAt\":\""
                    + created
                    + "\"}")
            + csvRow(
                "note",
                noteId,
                "{\"pathId\":\"" + pathId + "\",\"content\":\"late invalid note\"}");

    ResponseEntity<JsonNode> failed = importCsv(token, csv);
    assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, failed.getStatusCode());
    assertTrue(get("/api/v1/paths", token).getBody().findValuesAsText("name").stream()
        .noneMatch("Rollback-only path"::equals));
    assertTrue(get("/api/v1/imports/knowledge-base/batches", token).getBody().isEmpty());
    assertFalse(exportCsv(token).getBody().contains(pathId.toString()));
  }

  @Test
  void postgresClockifyUndoRollsBackEarlierEntryDeleteWhenBatchUpdateFails() {
    org.junit.jupiter.api.Assumptions.assumeTrue(
        System.getenv("KB_TEST_POSTGRES_URL") != null,
        "Clockify transaction rollback requires PostgreSQL");
    String token = freshToken();
    String payload =
        "{\"timeentries\":[{\"_id\":\"undo-rollback-"
            + UUID.randomUUID()
            + "\",\"description\":\"Undo rollback\",\"timeInterval\":{\"start\":\"2024-07-05T08:00:00Z\",\"end\":\"2024-07-05T09:00:00Z\"}}]}";
    String batchId = post("/api/v1/imports/clockify", token, payload).getBody().get("batchId").asText();
    UUID batchUuid = UUID.fromString(batchId);
    String suffix = UUID.randomUUID().toString().replace("-", "");
    String functionName = "fail_clockify_undo_" + suffix;
    String triggerName = functionName;
    installBatchUpdateFailure(batchUuid, functionName, triggerName);
    try {
      assertEquals(
          HttpStatus.INTERNAL_SERVER_ERROR,
          delete("/api/v1/imports/clockify/batches/" + batchId, token).getStatusCode());
    } finally {
      removeTrigger(triggerName, "import_batch", functionName);
    }
    assertEquals(
        1L,
        jdbc.queryForObject(
            "select count(*) from time_entry where import_batch_id = ?", Long.class, batchUuid));
    assertNull(
        jdbc.queryForObject(
            "select undone_at from import_batch where id = ?", java.sql.Timestamp.class, batchUuid));
  }

  @Test
  void postgresKnowledgeBaseUndoRollsBackEarlierDeletesWhenBatchUpdateFails() {
    org.junit.jupiter.api.Assumptions.assumeTrue(
        System.getenv("KB_TEST_POSTGRES_URL") != null,
        "Knowledge Base transaction rollback requires PostgreSQL");
    String token = freshToken();
    UUID pathId = UUID.randomUUID();
    UUID noteId = UUID.randomUUID();
    String created = "2024-02-29T12:00:00Z";
    String csv =
        "entity,id,payload\n"
            + csvRow(
                "path",
                pathId,
                "{\"name\":\"Undo rollback path\",\"status\":\"ACTIVE\",\"createdAt\":\""
                    + created
                    + "\",\"updatedAt\":\""
                    + created
                    + "\"}")
            + csvRow(
                "note",
                noteId,
                "{\"title\":\"Undo rollback note\",\"content\":\"body\",\"pathId\":\""
                    + pathId
                    + "\"}");
    String batchId = importCsv(token, csv).getBody().get("batchId").asText();
    UUID batchUuid = UUID.fromString(batchId);
    String suffix = UUID.randomUUID().toString().replace("-", "");
    String functionName = "fail_kb_undo_" + suffix;
    String triggerName = functionName;
    installBatchUpdateFailure(batchUuid, functionName, triggerName);
    try {
      assertEquals(
          HttpStatus.INTERNAL_SERVER_ERROR,
          delete("/api/v1/imports/knowledge-base/batches/" + batchId, token).getStatusCode());
    } finally {
      removeTrigger(triggerName, "import_batch", functionName);
    }
    assertEquals(
        1L,
        jdbc.queryForObject("select count(*) from note where id = ?", Long.class, noteId));
    assertEquals(
        1L,
        jdbc.queryForObject("select count(*) from path where id = ?", Long.class, pathId));
    assertNull(
        jdbc.queryForObject(
            "select undone_at from import_batch where id = ?", java.sql.Timestamp.class, batchUuid));
  }

  @Test
  void postgresCalendarRangeFailureRollsBackEarlierDayAndAssignments() {
    org.junit.jupiter.api.Assumptions.assumeTrue(
        System.getenv("KB_TEST_POSTGRES_URL") != null,
        "Calendar transaction rollback requires PostgreSQL");
    String token = freshToken();
    String labelId =
        post(
                "/api/v1/labels",
                token,
                "{\"name\":\"Range rollback\",\"scopes\":[\"CALENDAR\"]}")
            .getBody()
            .get("id")
            .asText();
    java.time.LocalDate failedDate = java.time.LocalDate.of(2026, 5, 21);
    String suffix = UUID.randomUUID().toString().replace("-", "");
    String functionName = "fail_calendar_range_" + suffix;
    String triggerName = functionName;
    jdbc.execute(
        "create function "
            + functionName
            + "() returns trigger language plpgsql as $$ begin if new.record_date = date '"
            + failedDate
            + "' then raise exception 'forced calendar range failure'; end if; return new; end $$");
    jdbc.execute(
        "create trigger "
            + triggerName
            + " before insert on daily_record for each row execute function "
            + functionName
            + "()");
    try {
      ResponseEntity<JsonNode> failed =
          put(
              "/api/v1/calendar/days/range",
              token,
              "{\"startDate\":\"2026-05-20\",\"endDate\":\""
                  + failedDate
                  + "\",\"labels\":[{\"labelId\":\""
                  + labelId
                  + "\",\"portion\":0.25}]}");
      assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, failed.getStatusCode());
    } finally {
      removeTrigger(triggerName, "daily_record", functionName);
    }
    assertEquals(
        0L,
        jdbc.queryForObject(
            "select count(*) from daily_record where user_id = ? and record_date between ? and ?",
            Long.class,
            authenticatedUserId(token),
            java.sql.Date.valueOf("2026-05-20"),
            java.sql.Date.valueOf(failedDate)));
    assertEquals(
        0L,
        jdbc.queryForObject(
            "select count(*) from daily_record_label a join daily_record d on d.id = a.daily_record_id where d.user_id = ? and d.record_date between ? and ?",
            Long.class,
            authenticatedUserId(token),
            java.sql.Date.valueOf("2026-05-20"),
            java.sql.Date.valueOf(failedDate)));
  }

  private void installBatchUpdateFailure(UUID batchId, String functionName, String triggerName) {
    jdbc.execute(
        "create function "
            + functionName
            + "() returns trigger language plpgsql as $$ begin if new.id = '"
            + batchId
            + "'::uuid then raise exception 'forced import undo failure'; end if; return new; end $$");
    jdbc.execute(
        "create trigger "
            + triggerName
            + " before update on import_batch for each row execute function "
            + functionName
            + "()");
  }

  private void removeTrigger(String triggerName, String tableName, String functionName) {
    jdbc.execute("drop trigger if exists " + triggerName + " on " + tableName);
    jdbc.execute("drop function if exists " + functionName + "()");
  }

  private UUID authenticatedUserId(String token) {
    try {
      return UUID.fromString(
          mapper
              .readTree(Base64.getUrlDecoder().decode(token.split("\\.")[1]))
              .get("sub")
              .asText());
    } catch (Exception exception) {
      throw new AssertionError("Could not read test user from token", exception);
    }
  }

  @Test
  void mergingPathsMovesTheSourceSessionsToTheOwnedTargetAndSoftDeletesTheSource() {
    String token = freshToken();
    String sourceId =
        post("/api/v1/paths", token, "{\"name\":\"Source\"}").getBody().get("id").asText();
    String targetId =
        post("/api/v1/paths", token, "{\"name\":\"Target\"}").getBody().get("id").asText();
    ResponseEntity<JsonNode> session =
        post(
            "/api/v1/time-entries",
            token,
            "{\"pathId\":\""
                + sourceId
                + "\",\"labelIds\":[],\"startedAt\":\""
                + Instant.now().minus(10, ChronoUnit.MINUTES)
                + "\",\"endedAt\":\""
                + Instant.now().minus(5, ChronoUnit.MINUTES)
                + "\"}");
    assertEquals(HttpStatus.OK, session.getStatusCode());

    ResponseEntity<JsonNode> merged =
        post(
            "/api/v1/paths/" + sourceId + "/merge",
            token,
            "{\"targetPathId\":\"" + targetId + "\"}");
    assertEquals(HttpStatus.NO_CONTENT, merged.getStatusCode());
    assertEquals(HttpStatus.NOT_FOUND, get("/api/v1/paths/" + sourceId, token).getStatusCode());

    ResponseEntity<JsonNode> history = get("/api/v1/time-entries", token);
    assertEquals(targetId, history.getBody().get(0).get("pathId").asText());
    ResponseEntity<JsonNode> summary = get("/api/v1/paths/" + targetId + "/summary", token);
    assertTrue(summary.getBody().get("trackedSeconds").asLong() >= 300);
  }

  @Test
  void mergingAPathIntoItselfIsRejectedWithoutChangingThePath() {
    String token = freshToken();
    String pathId =
        post("/api/v1/paths", token, "{\"name\":\"Self merge\"}")
            .getBody()
            .get("id")
            .asText();

    ResponseEntity<JsonNode> rejected =
        post(
            "/api/v1/paths/" + pathId + "/merge",
            token,
            "{\"targetPathId\":\"" + pathId + "\"}");

    assertEquals(HttpStatus.BAD_REQUEST, rejected.getStatusCode());
    ResponseEntity<JsonNode> unchanged = get("/api/v1/paths/" + pathId, token);
    assertEquals(HttpStatus.OK, unchanged.getStatusCode());
    assertEquals("Self merge", unchanged.getBody().get("name").asText());
    assertEquals("ACTIVE", unchanged.getBody().get("status").asText());
  }

  // Criteria: paths have colors

  @Test
  void pathsHaveColorsDefaultAndCustom() {
    String token = freshToken();

    // Default color is applied when none is provided
    ResponseEntity<JsonNode> defaultPath =
        post("/api/v1/paths", token, "{\"name\":\"No Color Path\",\"description\":null}");
    assertEquals(HttpStatus.CREATED, defaultPath.getStatusCode());
    assertFalse(
        defaultPath.getBody().get("color").asText().isBlank(), "default color should be set");

    // Custom color is stored
    ResponseEntity<JsonNode> colored =
        post("/api/v1/paths", token, "{\"name\":\"Blue Path\",\"color\":\"#2563EB\"}");
    assertEquals(HttpStatus.CREATED, colored.getStatusCode());
    assertEquals("#2563EB", colored.getBody().get("color").asText());
  }

  // Criteria: notes, tags, and path membership

  @Test
  void richNotesSupportLabelsSearchPaginationAndOptimisticUpdates() {
    String token = freshToken();
    String content =
        "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Rich"
            + " body search\"}]}]}";
    ResponseEntity<JsonNode> created =
        post(
            "/api/v1/notes",
            token,
            "{\"title\":\"Rich note\",\"content\":"
                + quote(content)
                + ",\"contentText\":\"Rich body search\",\"tags\":[\"Study\",\"Ideas\"]}");
    assertEquals(HttpStatus.OK, created.getStatusCode());
    String noteId = created.getBody().get("id").asText();
    assertEquals(2, created.getBody().get("tags").size());

    ResponseEntity<JsonNode> page = get("/api/v1/notes?page=0&size=20&q=body", token);
    assertEquals(HttpStatus.OK, page.getStatusCode());
    assertEquals(1, page.getBody().get("items").size());
    assertEquals(noteId, page.getBody().get("items").get(0).get("id").asText());

    long version = created.getBody().get("version").asLong();
    ResponseEntity<JsonNode> edited =
        put(
            "/api/v1/notes/" + noteId,
            token,
            "{\"title\":\"Rich note updated\",\"content\":"
                + quote(content)
                + ",\"contentText\":\"Updated searchable body\",\"tags\":[\"New"
                + " label\"],\"version\":"
                + version
                + "}");
    assertEquals(HttpStatus.OK, edited.getStatusCode());
    assertEquals("New label", edited.getBody().get("tags").get(0).asText());

    ResponseEntity<JsonNode> stale =
        put(
            "/api/v1/notes/" + noteId,
            token,
            "{\"title\":\"Stale\",\"content\":" + quote(content) + ",\"version\":" + version + "}");
    assertEquals(HttpStatus.CONFLICT, stale.getStatusCode());
  }

  @Test
  void noteForeignUserCannotEdit() {
    String ownerToken = freshToken();
    String foreignToken = freshToken();

    ResponseEntity<JsonNode> note =
        post("/api/v1/notes", ownerToken, "{\"title\":\"Private\",\"content\":\"secret\"}");
    assertEquals(HttpStatus.OK, note.getStatusCode());
    String noteId = note.getBody().get("id").asText();

    // Foreign user edit is rejected
    ResponseEntity<JsonNode> reject =
        put("/api/v1/notes/" + noteId, foreignToken, "{\"title\":\"Leaked\",\"content\":\"nope\"}");
    assertEquals(HttpStatus.NOT_FOUND, reject.getStatusCode());
  }

  // Criteria: timer (start / stop / cancel / configure)

  @Test
  void timerStartStopCycleAndOneTimerInvariant() {
    String token = freshToken();

    // No current timer at start
    ResponseEntity<JsonNode> noCurrent = get("/api/v1/timers/current", token);
    assertEquals(HttpStatus.OK, noCurrent.getStatusCode());
    assertTrue(noCurrent.getBody() == null || noCurrent.getBody().isNull());

    // Start a timer
    ResponseEntity<JsonNode> started =
        post(
            "/api/v1/timers",
            token,
            "{\"labelIds\":[],\"description\":\"Study session\",\"source\":\"WEB\"}");
    assertEquals(HttpStatus.CREATED, started.getStatusCode());
    String timerId = started.getBody().get("id").asText();
    assertTrue(started.getBody().get("running").asBoolean());

    // Second start is rejected (one-running-timer invariant)
    ResponseEntity<JsonNode> dup =
        post(
            "/api/v1/timers",
            token,
            "{\"labelIds\":[],\"description\":\"Another session\",\"source\":\"WEB\"}");
    assertEquals(HttpStatus.CONFLICT, dup.getStatusCode());

    // Current timer is visible
    ResponseEntity<JsonNode> current = get("/api/v1/timers/current", token);
    assertFalse(current.getBody().isNull());
    assertEquals(timerId, current.getBody().get("id").asText());

    // Stop the timer
    ResponseEntity<JsonNode> stopped = post("/api/v1/timers/" + timerId + "/stop", token, "{}");
    assertEquals(HttpStatus.OK, stopped.getStatusCode());
    assertFalse(stopped.getBody().get("running").asBoolean());
    assertNotNull(stopped.getBody().get("durationSeconds"));
  }

  @Test
  void timerCanBeCancelled() {
    String token = freshToken();
    ResponseEntity<JsonNode> started =
        post(
            "/api/v1/timers",
            token,
            "{\"labelIds\":[],\"description\":\"To be cancelled\",\"source\":\"WEB\"}");
    assertEquals(HttpStatus.CREATED, started.getStatusCode());
    String timerId = started.getBody().get("id").asText();

    // cancel is a POST (not DELETE)
    ResponseEntity<JsonNode> cancelled = post("/api/v1/timers/" + timerId + "/cancel", token, "{}");
    assertEquals(HttpStatus.NO_CONTENT, cancelled.getStatusCode());

    // No current timer after cancellation
    ResponseEntity<JsonNode> noCurrent = get("/api/v1/timers/current", token);
    assertTrue(noCurrent.getBody() == null || noCurrent.getBody().isNull());
  }

  @Test
  void trackerDraftIsSharedOwnedAndClearedOnStart() {
    String token = freshToken(), other = freshToken();
    String label =
        post("/api/v1/labels", token, "{\"name\":\"Shared focus\",\"scopes\":[\"TIME_ENTRY\"]}")
            .getBody()
            .get("id")
            .asText();
    String body = "{\"labelIds\":[\"" + label + "\"],\"description\":\"\\n  Shared draft  \\n\"}";
    assertEquals(HttpStatus.OK, put("/api/v1/timers/draft", token, body).getStatusCode());
    JsonNode draft = get("/api/v1/timers/draft", token).getBody();
    assertEquals("\n  Shared draft  \n", draft.get("description").asText());
    assertEquals(label, draft.get("labelIds").get(0).asText());
    assertEquals(0, get("/api/v1/timers/draft", other).getBody().get("labelIds").size());
    assertEquals(HttpStatus.BAD_REQUEST, put("/api/v1/timers/draft", other, body).getStatusCode());
    assertEquals(
        HttpStatus.BAD_REQUEST,
        put(
                "/api/v1/timers/draft",
                token,
                "{\"labelIds\":[],\"description\":\"" + "x".repeat(5001) + "\"}")
            .getStatusCode());
    assertEquals(HttpStatus.CREATED, post("/api/v1/timers", token, body).getStatusCode());
    assertEquals(0, get("/api/v1/timers/draft", token).getBody().get("labelIds").size());
    assertEquals(HttpStatus.CONFLICT, put("/api/v1/timers/draft", token, body).getStatusCode());
    post("/api/v1/timers/stop", token, "{}");
    assertEquals(
        HttpStatus.OK,
        put("/api/v1/timers/draft", token, "{\"labelIds\":[],\"description\":null}")
            .getStatusCode());
    assertEquals(0, get("/api/v1/timers/draft", token).getBody().get("labelIds").size());
  }

  @Test
  void timerPreservesIosSource() {
    String token = freshToken();
    ResponseEntity<JsonNode> started =
        post(
            "/api/v1/timers",
            token,
            "{\"labelIds\":[],\"description\":\"iOS session\",\"source\":\"IOS\"}");
    assertEquals(HttpStatus.CREATED, started.getStatusCode());
    assertEquals("IOS", started.getBody().get("source").asText());

    // Stop it so subsequent tests are clean
    String timerId = started.getBody().get("id").asText();
    post("/api/v1/timers/" + timerId + "/stop", token, "{}");
  }

  @Test
  void timerConfigureRunningUpdatesPathAndStartTime() {
    String token = freshToken();
    ResponseEntity<JsonNode> path =
        post("/api/v1/paths", token, "{\"name\":\"Config Path\",\"description\":null}");
    String pathId = path.getBody().get("id").asText();

    ResponseEntity<JsonNode> started =
        post(
            "/api/v1/timers",
            token,
            "{\"labelIds\":[],\"description\":\"Config test\",\"source\":\"WEB\"}");
    assertEquals(HttpStatus.CREATED, started.getStatusCode());
    String timerId = started.getBody().get("id").asText();

    String pastTime = Instant.now().minus(10, ChronoUnit.MINUTES).toString();
    ResponseEntity<JsonNode> configured =
        put(
            "/api/v1/timers/" + timerId,
            token,
            "{\"pathId\":\""
                + pathId
                + "\",\"labelIds\":[],\"startedAt\":\""
                + pastTime
                + "\",\"description\":\"Updated\"}");
    assertEquals(HttpStatus.OK, configured.getStatusCode());
    assertEquals(pathId, configured.getBody().get("pathId").asText());
    assertEquals("Updated", configured.getBody().get("description").asText());

    // Stop cleanup
    post("/api/v1/timers/" + timerId + "/stop", token, "{}");
  }

  @Test
  void timerHistoryIsPaginated() {
    String token = freshToken();
    ResponseEntity<JsonNode> history = get("/api/v1/time-entries", token);
    assertEquals(HttpStatus.OK, history.getStatusCode());
    assertTrue(history.getBody().isArray());
  }

  @Test
  void timerWebSocketReceivesCommittedStateForTheAuthenticatedUser() throws Exception {
    String token = freshToken();
    LinkedBlockingQueue<String> messages = new LinkedBlockingQueue<>();
    WebSocket socket =
        HttpClient.newHttpClient()
            .newWebSocketBuilder()
            .buildAsync(
                URI.create("ws://localhost:" + port + "/ws/timers"),
                new WebSocket.Listener() {
                  @Override
                  public void onOpen(WebSocket webSocket) {
                    webSocket.sendText("{\"type\":\"AUTH\",\"token\":\"" + token + "\"}", true);
                    WebSocket.Listener.super.onOpen(webSocket);
                  }

                  @Override
                  public CompletionStage<?> onText(
                      WebSocket webSocket, CharSequence data, boolean last) {
                    if (last) messages.offer(data.toString());
                    webSocket.request(1);
                    return CompletableFuture.completedFuture(null);
                  }
                })
            .get(5, TimeUnit.SECONDS);

    assertEquals("READY", mapper.readTree(messages.poll(5, TimeUnit.SECONDS)).get("type").asText());
    ResponseEntity<JsonNode> started =
        post("/api/v1/timers", token, "{\"labelIds\":[],\"description\":\"Socket test\"}");
    assertEquals(HttpStatus.CREATED, started.getStatusCode());
    JsonNode state = mapper.readTree(messages.poll(5, TimeUnit.SECONDS));
    assertEquals("TIMER_STATE", state.get("type").asText());
    assertEquals(started.getBody().get("id").asText(), state.get("timer").get("id").asText());
    ResponseEntity<JsonNode> stopped = post("/api/v1/timers/stop", token, "{}");
    assertEquals(HttpStatus.OK, stopped.getStatusCode());
    JsonNode cleared = mapper.readTree(messages.poll(5, TimeUnit.SECONDS));
    assertEquals("TIMER_STATE", cleared.get("type").asText());
    assertTrue(cleared.get("timer").isNull());
    socket.sendClose(WebSocket.NORMAL_CLOSURE, "done").get(5, TimeUnit.SECONDS);
  }

  @Test
  void timerWebSocketPingsAuthenticatedClientsOftenEnoughForIdleProxies() throws Exception {
    // Cloudflare closes WebSockets idle for ~100 seconds; the heartbeat must
    // be scheduled well inside that window.
    FixedRateTask heartbeat =
        scheduledTasks.getScheduledTasks().stream()
            .map(scheduled -> scheduled.getTask())
            .filter(FixedRateTask.class::isInstance)
            .map(FixedRateTask.class::cast)
            // Spring wraps the method runnable; the task names the method.
            .filter(
                task ->
                    task.toString()
                        .equals(TimerWebSocketHandler.class.getName() + ".sendHeartbeats"))
            .findFirst()
            .orElseThrow(() -> new AssertionError("timer WebSocket heartbeat is not scheduled"));
    assertTrue(heartbeat.getIntervalDuration().toSeconds() <= 60);

    String token = freshToken();
    LinkedBlockingQueue<String> messages = new LinkedBlockingQueue<>();
    LinkedBlockingQueue<Boolean> pings = new LinkedBlockingQueue<>();
    WebSocket socket =
        HttpClient.newHttpClient()
            .newWebSocketBuilder()
            .buildAsync(
                URI.create("ws://localhost:" + port + "/ws/timers"),
                new WebSocket.Listener() {
                  @Override
                  public void onOpen(WebSocket webSocket) {
                    webSocket.sendText("{\"type\":\"AUTH\",\"token\":\"" + token + "\"}", true);
                    WebSocket.Listener.super.onOpen(webSocket);
                  }

                  @Override
                  public CompletionStage<?> onText(
                      WebSocket webSocket, CharSequence data, boolean last) {
                    if (last) messages.offer(data.toString());
                    webSocket.request(1);
                    return CompletableFuture.completedFuture(null);
                  }

                  @Override
                  public CompletionStage<?> onPing(WebSocket webSocket, ByteBuffer message) {
                    pings.offer(true);
                    return WebSocket.Listener.super.onPing(webSocket, message);
                  }
                })
            .get(5, TimeUnit.SECONDS);
    assertEquals("READY", mapper.readTree(messages.poll(5, TimeUnit.SECONDS)).get("type").asText());

    timerSockets.sendHeartbeats();

    assertEquals(Boolean.TRUE, pings.poll(5, TimeUnit.SECONDS));
    // The connection stays usable after a heartbeat.
    ResponseEntity<JsonNode> started =
        post("/api/v1/timers", token, "{\"labelIds\":[],\"description\":\"After ping\"}");
    assertEquals(HttpStatus.CREATED, started.getStatusCode());
    assertEquals(
        "TIMER_STATE", mapper.readTree(messages.poll(5, TimeUnit.SECONDS)).get("type").asText());
    post("/api/v1/timers/stop", token, "{}");
    socket.sendClose(WebSocket.NORMAL_CLOSURE, "done").get(5, TimeUnit.SECONDS);
  }

  @Test
  void timerWebSocketClosesAnInvalidAuthenticationWithPolicyViolation() throws Exception {
    // The deploy-time probe (scripts/check-timer-websocket.mjs) relies on this
    // close code to prove that /ws/timers reached the API without an account.
    LinkedBlockingQueue<Integer> closes = new LinkedBlockingQueue<>();
    HttpClient.newHttpClient()
        .newWebSocketBuilder()
        .buildAsync(
            URI.create("ws://localhost:" + port + "/ws/timers"),
            new WebSocket.Listener() {
              @Override
              public void onOpen(WebSocket webSocket) {
                webSocket.sendText("{\"type\":\"AUTH\",\"token\":\"not-a-valid-token\"}", true);
                WebSocket.Listener.super.onOpen(webSocket);
              }

              @Override
              public CompletionStage<?> onClose(WebSocket webSocket, int statusCode, String reason) {
                closes.offer(statusCode);
                return null;
              }
            })
        .get(5, TimeUnit.SECONDS);

    assertEquals(1008, closes.poll(5, TimeUnit.SECONDS));
  }

  @Test
  void timerHistoryProvidesRecentPathUsageInDescendingOrder() {
    String token = freshToken();
    String firstPath =
        post("/api/v1/paths", token, "{\"name\":\"First Recent Path\"}")
            .getBody()
            .get("id")
            .asText();
    String secondPath =
        post("/api/v1/paths", token, "{\"name\":\"Second Recent Path\"}")
            .getBody()
            .get("id")
            .asText();

    String newer = Instant.now().minus(15, ChronoUnit.MINUTES).toString();
    String older = Instant.now().minus(30, ChronoUnit.MINUTES).toString();
    post(
        "/api/v1/time-entries",
        token,
        "{\"pathId\":\""
            + firstPath
            + "\",\"labelIds\":[],\"startedAt\":\""
            + newer
            + "\",\"endedAt\":\""
            + Instant.now().minus(10, ChronoUnit.MINUTES)
            + "\"}");
    post(
        "/api/v1/time-entries",
        token,
        "{\"pathId\":\""
            + secondPath
            + "\",\"labelIds\":[],\"startedAt\":\""
            + older
            + "\",\"endedAt\":\""
            + Instant.now().minus(25, ChronoUnit.MINUTES)
            + "\"}");

    ResponseEntity<JsonNode> history = get("/api/v1/time-entries", token);
    assertEquals(HttpStatus.OK, history.getStatusCode());
    assertTrue(history.getBody().isArray());
    assertEquals(firstPath, history.getBody().get(0).get("pathId").asText());
    assertEquals(secondPath, history.getBody().get(1).get("pathId").asText());
  }

  @Test
  void timerAcceptsOwnedLabelWithPath() {
    String token = freshToken();
    ResponseEntity<JsonNode> path =
        post("/api/v1/paths", token, "{\"name\":\"Path A\",\"description\":null}");
    String pathId = path.getBody().get("id").asText();

    ResponseEntity<JsonNode> label =
        post(
            "/api/v1/labels",
            token,
            "{\"name\":\"Focused work\",\"scopes\":[\"CALENDAR\",\"TIME_ENTRY\"]}");
    String labelId = label.getBody().get("id").asText();

    ResponseEntity<JsonNode> timerStart =
        post(
            "/api/v1/timers",
            token,
            "{\"pathId\":\""
                + pathId
                + "\",\"labelIds\":[\""
                + labelId
                + "\"],\"description\":\"focused\",\"source\":\"WEB\"}");
    assertEquals(HttpStatus.CREATED, timerStart.getStatusCode());
    assertEquals(labelId, timerStart.getBody().get("labelIds").get(0).asText());
    String timerId = timerStart.getBody().get("id").asText();
    post("/api/v1/timers/" + timerId + "/stop", token, "{}");
  }

  @Test
  void labelCatalogSupportsLabelsHiddenFromCalendar() {
    String token = freshToken();

    ResponseEntity<JsonNode> created =
        post(
            "/api/v1/labels",
            token,
            "{\"name\":\"Private\",\"scopes\":[\"NOTE\",\"TIME_ENTRY\",\"LOG\"]}");

    assertEquals(HttpStatus.CREATED, created.getStatusCode());
    assertEquals("Private", created.getBody().get("name").asText());
    assertFalse(get("/api/v1/labels?scope=CALENDAR", token).getBody().elements().hasNext());
    assertEquals(
        "Private",
        get("/api/v1/labels?scope=TIME_ENTRY", token).getBody().get(0).get("name").asText());
  }

  @Test
  void manualTimeEntryIsCreated() {
    String token = freshToken();
    String start = Instant.now().minus(2, ChronoUnit.HOURS).toString();
    String end = Instant.now().minus(1, ChronoUnit.HOURS).toString();

    // Manual time entry is at POST /api/v1/time-entries (returns 200)
    ResponseEntity<JsonNode> entry =
        post(
            "/api/v1/time-entries",
            token,
            "{\"startedAt\":\""
                + start
                + "\",\"labelIds\":[],\"endedAt\":\""
                + end
                + "\","
                + "\"description\":\"Manual entry\"}");
    assertEquals(HttpStatus.OK, entry.getStatusCode());
    assertFalse(entry.getBody().get("running").asBoolean());
    assertEquals(3600L, entry.getBody().get("durationSeconds").asLong(), 5L);
  }

  @Test
  void timeEntryDetailReturnsOwnedEntryAndHidesMissingOrForeignIds() {
    String owner = freshToken();
    String other = freshToken();
    String start = "2026-10-09T08:00:00Z";
    String end = "2026-10-09T09:00:00Z";
    ResponseEntity<JsonNode> created =
        post(
            "/api/v1/time-entries",
            owner,
            "{\"startedAt\":\""
                + start
                + "\",\"endedAt\":\""
                + end
                + "\",\"labelIds\":[],\"description\":\"Owned entry detail\"}");
    assertEquals(HttpStatus.OK, created.getStatusCode());
    String entryId = created.getBody().get("id").asText();

    ResponseEntity<JsonNode> detail = get("/api/v1/time-entries/" + entryId, owner);
    assertEquals(HttpStatus.OK, detail.getStatusCode());
    assertEquals(entryId, detail.getBody().get("id").asText());
    assertEquals("Owned entry detail", detail.getBody().get("description").asText());
    assertEquals(3600, detail.getBody().get("durationSeconds").asLong());
    assertEquals(
        HttpStatus.NOT_FOUND,
        get("/api/v1/time-entries/" + entryId, other).getStatusCode());
    assertEquals(
        HttpStatus.NOT_FOUND,
        get("/api/v1/time-entries/" + UUID.randomUUID(), owner).getStatusCode());
  }

  // Criteria: statistics (today / week / month, path/label breakdowns)

  @Test
  void statisticsIncludePathAndLabelBreakdowns() {
    String token = freshToken();

    ResponseEntity<JsonNode> stats = get("/api/v1/statistics", token);
    assertEquals(HttpStatus.OK, stats.getStatusCode());
    assertTrue(stats.getBody().has("todaySeconds"));
    assertTrue(stats.getBody().has("weekSeconds"));
    assertTrue(stats.getBody().has("monthSeconds"));
    assertTrue(stats.getBody().has("todayByPath"));
    assertTrue(stats.getBody().has("weekByPath"));
    assertTrue(stats.getBody().has("todayByLabel"));
    assertTrue(stats.getBody().has("weekByLabel"));
  }

  // Criteria: activity stream

  @Test
  void timerTransitionsAreNotPersistedAsActivityEvents() {
    String token = freshToken();

    // Start timer; sessions are now read from time_entry rather than persisted as activity rows.
    ResponseEntity<JsonNode> timerRes =
        post(
            "/api/v1/timers",
            token,
            "{\"labelIds\":[],\"description\":\"Activity timer\",\"source\":\"WEB\"}");
    String timerId = timerRes.getBody().get("id").asText();
    post("/api/v1/timers/" + timerId + "/stop", token, "{}");

    ResponseEntity<JsonNode> activities = get("/api/v1/activities", token);
    assertEquals(HttpStatus.OK, activities.getStatusCode());
    assertTrue(activities.getBody().isArray());

    boolean hasTimerStarted = false;
    for (JsonNode n : activities.getBody()) {
      String type = n.get("type").asText();
      if ("TIMER_STARTED".equals(type)) hasTimerStarted = true;
    }
    assertFalse(hasTimerStarted, "timer transition activity should not be persisted");
  }

  @Test
  void searchQueryTooLongIsRejected() {
    String token = freshToken();
    ResponseEntity<JsonNode> result = get("/api/v1/search?q=" + "x".repeat(201), token);
    assertEquals(HttpStatus.BAD_REQUEST, result.getStatusCode());
  }

  // Criteria: path summary (tracked time and activity)

  @Test
  void pathSummaryIncludesTrackedTimeWithoutRemovedItemFields() {
    String token = freshToken();
    ResponseEntity<JsonNode> path =
        post("/api/v1/paths", token, "{\"name\":\"Summary Path\",\"description\":null}");
    String pathId = path.getBody().get("id").asText();

    // Track some time for this path
    String start = Instant.now().minus(30, ChronoUnit.MINUTES).toString();
    String end = Instant.now().toString();
    post(
        "/api/v1/time-entries",
        token,
        "{\"pathId\":\""
            + pathId
            + "\",\"labelIds\":[],\"startedAt\":\""
            + start
            + "\",\"endedAt\":\""
            + end
            + "\","
            + "\"description\":\"Summary test\"}");

    ResponseEntity<JsonNode> summary = get("/api/v1/paths/" + pathId + "/summary", token);
    assertEquals(HttpStatus.OK, summary.getStatusCode());
    assertTrue(
        summary.getBody().get("trackedSeconds").asLong() > 0, "tracked seconds should be positive");
    assertFalse(summary.getBody().has("itemIds"), "summary should not expose removed items");
  }

  @Test
  void pathSummaryAddsPersistedEntryDurationsAcrossTheRequestedPath() {
    String token = freshToken();
    String pathId =
        post("/api/v1/paths", token, "{\"name\":\"Exact summary\"}")
            .getBody()
            .get("id")
            .asText();
    post(
        "/api/v1/time-entries",
        token,
        "{\"pathId\":\""
            + pathId
            + "\",\"labelIds\":[],\"startedAt\":\"2026-01-01T00:00:00Z\","
            + "\"endedAt\":\"2026-01-01T00:30:00Z\",\"description\":\"First interval\"}");
    post(
        "/api/v1/time-entries",
        token,
        "{\"pathId\":\""
            + pathId
            + "\",\"labelIds\":[],\"startedAt\":\"2026-01-01T00:30:00Z\","
            + "\"endedAt\":\"2026-01-01T01:00:00Z\",\"description\":\"Second interval\"}");

    ResponseEntity<JsonNode> summary = get("/api/v1/paths/" + pathId + "/summary", token);
    assertEquals(HttpStatus.OK, summary.getStatusCode());
    assertEquals(3600, summary.getBody().get("trackedSeconds").asLong());
  }

  // Criteria: path ordering by most-recent use

  @Test
  void pathsAreOrderedByMostRecentUse() {
    String token = freshToken();

    ResponseEntity<JsonNode> pathA =
        post("/api/v1/paths", token, "{\"name\":\"Older Path\",\"description\":null}");
    ResponseEntity<JsonNode> pathB =
        post("/api/v1/paths", token, "{\"name\":\"Newer Path\",\"description\":null}");
    String pathIdB = pathB.getBody().get("id").asText();

    // Touch path B by updating it so its updatedAt is more recent
    put("/api/v1/paths/" + pathIdB, token, "{\"name\":\"Newer Path\",\"description\":\"touched\"}");

    ResponseEntity<JsonNode> list = get("/api/v1/paths", token);
    assertEquals(HttpStatus.OK, list.getStatusCode());
    assertTrue(list.getBody().isArray() && list.getBody().size() >= 2);
    // First path in the list should be pathB (most recently updated)
    assertEquals(
        pathIdB,
        list.getBody().get(0).get("id").asText(),
        "Most-recently-used path should appear first");
  }

  // Criteria: reports (week / month / year)

  @Test
  void reportsReturnDayLevelBreakdownForAllPeriods() {
    String token = freshToken();

    // Create a manual time entry so reports have data
    String start = Instant.now().minus(2, ChronoUnit.HOURS).toString();
    String end = Instant.now().minus(1, ChronoUnit.HOURS).toString();
    post(
        "/api/v1/time-entries",
        token,
        "{\"startedAt\":\""
            + start
            + "\",\"labelIds\":[],\"endedAt\":\""
            + end
            + "\","
            + "\"description\":\"Report test\"}");

    for (String period : new String[] {"WEEK", "MONTH", "YEAR"}) {
      ResponseEntity<JsonNode> report = get("/api/v1/reports?period=" + period, token);
      assertEquals(HttpStatus.OK, report.getStatusCode(), "Report period: " + period);
      assertTrue(report.getBody().has("period"), "should have period field");
      assertTrue(report.getBody().has("days"), "should have days field");
    }
  }

  @Test
  void postgresReportRangeUsesUtcLeapDayAndExactHalfOpenInstantBoundaries() {
    if (System.getenv("KB_TEST_POSTGRES_URL") == null) {
      org.junit.jupiter.api.Assumptions.assumeTrue(
          false, "This timestamp boundary case is part of the PostgreSQL integration profile");
    }
    doReturn(Instant.parse("2024-03-01T00:00:10Z")).when(clock).instant();
    String token = freshToken();
    for (String entry :
        new String[] {
          "\"startedAt\":\"2024-02-28T23:59:50Z\",\"endedAt\":\"2024-02-29T00:00:00Z\",\"description\":\"ends at range start\"",
          "\"startedAt\":\"2024-02-29T00:00:00Z\",\"endedAt\":\"2024-02-29T00:00:10Z\",\"description\":\"starts at range start\"",
          "\"startedAt\":\"2024-02-29T12:00:00Z\",\"endedAt\":\"2024-02-29T12:00:00Z\",\"description\":\"zero duration\"",
          "\"startedAt\":\"2024-03-01T00:00:00Z\",\"endedAt\":\"2024-03-01T00:00:10Z\",\"description\":\"starts at exclusive end\""
        }) {
      ResponseEntity<JsonNode> created =
          post("/api/v1/time-entries", token, "{" + entry + ",\"labelIds\":[]}");
      assertEquals(HttpStatus.OK, created.getStatusCode(), String.valueOf(created.getBody()));
    }

    ResponseEntity<JsonNode> response =
        get("/api/v1/reports?startDate=2024-02-29&endDate=2024-02-29", token);
    assertEquals(HttpStatus.OK, response.getStatusCode(), String.valueOf(response.getBody()));
    JsonNode report = response.getBody();
    assertEquals("2024-02-29", report.get("from").asText());
    assertEquals("2024-02-29", report.get("to").asText());
    assertEquals(10, report.get("totalSeconds").asLong());
    assertEquals("2024-02-29", report.get("days").get(0).get("date").asText());
    assertEquals(10, report.get("days").get(0).get("totalSeconds").asLong());

    for (String[] period :
        new String[][] {
          {"WEEK", "2024-02-26", "2024-03-03"},
          {"MONTH", "2024-02-01", "2024-02-29"},
          {"YEAR", "2024-01-01", "2024-12-31"}
        }) {
      JsonNode window =
          get("/api/v1/reports?period=" + period[0] + "&anchor=2024-02-29", token).getBody();
      assertEquals(period[1], window.get("from").asText(), period[0]);
      assertEquals(period[2], window.get("to").asText(), period[0]);
    }
    JsonNode rollover =
        get("/api/v1/reports?period=WEEK&anchor=2024-12-31", token).getBody();
    assertEquals("2024-12-30", rollover.get("from").asText());
    assertEquals("2025-01-05", rollover.get("to").asText());
  }

  @Test
  void postgresRunningEntryReportUsesInjectedNowAtUtcDayBoundary() {
    if (System.getenv("KB_TEST_POSTGRES_URL") == null) {
      org.junit.jupiter.api.Assumptions.assumeTrue(
          false, "This injected-clock running-entry case runs against PostgreSQL");
    }
    Instant startedAt = Instant.parse("2024-03-10T06:59:20Z");
    Instant now = Instant.parse("2024-03-10T07:00:00Z");
    doReturn(startedAt).when(clock).instant();
    String token = freshToken();
    ResponseEntity<JsonNode> started =
        post(
            "/api/v1/timers",
            token,
            "{\"labelIds\":[],\"description\":\"Frozen running entry\",\"source\":\"WEB\"}");
    assertEquals(HttpStatus.CREATED, started.getStatusCode(), String.valueOf(started.getBody()));
    doReturn(now).when(clock).instant();

    ResponseEntity<JsonNode> response =
        get("/api/v1/reports?startDate=2024-03-10&endDate=2024-03-10", token);
    assertEquals(HttpStatus.OK, response.getStatusCode(), String.valueOf(response.getBody()));
    assertEquals("2024-03-10", response.getBody().get("from").asText());
    assertEquals("2024-03-10", response.getBody().get("to").asText());
    assertEquals(40, response.getBody().get("totalSeconds").asLong());
  }

  @Test
  void postgresReportAndCalendarKeepOneYearResultShapesBoundedAndComplete() {
    if (System.getenv("KB_TEST_POSTGRES_URL") == null) {
      org.junit.jupiter.api.Assumptions.assumeTrue(
          false, "This one-year volume case runs against PostgreSQL");
    }
    String token = freshToken();
    Instant base = Instant.parse("2024-03-31T12:00:00Z");
    for (int index = 0; index < 48; index++) {
      Instant start = base.plusSeconds(index * 60L);
      ResponseEntity<JsonNode> created =
          post(
              "/api/v1/time-entries",
              token,
              "{\"startedAt\":\""
                  + start
                  + "\",\"endedAt\":\""
                  + start.plusSeconds(5)
                  + "\",\"labelIds\":[],\"description\":\"volume entry "
                  + index
                  + "\"}");
      assertEquals(HttpStatus.OK, created.getStatusCode(), String.valueOf(created.getBody()));
    }
    assertEquals(
        HttpStatus.OK,
        put(
                "/api/v1/calendar/days/range",
                token,
                "{\"startDate\":\"2024-01-01\",\"endDate\":\"2024-12-31\","
                    + "\"note\":\"volume calendar\",\"labels\":[]}")
            .getStatusCode());

    JsonNode report =
        get("/api/v1/reports?startDate=2024-01-01&endDate=2024-12-31", token).getBody();
    assertEquals(366, report.get("days").size());
    assertEquals(240, report.get("totalSeconds").asLong());
    assertTrue(report.get("days").get(90).get("calendarNote").asText().equals("volume calendar"));
    JsonNode calendar =
        get("/api/v1/calendar/days?startDate=2024-01-01&endDate=2024-12-31", token).getBody();
    assertEquals(366, calendar.size());
    assertEquals("2024-01-01", calendar.get(0).get("date").asText());
    assertEquals("2024-12-31", calendar.get(365).get("date").asText());
  }

  @Test
  void postgresExportKeepsHighVolumeLogRecordsStablyOrdered() {
    if (System.getenv("KB_TEST_POSTGRES_URL") == null) {
      org.junit.jupiter.api.Assumptions.assumeTrue(
          false, "This export volume case runs against PostgreSQL");
    }
    String token = freshToken();
    List<UUID> ids = new ArrayList<>();
    StringBuilder csv = new StringBuilder("entity,id,payload\n");
    for (int index = 0; index < 60; index++) {
      UUID id = UUID.randomUUID();
      ids.add(id);
      String occurredAt = Instant.parse("2024-01-01T00:00:00Z").plusSeconds(index).toString();
      csv.append(
          csvRow(
              "log",
              id,
              "{\"body\":\"Export volume "
                  + index
                  + "\",\"occurredAt\":\""
                  + occurredAt
                  + "\",\"createdAt\":\""
                  + occurredAt
                  + "\",\"updatedAt\":\""
                  + occurredAt
                  + "\",\"labelIds\":[]}"));
    }
    ResponseEntity<JsonNode> imported = importCsv(token, csv.toString());
    assertEquals(HttpStatus.OK, imported.getStatusCode(), String.valueOf(imported.getBody()));
    assertEquals(60, imported.getBody().get("imported").asInt());

    String exported = exportCsv(token).getBody();
    String[] lines = exported.strip().split("\\n");
    List<String> exportedLogIds =
        java.util.Arrays.stream(lines)
            .filter(line -> line.startsWith("log,"))
            .map(line -> line.split(",", 3)[1])
            .toList();
    assertEquals(60, exportedLogIds.size());
    assertEquals(ids.reversed().stream().map(UUID::toString).toList(), exportedLogIds);
    assertTrue(exported.length() < 25_000_000);
  }

  @Test
  void reportBadPeriodIsRejected() {
    String token = freshToken();
    ResponseEntity<JsonNode> result = get("/api/v1/reports?period=INVALID", token);
    assertEquals(HttpStatus.BAD_REQUEST, result.getStatusCode());
  }

  // Criteria: Clockify import / batches / undo

  @Test
  void clockifyImportCreatesEntriesAndPaths() {
    String token = freshToken();
    String uniqueProject = "IntegrationProject-" + UUID.randomUUID().toString().substring(0, 8);

    String payload =
        "{"
            + "\"timeentries\":[{"
            + "\"_id\":\"abc123\","
            + "\"description\":\"Reading session\","
            + "\"projectName\":\""
            + uniqueProject
            + "\","
            + "\"timeInterval\":{\"start\":\"2024-07-01T10:00:00Z\","
            + "\"end\":\"2024-07-01T11:30:00Z\",\"duration\":5400}"
            + "}]}";

    ResponseEntity<JsonNode> imported = post("/api/v1/imports/clockify", token, payload);
    assertEquals(HttpStatus.OK, imported.getStatusCode());
    assertEquals(1, imported.getBody().get("imported").asInt());
    assertEquals(0, imported.getBody().get("skipped").asInt());
    assertEquals(1, imported.getBody().get("createdPaths").asInt());
    assertNotNull(imported.getBody().get("batchId").asText());

    // Path was created from project name
    ResponseEntity<JsonNode> paths = get("/api/v1/paths", token);
    boolean pathFound = false;
    for (JsonNode n : paths.getBody()) {
      if (uniqueProject.equalsIgnoreCase(n.get("name").asText())) {
        pathFound = true;
        break;
      }
    }
    assertTrue(pathFound, "Clockify project path should be created");
  }

  @Test
  void postgresClockifyImportRollsBackEarlierPathEntryAndBatchOnLaterInvalidInterval() {
    if (System.getenv("KB_TEST_POSTGRES_URL") == null) {
      org.junit.jupiter.api.Assumptions.assumeTrue(
          false, "This Clockify transaction rollback case runs against PostgreSQL");
    }
    String token = freshToken();
    String project = "RollbackProject-" + UUID.randomUUID();
    String payload =
        "{\"timeentries\":["
            + "{\"_id\":\"valid-first\",\"projectName\":\""
            + project
            + "\",\"description\":\"first row\",\"timeInterval\":{"
            + "\"start\":\"2024-07-01T10:00:00Z\",\"end\":\"2024-07-01T11:00:00Z\"}},"
            + "{\"_id\":\"invalid-later\",\"projectName\":\""
            + project
            + "\",\"description\":\"invalid row\",\"timeInterval\":{"
            + "\"start\":\"2024-07-01T12:00:00Z\",\"end\":\"2024-07-01T11:00:00Z\"}}]}";

    ResponseEntity<JsonNode> result = post("/api/v1/imports/clockify", token, payload);
    assertEquals(HttpStatus.BAD_REQUEST, result.getStatusCode(), String.valueOf(result.getBody()));
    assertTrue(get("/api/v1/paths", token).getBody().isEmpty());
    assertTrue(get("/api/v1/time-entries", token).getBody().isEmpty());
    assertTrue(get("/api/v1/imports/clockify/batches", token).getBody().isEmpty());
    for (JsonNode board : get("/api/v1/boards?includeHidden=true", token).getBody())
      assertFalse(project.equals(board.path("name").asText(null)));
  }

  @Test
  void clockifyImportIsIdempotentOnDuplicateExternalId() {
    String token = freshToken();
    String entryId = "dup-" + UUID.randomUUID();

    String payload =
        "{"
            + "\"timeentries\":[{"
            + "\"_id\":\""
            + entryId
            + "\","
            + "\"description\":\"First import\","
            + "\"timeInterval\":{\"start\":\"2024-07-02T09:00:00Z\","
            + "\"end\":\"2024-07-02T10:00:00Z\",\"duration\":3600}"
            + "}]}";

    post("/api/v1/imports/clockify", token, payload);
    ResponseEntity<JsonNode> second = post("/api/v1/imports/clockify", token, payload);
    assertEquals(HttpStatus.OK, second.getStatusCode());
    assertEquals(0, second.getBody().get("imported").asInt());
    assertEquals(1, second.getBody().get("skipped").asInt());
  }

  @Test
  void clockifyImportSkipsSoftDeletedExternalId() {
    String token = freshToken();
    String entryId = "deleted-dup-" + UUID.randomUUID();
    String description = "Soft-deleted Clockify import " + UUID.randomUUID();
    String payload =
        "{\"timeentries\":[{\"_id\":\""
            + entryId
            + "\",\"description\":\""
            + description
            + "\",\"timeInterval\":{\"start\":\"2024-07-02T09:00:00Z\","
            + "\"end\":\"2024-07-02T10:00:00Z\",\"duration\":3600}}]}";

    ResponseEntity<JsonNode> first = post("/api/v1/imports/clockify", token, payload);
    assertEquals(HttpStatus.OK, first.getStatusCode());
    JsonNode history = get("/api/v1/time-entries", token).getBody();
    String timeEntryId = null;
    for (JsonNode entry : history) {
      if (description.equals(entry.get("description").asText())) {
        timeEntryId = entry.get("id").asText();
        break;
      }
    }
    assertNotNull(timeEntryId);
    assertEquals(
        HttpStatus.NO_CONTENT,
        delete("/api/v1/time-entries/" + timeEntryId, token).getStatusCode());

    ResponseEntity<JsonNode> reimport = post("/api/v1/imports/clockify", token, payload);
    assertEquals(HttpStatus.OK, reimport.getStatusCode());
    assertEquals(0, reimport.getBody().get("imported").asInt());
    assertEquals(1, reimport.getBody().get("skipped").asInt());
  }

  @Test
  void clockifyImportBatchesListedAndUndone() {
    String token = freshToken();

    // Import a batch
    String payload =
        "{"
            + "\"timeentries\":[{"
            + "\"_id\":\"undo-test-"
            + UUID.randomUUID()
            + "\","
            + "\"description\":\"Undo me\","
            + "\"timeInterval\":{\"start\":\"2024-07-03T08:00:00Z\","
            + "\"end\":\"2024-07-03T09:00:00Z\",\"duration\":3600}"
            + "}]}";
    ResponseEntity<JsonNode> imported = post("/api/v1/imports/clockify", token, payload);
    String batchId = imported.getBody().get("batchId").asText();

    // List batches
    ResponseEntity<JsonNode> batches = get("/api/v1/imports/clockify/batches", token);
    assertEquals(HttpStatus.OK, batches.getStatusCode());
    boolean batchFound = false;
    for (JsonNode n : batches.getBody()) {
      if (n.get("id").asText().equals(batchId)) {
        batchFound = true;
        break;
      }
    }
    assertTrue(batchFound, "batch should appear in list");

    // Undo the batch
    ResponseEntity<JsonNode> undo = delete("/api/v1/imports/clockify/batches/" + batchId, token);
    assertEquals(HttpStatus.OK, undo.getStatusCode());
    assertTrue(
        undo.getBody().get("deletedEntries").asLong() > 0, "at least one entry should be deleted");
  }

  @Test
  void clockifyBatchListAndUndoAreOwnerScopedOrderedAndIdempotent() {
    String owner = freshToken();
    String other = freshToken();
    String firstExternalId = "batch-first-" + UUID.randomUUID();
    String secondExternalId = "batch-second-" + UUID.randomUUID();
    String firstPayload =
        "{\"timeentries\":[{\"_id\":\""
            + firstExternalId
            + "\",\"description\":\"First batch\",\"timeInterval\":{"
            + "\"start\":\"2024-07-03T08:00:00Z\",\"end\":\"2024-07-03T09:00:00Z\",\"duration\":3600}}]}";
    String secondPayload =
        "{\"timeentries\":[{\"_id\":\""
            + secondExternalId
            + "\",\"description\":\"Second batch\",\"timeInterval\":{"
            + "\"start\":\"2024-07-04T08:00:00Z\",\"end\":\"2024-07-04T09:00:00Z\",\"duration\":3600}}]}";
    ResponseEntity<JsonNode> first = post("/api/v1/imports/clockify", owner, firstPayload);
    ResponseEntity<JsonNode> second = post("/api/v1/imports/clockify", owner, secondPayload);
    assertEquals(HttpStatus.OK, first.getStatusCode());
    assertEquals(HttpStatus.OK, second.getStatusCode());
    String firstBatchId = first.getBody().get("batchId").asText();
    String secondBatchId = second.getBody().get("batchId").asText();

    JsonNode listed = get("/api/v1/imports/clockify/batches", owner).getBody();
    assertEquals(2, listed.size());
    assertEquals(secondBatchId, listed.get(0).get("id").asText(), "Batch list is newest first");
    assertEquals(firstBatchId, listed.get(1).get("id").asText());
    assertTrue(get("/api/v1/imports/clockify/batches", other).getBody().isEmpty());
    assertEquals(
        HttpStatus.NOT_FOUND,
        delete("/api/v1/imports/clockify/batches/" + secondBatchId, other).getStatusCode());
    assertEquals(2, get("/api/v1/time-entries", owner).getBody().size());

    ResponseEntity<JsonNode> undo =
        delete("/api/v1/imports/clockify/batches/" + secondBatchId, owner);
    assertEquals(HttpStatus.OK, undo.getStatusCode());
    assertEquals(1, undo.getBody().get("deletedEntries").asInt());
    assertEquals(1, get("/api/v1/time-entries", owner).getBody().size());

    ResponseEntity<JsonNode> repeatedUndo =
        delete("/api/v1/imports/clockify/batches/" + secondBatchId, owner);
    assertEquals(HttpStatus.OK, repeatedUndo.getStatusCode());
    assertEquals(0, repeatedUndo.getBody().get("deletedEntries").asInt());
    assertEquals(1, get("/api/v1/time-entries", owner).getBody().size());
  }

  @Test
  void clockifyImportPreservesIndividualSessionIntervals() {
    String token = freshToken();

    // Import two sessions with different start/end intervals
    String entry1Id = "interval-a-" + UUID.randomUUID();
    String entry2Id = "interval-b-" + UUID.randomUUID();
    String payload =
        "{"
            + "\"timeentries\":["
            + "{\"_id\":\""
            + entry1Id
            + "\","
            + "\"description\":\"Session A\","
            + "\"timeInterval\":{\"start\":\"2024-07-10T08:00:00Z\","
            + "\"end\":\"2024-07-10T09:00:00Z\",\"duration\":3600}},"
            + "{\"_id\":\""
            + entry2Id
            + "\","
            + "\"description\":\"Session B\","
            + "\"timeInterval\":{\"start\":\"2024-07-10T11:00:00Z\","
            + "\"end\":\"2024-07-10T12:30:00Z\",\"duration\":5400}}"
            + "]}";

    ResponseEntity<JsonNode> imported = post("/api/v1/imports/clockify", token, payload);
    assertEquals(HttpStatus.OK, imported.getStatusCode());
    assertEquals(2, imported.getBody().get("imported").asInt());

    // Verify timer history shows distinct entries
    ResponseEntity<JsonNode> history = get("/api/v1/time-entries", token);
    long sessionA = 0, sessionB = 0;
    for (JsonNode e : history.getBody()) {
      String desc = e.get("description").asText();
      if ("Session A".equals(desc)) sessionA = e.get("durationSeconds").asLong();
      if ("Session B".equals(desc)) sessionB = e.get("durationSeconds").asLong();
    }
    assertEquals(3600, sessionA, "Session A should be 3600 seconds");
    assertEquals(5400, sessionB, "Session B should be 5400 seconds");
  }

  // Criteria: health check endpoint

  @Test
  void actuatorHealthEndpointIsPublicAndReturnsUp() {
    ResponseEntity<JsonNode> health = rest.getForEntity(base + "/actuator/health", JsonNode.class);
    assertEquals(HttpStatus.OK, health.getStatusCode());
    assertEquals("UP", health.getBody().get("status").asText());
  }

  // Criteria: API size validation

  @Test
  void oversizedNoteContentIsAcceptedUpToLimit() {
    String token = freshToken();
    // title max 240; content is text (no max in schema), so test a large but valid note
    String largeContent = "x".repeat(5000);
    ResponseEntity<JsonNode> note =
        post(
            "/api/v1/notes",
            token,
            "{\"title\":\"Large Note\",\"content\":\"" + largeContent + "\"}");
    assertEquals(HttpStatus.OK, note.getStatusCode());
  }

  @Test
  void calendarDayLifecycleSupportsNotesMarkersAndPortionedLeave() {
    String token = freshToken();
    ResponseEntity<JsonNode> sickLeave =
        post("/api/v1/calendar/labels", token, "{\"name\":\"Sick leave\",\"color\":\"#2878D5\"}");
    ResponseEntity<JsonNode> milestone =
        post("/api/v1/calendar/labels", token, "{\"name\":\"Milestone\"}");
    assertEquals(HttpStatus.CREATED, sickLeave.getStatusCode());
    String sickLeaveId = sickLeave.getBody().get("id").asText();
    String milestoneId = milestone.getBody().get("id").asText();

    ResponseEntity<JsonNode> saved =
        put(
            "/api/v1/calendar/days/2026-09-04",
            token,
            "{\"note\":\"Doctor advised rest\",\"labels\":[{\"labelId\":\""
                + sickLeaveId
                + "\",\"portion\":1.0},{\"labelId\":\""
                + milestoneId
                + "\"}]}");
    assertEquals(HttpStatus.OK, saved.getStatusCode());
    assertEquals("Doctor advised rest", saved.getBody().get("note").asText());
    assertEquals(2, saved.getBody().get("labels").size());

    JsonNode listed =
        get("/api/v1/calendar/days?startDate=2026-09-01&endDate=2026-09-30", token).getBody();
    assertEquals(1, listed.size());
    assertEquals("2026-09-04", listed.get(0).get("date").asText());

    ResponseEntity<JsonNode> replacement =
        put(
            "/api/v1/calendar/days/2026-09-04",
            token,
            "{\"note\":\"Recovery milestone\",\"labels\":[{\"labelId\":\"" + milestoneId + "\"}]}");
    assertEquals(HttpStatus.OK, replacement.getStatusCode());
    assertEquals(1, replacement.getBody().get("labels").size());
    assertEquals("Milestone", replacement.getBody().get("labels").get(0).get("name").asText());
    assertTrue(replacement.getBody().get("labels").get(0).get("portion").isNull());

    assertEquals(
        HttpStatus.NO_CONTENT, delete("/api/v1/calendar/days/2026-09-04", token).getStatusCode());
    assertEquals(
        0,
        get("/api/v1/calendar/days?startDate=2026-09-04&endDate=2026-09-04", token)
            .getBody()
            .size());
  }

  @Test
  void calendarDayDeleteIsOwnerScopedAndIdempotent() {
    String owner = freshToken();
    String other = freshToken();
    String date = "2026-09-06";
    ResponseEntity<JsonNode> saved =
        put("/api/v1/calendar/days/" + date, owner, "{\"note\":\"Owner's day\",\"labels\":[]}");
    assertEquals(HttpStatus.OK, saved.getStatusCode());

    assertEquals(HttpStatus.NO_CONTENT, delete("/api/v1/calendar/days/" + date, other).getStatusCode());
    JsonNode ownerDays =
        get("/api/v1/calendar/days?startDate=" + date + "&endDate=" + date, owner).getBody();
    assertEquals(1, ownerDays.size());
    assertEquals("Owner's day", ownerDays.get(0).get("note").asText());
    assertEquals(
        0,
        get("/api/v1/calendar/days?startDate=" + date + "&endDate=" + date, other)
            .getBody()
            .size());

    assertEquals(HttpStatus.NO_CONTENT, delete("/api/v1/calendar/days/" + date, owner).getStatusCode());
    assertEquals(HttpStatus.NO_CONTENT, delete("/api/v1/calendar/days/" + date, owner).getStatusCode());
    assertEquals(
        0,
        get("/api/v1/calendar/days?startDate=" + date + "&endDate=" + date, owner)
            .getBody()
            .size());
  }

  @Test
  void calendarLabelsAreOwnerScopedAndAppearSeparatelyInReports() {
    String owner = freshToken();
    String other = freshToken();
    ResponseEntity<JsonNode> vacation =
        post("/api/v1/calendar/labels", owner, "{\"name\":\"Vacation\",\"color\":\"#009688\"}");
    String labelId = vacation.getBody().get("id").asText();

    assertEquals(
        HttpStatus.NOT_FOUND,
        put(
                "/api/v1/calendar/days/2026-09-05",
                other,
                "{\"labels\":[{\"labelId\":\"" + labelId + "\",\"portion\":0.5}]}")
            .getStatusCode());
    assertEquals(
        HttpStatus.OK,
        put(
                "/api/v1/calendar/days/2026-09-05",
                owner,
                "{\"note\":\"Annual leave\",\"labels\":[{\"labelId\":\""
                    + labelId
                    + "\",\"portion\":0.5}]}")
            .getStatusCode());
    assertEquals(
        HttpStatus.CONFLICT, delete("/api/v1/calendar/labels/" + labelId, owner).getStatusCode());

    JsonNode report = get("/api/v1/reports?period=MONTH&anchor=2026-09-05", owner).getBody();
    assertEquals(0, report.get("totalSeconds").asLong());
    JsonNode summary = report.get("calendarLabels");
    assertEquals(1, summary.size());
    assertEquals("Vacation", summary.get(0).get("label").asText());
    assertEquals(0.5, summary.get(0).get("days").asDouble());
    assertEquals(0, summary.get(0).get("markers").asInt());
    JsonNode loggedDay = report.get("days").get(4);
    assertEquals("Annual leave", loggedDay.get("calendarNote").asText());
    assertEquals("Vacation", loggedDay.get("calendarLabels").get(0).get("label").asText());
  }

  @Test
  void calendarRangeAppliesLeaveAcrossEveryDayWithoutReplacingExistingLabels() {
    String token = freshToken();
    String sickLeaveId =
        post("/api/v1/calendar/labels", token, "{\"name\":\"Sick leave\"}")
            .getBody()
            .get("id")
            .asText();
    String milestoneId =
        post("/api/v1/calendar/labels", token, "{\"name\":\"Milestone\"}")
            .getBody()
            .get("id")
            .asText();
    assertEquals(
        HttpStatus.OK,
        put(
                "/api/v1/calendar/days/2026-09-10",
                token,
                "{\"note\":\"Existing record\",\"labels\":[{\"labelId\":\"" + milestoneId + "\"}]}")
            .getStatusCode());

    ResponseEntity<JsonNode> applied =
        put(
            "/api/v1/calendar/days/range",
            token,
            "{\"startDate\":\"2026-09-09\",\"endDate\":\"2026-09-11\",\"labels\":[{\"labelId\":\""
                + sickLeaveId
                + "\",\"portion\":1.0}]}");
    assertEquals(HttpStatus.OK, applied.getStatusCode());
    assertEquals(3, applied.getBody().size());
    for (JsonNode day : applied.getBody()) {
      assertTrue(day.get("labels").toString().contains("Sick leave"));
      assertEquals(
          1.0,
          day.get("labels").get(day.get("labels").size() - 1).get("portion").asDouble(),
          0.001);
    }
    JsonNode middle = applied.getBody().get(1);
    assertEquals("Existing record", middle.get("note").asText());
    assertTrue(middle.get("labels").toString().contains("Milestone"));
    JsonNode report = get("/api/v1/reports?period=MONTH&anchor=2026-09-10", token).getBody();
    JsonNode sickSummary = null;
    for (JsonNode label : report.get("calendarLabels"))
      if (label.get("label").asText().equals("Sick leave")) sickSummary = label;
    assertNotNull(sickSummary);
    assertEquals(3.0, sickSummary.get("days").asDouble(), 0.001);
  }

  @Test
  void customReportReturnsEachCalendarRangeDayForChartAndLogConsumers() {
    String token = freshToken();
    String labelId =
        post("/api/v1/calendar/labels", token, "{\"name\":\"Release\",\"color\":\"#805AD5\"}")
            .getBody()
            .get("id")
            .asText();

    assertEquals(
        HttpStatus.OK,
        put(
                "/api/v1/calendar/days/range",
                token,
                "{\"startDate\":\"2026-09-01\",\"endDate\":\"2026-09-03\",\"note\":\"Release"
                    + " week\",\"labels\":[{\"labelId\":\""
                    + labelId
                    + "\",\"portion\":1.0}]}")
            .getStatusCode());

    JsonNode report =
        get("/api/v1/reports?startDate=2026-09-01&endDate=2026-09-03", token).getBody();
    assertEquals(3, report.get("days").size());
    for (int index = 0; index < 3; index++) {
      JsonNode day = report.get("days").get(index);
      assertEquals("Release week", day.get("calendarNote").asText());
      assertEquals("Release", day.get("calendarLabels").get(0).get("label").asText());
      assertEquals("#805AD5", day.get("calendarLabels").get(0).get("color").asText());
      assertEquals(1.0, day.get("calendarLabels").get(0).get("portion").asDouble(), 0.001);
    }
  }

  @Test
  void noMarkerCalendarLabelsPersistButDoNotAppearInReports() {
    String token = freshToken();
    String labelId =
        post("/api/v1/calendar/labels", token, "{\"name\":\"Calendar only\",\"color\":\"#805AD5\"}")
            .getBody()
            .get("id")
            .asText();
    String assignment = "{\"labels\":[{\"labelId\":\"" + labelId + "\",\"portion\":0}]}";
    assertEquals(
        HttpStatus.OK,
        put("/api/v1/calendar/days/2026-09-01", token, assignment).getStatusCode());
    assertEquals(
        HttpStatus.OK,
        put(
                "/api/v1/calendar/days/range",
                token,
                "{\"startDate\":\"2026-09-02\",\"endDate\":\"2026-09-03\","
                    + assignment.substring(1))
            .getStatusCode());
    JsonNode days =
        get("/api/v1/calendar/days?startDate=2026-09-01&endDate=2026-09-03", token).getBody();
    assertEquals(3, days.size());
    for (JsonNode day : days) {
      assertEquals(labelId, day.get("labels").get(0).get("labelId").asText());
      assertEquals(0.0, day.get("labels").get(0).get("portion").asDouble());
    }
    JsonNode report = get("/api/v1/reports?startDate=2026-09-01&endDate=2026-09-03", token).getBody();
    assertTrue(report.get("calendarLabels").isEmpty());
    for (JsonNode day : report.get("days")) assertTrue(day.get("calendarLabels").isEmpty());
    assertEquals(
        HttpStatus.OK,
        put(
                "/api/v1/calendar/days/2026-09-01",
                token,
                "{\"labels\":[{\"labelId\":\"" + labelId + "\"}]}")
            .getStatusCode());
    report = get("/api/v1/reports?startDate=2026-09-01&endDate=2026-09-03", token).getBody();
    assertEquals(1, report.get("calendarLabels").get(0).get("markers").asInt());
  }

  @Test
  void calendarRejectsMalformedAssignmentsAndOutOfRangeChangesEndToEnd() {
    String token = freshToken();
    String labelId =
        post(
                "/api/v1/calendar/labels",
                token,
                "{\"name\":\"Boundary label\",\"color\":\"#2878D5\"}")
            .getBody()
            .get("id")
            .asText();

    ResponseEntity<JsonNode> nullLabels =
        put(
            "/api/v1/calendar/days/2026-09-15",
            token,
            "{\"note\":\"missing labels\",\"labels\":null}");
    assertEquals(HttpStatus.BAD_REQUEST, nullLabels.getStatusCode());

    ResponseEntity<JsonNode> duplicateLabels =
        put(
            "/api/v1/calendar/days/2026-09-15",
            token,
            "{\"labels\":[{\"labelId\":\"" + labelId + "\"},{\"labelId\":\"" + labelId + "\"}]}");
    assertEquals(HttpStatus.BAD_REQUEST, duplicateLabels.getStatusCode());

    ResponseEntity<JsonNode> invalidPortion =
        put(
            "/api/v1/calendar/days/2026-09-15",
            token,
            "{\"labels\":[{\"labelId\":\"" + labelId + "\",\"portion\":0.30}]}");
    assertEquals(HttpStatus.BAD_REQUEST, invalidPortion.getStatusCode());

    ResponseEntity<JsonNode> oversizedRange =
        put(
            "/api/v1/calendar/days/range",
            token,
            "{\"startDate\":\"2026-01-01\",\"endDate\":\"2027-01-02\",\"labels\":[]}");
    assertEquals(HttpStatus.BAD_REQUEST, oversizedRange.getStatusCode());
  }

  @Test
  void calendarLabelColorCanBeChangedOnlyByItsOwnerAndFlowsToDayRecords() {
    String owner = freshToken();
    String other = freshToken();
    ResponseEntity<JsonNode> created =
        post("/api/v1/calendar/labels", owner, "{\"name\":\"Vacation\",\"color\":\"#2878D5\"}");
    String labelId = created.getBody().get("id").asText();
    assertEquals(
        HttpStatus.NOT_FOUND,
        put(
                "/api/v1/calendar/labels/" + labelId,
                other,
                "{\"name\":\"Vacation\",\"color\":\"#E05D44\"}")
            .getStatusCode());

    ResponseEntity<JsonNode> changed =
        put(
            "/api/v1/calendar/labels/" + labelId,
            owner,
            "{\"name\":\"Vacation\",\"color\":\"#E05D44\"}");
    assertEquals(HttpStatus.OK, changed.getStatusCode());
    assertEquals("#E05D44", changed.getBody().get("color").asText());
    put(
        "/api/v1/calendar/days/2026-09-12",
        owner,
        "{\"labels\":[{\"labelId\":\"" + labelId + "\"}]}");
    JsonNode day =
        get("/api/v1/calendar/days?startDate=2026-09-12&endDate=2026-09-12", owner)
            .getBody()
            .get(0);
    assertEquals("#E05D44", day.get("labels").get(0).get("color").asText());
    assertEquals(
        HttpStatus.BAD_REQUEST,
        put(
                "/api/v1/calendar/labels/" + labelId,
                owner,
                "{\"name\":\"Vacation\",\"color\":\"#123456\"}")
            .getStatusCode());
  }

  @Test
  void logsAreOwnedTimestampedAndOptimisticallyEditable() {
    String owner = freshToken();
    String other = freshToken();
    ResponseEntity<JsonNode> created =
        post(
            "/api/v1/logs",
            owner,
            "{\"body\":\"First thought\",\"occurredAt\":\"2026-09-11T10:15:00Z\"}");
    assertEquals(HttpStatus.CREATED, created.getStatusCode());
    String id = created.getBody().get("id").asText();
    long version = created.getBody().get("version").asLong();
    assertEquals("First thought", created.getBody().get("body").asText());
    assertEquals("2026-09-11T10:15:00Z", created.getBody().get("occurredAt").asText());
    assertEquals(1, get("/api/v1/logs", owner).getBody().size());
    assertEquals(0, get("/api/v1/logs", other).getBody().size());
    assertEquals(HttpStatus.OK, get("/api/v1/logs/" + id, owner).getStatusCode());
    assertEquals(HttpStatus.NOT_FOUND, get("/api/v1/logs/" + id, other).getStatusCode());
    assertTrue(get("/api/v1/labels?scope=LOG", owner).getBody().isEmpty());
    String ownerLabelId =
        post("/api/v1/labels", owner, "{\"name\":\"Important\",\"scopes\":[\"LOG\"]}")
            .getBody()
            .get("id")
            .asText();
    String otherLabelId =
        post("/api/v1/labels", other, "{\"name\":\"Private\",\"scopes\":[\"LOG\"]}")
            .getBody()
            .get("id")
            .asText();
    ResponseEntity<JsonNode> labeled =
        put("/api/v1/logs/" + id + "/labels", owner, "{\"labelIds\":[\"" + ownerLabelId + "\"]}");
    assertEquals(HttpStatus.OK, labeled.getStatusCode());
    assertTrue(labeled.getBody().get("labelIds").toString().contains(ownerLabelId));
    assertEquals(
        HttpStatus.NOT_FOUND,
        put("/api/v1/logs/" + id + "/labels", other, "{\"labelIds\":[]}").getStatusCode());
    assertEquals(
        HttpStatus.BAD_REQUEST,
        put("/api/v1/logs/" + id + "/labels", owner, "{\"labelIds\":[\"" + otherLabelId + "\"]}")
            .getStatusCode());
    assertEquals(
        HttpStatus.OK,
        put("/api/v1/logs/" + id + "/labels", owner, "{\"labelIds\":[]}").getStatusCode());
    assertEquals(
        HttpStatus.NOT_FOUND,
        put(
                "/api/v1/logs/" + id,
                other,
                "{\"body\":\"No access\",\"occurredAt\":\"2026-09-11T10:15:00Z\"}")
            .getStatusCode());
    ResponseEntity<JsonNode> updated =
        put(
            "/api/v1/logs/" + id,
            owner,
            "{\"body\":\"Edited thought\",\"occurredAt\":\"2026-09-11T11:20:00Z\",\"version\":"
                + version
                + "}");
    assertEquals(HttpStatus.OK, updated.getStatusCode());
    assertEquals("Edited thought", updated.getBody().get("body").asText());
    assertEquals(
        HttpStatus.CONFLICT,
        put(
                "/api/v1/logs/" + id,
                owner,
                "{\"body\":\"Stale\",\"occurredAt\":\"2026-09-11T11:20:00Z\",\"version\":"
                    + version
                    + "}")
            .getStatusCode());
    assertEquals(HttpStatus.NOT_FOUND, delete("/api/v1/logs/" + id, other).getStatusCode());
    assertEquals(HttpStatus.NO_CONTENT, delete("/api/v1/logs/" + id, owner).getStatusCode());
    assertEquals(HttpStatus.NOT_FOUND, get("/api/v1/logs/" + id, owner).getStatusCode());
  }
}
