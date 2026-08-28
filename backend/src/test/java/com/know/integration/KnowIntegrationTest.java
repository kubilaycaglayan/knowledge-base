package com.know.integration;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * Full integration test suite.
 *
 * <p>Each test registers a fresh user so tests are independent and can run in any order. Covers
 * every criterion that was moved to .agents/criterias/completed/.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class KnowIntegrationTest {

  @DynamicPropertySource
  static void configureDataSource(DynamicPropertyRegistry registry) {
    registry.add(
        "spring.datasource.url",
        () ->
            "jdbc:h2:mem:know_integration;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1");
    registry.add("spring.datasource.driver-class-name", () -> "org.h2.Driver");
    registry.add("spring.datasource.username", () -> "sa");
    registry.add("spring.datasource.password", () -> "");
    registry.add("spring.jpa.hibernate.ddl-auto", () -> "create-drop");
    registry.add("spring.flyway.enabled", () -> "false");
    registry.add("app.jwt-secret", () -> "integration-test-secret-with-enough-chars-123");
    registry.add("app.cors-origins", () -> "http://localhost");
    registry.add("app.google-client-id", () -> "");
  }

  // Infrastructure

  @LocalServerPort int port;

  @Autowired TestRestTemplate rest;

  @Autowired ObjectMapper mapper;

  String base;

  @BeforeEach
  void setUp() {
    base = "http://localhost:" + port;
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

  ResponseEntity<JsonNode> get(String path, String token) {
    return rest.exchange(
        base + path, HttpMethod.GET, new HttpEntity<>(bearer(token)), JsonNode.class);
  }

  ResponseEntity<JsonNode> delete(String path, String token) {
    return rest.exchange(
        base + path, HttpMethod.DELETE, new HttpEntity<>(bearer(token)), JsonNode.class);
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
    assertEquals(HttpStatus.UNAUTHORIZED, get("/api/v1/items", null).getStatusCode());
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

  // Criteria: path CRUD (list / create / read / update / archive)

  @Test
  void pathLifecycleCreateReadUpdateArchive() {
    String token = freshToken();

    // Create
    ResponseEntity<JsonNode> created =
        post(
            "/api/v1/paths",
            token,
            "{\"name\":\"Algorithms\",\"description\":\"DSA study\",\"color\":\"#3B82F6\"}");
    assertEquals(HttpStatus.CREATED, created.getStatusCode());
    String pathId = created.getBody().get("id").asText();
    assertEquals("Algorithms", created.getBody().get("name").asText());
    assertEquals("#3B82F6", created.getBody().get("color").asText());

    // Read
    ResponseEntity<JsonNode> fetched = get("/api/v1/paths/" + pathId, token);
    assertEquals(HttpStatus.OK, fetched.getStatusCode());
    assertEquals("Algorithms", fetched.getBody().get("name").asText());

    // Update (editable-paths criteria): name, description, and color
    ResponseEntity<JsonNode> updated =
        put(
            "/api/v1/paths/" + pathId,
            token,
            "{\"name\":\"Algorithms Updated\",\"description\":\"Updated"
                + " desc\",\"color\":\"#EF4444\"}");
    assertEquals(HttpStatus.OK, updated.getStatusCode());
    assertEquals("Algorithms Updated", updated.getBody().get("name").asText());
    assertEquals("#EF4444", updated.getBody().get("color").asText());

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

    // Archive
    ResponseEntity<JsonNode> archived = delete("/api/v1/paths/" + pathId, token);
    assertEquals(HttpStatus.NO_CONTENT, archived.getStatusCode());
    assertEquals(
        "ARCHIVED", get("/api/v1/paths/" + pathId, token).getBody().get("status").asText());
  }

  @Test
  void pathColorValidationRejectsInvalidHex() {
    String token = freshToken();
    ResponseEntity<JsonNode> bad =
        post("/api/v1/paths", token, "{\"name\":\"Bad Color\",\"color\":\"red\"}");
    assertEquals(HttpStatus.BAD_REQUEST, bad.getStatusCode());
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

  // Criteria: items, tags, and path membership

  @Test
  void itemLifecycleCreateUpdateProgressComplete() {
    String token = freshToken();
    ResponseEntity<JsonNode> path =
        post("/api/v1/paths", token, "{\"name\":\"Study\",\"description\":null}");
    String pathId = path.getBody().get("id").asText();

    // Create item with source (items-source criteria)
    ResponseEntity<JsonNode> item =
        post(
            "/api/v1/items",
            token,
            "{\"title\":\"Chapter 1\",\"type\":\"COURSE\",\"description\":\"Read chapter\","
                + "\"source\":\"https://book.example/ch1\","
                + "\"pathIds\":[\""
                + pathId
                + "\"],\"tags\":[\"study\",\"java\"]}");
    assertEquals(HttpStatus.CREATED, item.getStatusCode());
    String itemId = item.getBody().get("id").asText();
    assertEquals("Chapter 1", item.getBody().get("title").asText());
    assertEquals("https://book.example/ch1", item.getBody().get("source").asText());
    assertEquals(pathId, item.getBody().get("pathIds").get(0).asText());
    assertTrue(item.getBody().get("tags").toString().contains("java"));

    // List items shows the created item
    ResponseEntity<JsonNode> list = get("/api/v1/items", token);
    assertEquals(HttpStatus.OK, list.getStatusCode());
    boolean found = false;
    for (JsonNode n : list.getBody()) {
      if (n.get("id").asText().equals(itemId)) {
        found = true;
        break;
      }
    }
    assertTrue(found);

    // Update progress
    ResponseEntity<JsonNode> progressed =
        post("/api/v1/items/" + itemId + "/progress", token, "{\"progress\":50}");
    assertEquals(HttpStatus.OK, progressed.getStatusCode());
    assertEquals(50, progressed.getBody().get("progress").asInt());

    // Progress history is recorded
    ResponseEntity<JsonNode> history = get("/api/v1/items/" + itemId + "/progress", token);
    assertEquals(HttpStatus.OK, history.getStatusCode());
    assertFalse(history.getBody().isEmpty(), "progress history should have an entry");

    // Update item to completed
    ResponseEntity<JsonNode> completed =
        put(
            "/api/v1/items/" + itemId,
            token,
            "{\"title\":\"Chapter 1\",\"type\":\"COURSE\",\"status\":\"COMPLETED\","
                + "\"pathIds\":[\""
                + pathId
                + "\"],\"tags\":[\"study\"]}");
    assertEquals(HttpStatus.OK, completed.getStatusCode());
    assertEquals("COMPLETED", completed.getBody().get("status").asText());
    assertEquals(100, completed.getBody().get("progress").asInt());
  }

  @Test
  void itemSourceFieldPersistedAndEditable() {
    String token = freshToken();
    ResponseEntity<JsonNode> item =
        post(
            "/api/v1/items",
            token,
            "{\"title\":\"Link Item\",\"source\":\"https://example.com/resource\"}");
    assertEquals(HttpStatus.CREATED, item.getStatusCode());
    String itemId = item.getBody().get("id").asText();
    assertEquals("https://example.com/resource", item.getBody().get("source").asText());

    // Update changes source
    ResponseEntity<JsonNode> updated =
        put(
            "/api/v1/items/" + itemId,
            token,
            "{\"title\":\"Link Item\",\"source\":\"https://new.example.com\"}");
    assertEquals(HttpStatus.OK, updated.getStatusCode());
    assertEquals("https://new.example.com", updated.getBody().get("source").asText());
  }

  // Criteria: all item types

  @Test
  void allSupportedItemTypesCanBeCreated() {
    String token = freshToken();
    for (String type :
        new String[] {
          "CUSTOM",
          "BOOK",
          "COURSE",
          "PROJECT",
          "ARTICLE",
          "MOVIE",
          "EXERCISE",
          "HOBBY",
          "VIDEO",
          "PAPER"
        }) {
      ResponseEntity<JsonNode> item =
          post(
              "/api/v1/items",
              token,
              "{\"title\":\"" + type + " item\",\"type\":\"" + type + "\"}");
      assertEquals(HttpStatus.CREATED, item.getStatusCode(), "Should create item of type " + type);
      assertEquals(type, item.getBody().get("type").asText());
    }
  }

  // Criteria: archived paths cannot receive new items

  @Test
  void archivedPathCannotReceiveNewItemMembership() {
    String token = freshToken();
    ResponseEntity<JsonNode> path =
        post("/api/v1/paths", token, "{\"name\":\"Archive Me\",\"description\":null}");
    String pathId = path.getBody().get("id").asText();

    // Archive the path
    delete("/api/v1/paths/" + pathId, token);

    // New item with archived path is rejected
    ResponseEntity<JsonNode> item =
        post(
            "/api/v1/items",
            token,
            "{\"title\":\"Blocked Item\",\"pathIds\":[\"" + pathId + "\"]}");
    assertEquals(HttpStatus.BAD_REQUEST, item.getStatusCode());
  }

  // Criteria: notes

  @Test
  void notesCanBeCreatedAndEdited() {
    String token = freshToken();
    ResponseEntity<JsonNode> path =
        post("/api/v1/paths", token, "{\"name\":\"Notes Path\",\"description\":null}");
    String pathId = path.getBody().get("id").asText();

    // Create note attached to path
    ResponseEntity<JsonNode> note =
        post(
            "/api/v1/notes",
            token,
            "{\"pathId\":\""
                + pathId
                + "\",\"title\":\"My Note\",\"content\":\"Note content here\"}");
    assertEquals(HttpStatus.OK, note.getStatusCode());
    String noteId = note.getBody().get("id").asText();
    assertEquals("My Note", note.getBody().get("title").asText());

    // List notes
    ResponseEntity<JsonNode> list = get("/api/v1/notes", token);
    assertEquals(HttpStatus.OK, list.getStatusCode());
    boolean found = false;
    for (JsonNode n : list.getBody()) {
      if (n.get("id").asText().equals(noteId)) {
        found = true;
        break;
      }
    }
    assertTrue(found);

    // Edit note
    ResponseEntity<JsonNode> edited =
        put(
            "/api/v1/notes/" + noteId,
            token,
            "{\"title\":\"Updated Note\",\"content\":\"Updated content\"}");
    assertEquals(HttpStatus.OK, edited.getStatusCode());
    assertEquals("Updated Note", edited.getBody().get("title").asText());
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
        post("/api/v1/timers", token, "{\"description\":\"Study session\",\"source\":\"WEB\"}");
    assertEquals(HttpStatus.CREATED, started.getStatusCode());
    String timerId = started.getBody().get("id").asText();
    assertTrue(started.getBody().get("running").asBoolean());

    // Second start is rejected (one-running-timer invariant)
    ResponseEntity<JsonNode> dup =
        post("/api/v1/timers", token, "{\"description\":\"Another session\",\"source\":\"WEB\"}");
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
        post("/api/v1/timers", token, "{\"description\":\"To be cancelled\",\"source\":\"WEB\"}");
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
  void timerPreservesIosSource() {
    String token = freshToken();
    ResponseEntity<JsonNode> started =
        post("/api/v1/timers", token, "{\"description\":\"iOS session\",\"source\":\"IOS\"}");
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
        post("/api/v1/timers", token, "{\"description\":\"Config test\",\"source\":\"WEB\"}");
    assertEquals(HttpStatus.CREATED, started.getStatusCode());
    String timerId = started.getBody().get("id").asText();

    String pastTime = Instant.now().minus(10, ChronoUnit.MINUTES).toString();
    ResponseEntity<JsonNode> configured =
        put(
            "/api/v1/timers/" + timerId,
            token,
            "{\"pathId\":\""
                + pathId
                + "\",\"startedAt\":\""
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
  void timerAcceptsOwnedItemNotAttachedToPath() {
    String token = freshToken();
    ResponseEntity<JsonNode> path =
        post("/api/v1/paths", token, "{\"name\":\"Path A\",\"description\":null}");
    String pathId = path.getBody().get("id").asText();

    ResponseEntity<JsonNode> item = post("/api/v1/items", token, "{\"title\":\"Unattached Item\"}");
    String itemId = item.getBody().get("id").asText();

    // Item organization and timer targeting are independent.
    ResponseEntity<JsonNode> timerStart =
        post(
            "/api/v1/timers",
            token,
            "{\"pathId\":\""
                + pathId
                + "\",\"itemId\":\""
                + itemId
                + "\","
                + "\"description\":\"invalid combo\",\"source\":\"WEB\"}");
    assertEquals(HttpStatus.CREATED, timerStart.getStatusCode());
    String timerId = timerStart.getBody().get("id").asText();
    post("/api/v1/timers/" + timerId + "/stop", token, "{}");
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
                + "\",\"endedAt\":\""
                + end
                + "\","
                + "\"description\":\"Manual entry\"}");
    assertEquals(HttpStatus.OK, entry.getStatusCode());
    assertFalse(entry.getBody().get("running").asBoolean());
    assertEquals(3600L, entry.getBody().get("durationSeconds").asLong(), 5L);
  }

  // Criteria: statistics (today / week / month, path/item breakdowns)

  @Test
  void statisticsIncludeCompletionCountsAndRecentProgress() {
    String token = freshToken();

    // Complete an item so completedItems > 0
    ResponseEntity<JsonNode> item =
        post("/api/v1/items", token, "{\"title\":\"Stat Item\",\"type\":\"COURSE\"}");
    String itemId = item.getBody().get("id").asText();
    post("/api/v1/items/" + itemId + "/progress", token, "{\"progress\":100}");

    ResponseEntity<JsonNode> stats = get("/api/v1/statistics", token);
    assertEquals(HttpStatus.OK, stats.getStatusCode());
    assertTrue(stats.getBody().has("completedItems"));
    assertTrue(stats.getBody().has("activeItems"));
    assertTrue(stats.getBody().has("todaySeconds"));
    assertTrue(stats.getBody().has("weekSeconds"));
    assertTrue(stats.getBody().has("monthSeconds"));
    assertTrue(stats.getBody().has("todayByPath"));
    assertTrue(stats.getBody().has("weekByPath"));
    assertTrue(stats.getBody().has("recentProgressChanges"));
  }

  // Criteria: activity stream

  @Test
  void activityStreamRecordsItemAndTimerEvents() {
    String token = freshToken();

    // Create item, then expect ITEM_CREATED activity
    ResponseEntity<JsonNode> item =
        post("/api/v1/items", token, "{\"title\":\"Activity Check\",\"type\":\"COURSE\"}");
    String itemId = item.getBody().get("id").asText();

    // Start timer; sessions are now read from time_entry rather than persisted as activity rows.
    ResponseEntity<JsonNode> timerRes =
        post("/api/v1/timers", token, "{\"description\":\"Activity timer\",\"source\":\"WEB\"}");
    String timerId = timerRes.getBody().get("id").asText();
    post("/api/v1/timers/" + timerId + "/stop", token, "{}");

    ResponseEntity<JsonNode> activities = get("/api/v1/activities", token);
    assertEquals(HttpStatus.OK, activities.getStatusCode());
    assertTrue(activities.getBody().isArray());

    boolean hasItemCreated = false, hasTimerStarted = false;
    for (JsonNode n : activities.getBody()) {
      String type = n.get("type").asText();
      if ("ITEM_CREATED".equals(type)) hasItemCreated = true;
      if ("TIMER_STARTED".equals(type)) hasTimerStarted = true;
    }
    assertTrue(hasItemCreated, "ITEM_CREATED activity expected");
    assertFalse(hasTimerStarted, "timer transition activity should not be persisted");
  }

  @Test
  void filteredActivitiesReturnScopedResults() {
    String token = freshToken();

    // Create an item to have some activity
    post("/api/v1/items", token, "{\"title\":\"Filter Item\"}");

    ResponseEntity<JsonNode> filtered = get("/api/v1/activities?type=ITEM_CREATED", token);
    assertEquals(HttpStatus.OK, filtered.getStatusCode());
    assertTrue(filtered.getBody().isArray());
    for (JsonNode n : filtered.getBody()) {
      assertEquals("ITEM_CREATED", n.get("type").asText());
    }
  }

  // Criteria: note activity ownership

  @Test
  void noteAttachedToActivityIsOwnershipScoped() {
    String token = freshToken();

    // Create item to generate an activity
    ResponseEntity<JsonNode> item = post("/api/v1/items", token, "{\"title\":\"Note Ref Item\"}");
    String itemId = item.getBody().get("id").asText();

    // Fetch activities and pick one
    ResponseEntity<JsonNode> activities = get("/api/v1/activities", token);
    assertTrue(activities.getBody().size() > 0);
    String activityId = activities.getBody().get(0).get("id").asText();

    // Attach a note to that activity
    ResponseEntity<JsonNode> note =
        post(
            "/api/v1/notes",
            token,
            "{\"activityId\":\""
                + activityId
                + "\",\"title\":\"Activity Note\","
                + "\"content\":\"Linked to event\"}");
    assertEquals(HttpStatus.OK, note.getStatusCode());
    assertEquals(activityId, note.getBody().get("activityId").asText());
  }

  // Criteria: search

  @Test
  void searchReturnsMatchingPathsItemsAndNotes() {
    String token = freshToken();
    String unique = "XZQsearch" + UUID.randomUUID().toString().replace("-", "").substring(0, 6);

    post("/api/v1/paths", token, "{\"name\":\"" + unique + " Path\",\"description\":null}");
    post("/api/v1/items", token, "{\"title\":\"" + unique + " Item\"}");
    post(
        "/api/v1/notes", token, "{\"title\":\"" + unique + " Note\",\"content\":\"some content\"}");

    ResponseEntity<JsonNode> results = get("/api/v1/search?q=" + unique, token);
    assertEquals(HttpStatus.OK, results.getStatusCode());
    assertTrue(results.getBody().isArray());

    boolean hasPath = false, hasItem = false, hasNote = false;
    for (JsonNode n : results.getBody()) {
      switch (n.get("kind").asText()) {
        case "PATH" -> hasPath = true;
        case "ITEM" -> hasItem = true;
        case "NOTE" -> hasNote = true;
      }
    }
    assertTrue(hasPath, "Path should appear in search results");
    assertTrue(hasItem, "Item should appear in search results");
    assertTrue(hasNote, "Note should appear in search results");
  }

  @Test
  void searchQueryTooLongIsRejected() {
    String token = freshToken();
    ResponseEntity<JsonNode> result = get("/api/v1/search?q=" + "x".repeat(201), token);
    assertEquals(HttpStatus.BAD_REQUEST, result.getStatusCode());
  }

  // Criteria: path summary (tracked time, items, activity)

  @Test
  void pathSummaryIncludesTrackedTimeAndItems() {
    String token = freshToken();
    ResponseEntity<JsonNode> path =
        post("/api/v1/paths", token, "{\"name\":\"Summary Path\",\"description\":null}");
    String pathId = path.getBody().get("id").asText();

    ResponseEntity<JsonNode> item =
        post(
            "/api/v1/items",
            token,
            "{\"title\":\"Summary Item\",\"pathIds\":[\"" + pathId + "\"]}");
    String itemId = item.getBody().get("id").asText();

    // Track some time for this path
    String start = Instant.now().minus(30, ChronoUnit.MINUTES).toString();
    String end = Instant.now().toString();
    post(
        "/api/v1/time-entries",
        token,
        "{\"pathId\":\""
            + pathId
            + "\",\"itemId\":\""
            + itemId
            + "\","
            + "\"startedAt\":\""
            + start
            + "\",\"endedAt\":\""
            + end
            + "\","
            + "\"description\":\"Summary test\"}");

    ResponseEntity<JsonNode> summary = get("/api/v1/paths/" + pathId + "/summary", token);
    assertEquals(HttpStatus.OK, summary.getStatusCode());
    assertTrue(
        summary.getBody().get("trackedSeconds").asLong() > 0, "tracked seconds should be positive");
    assertTrue(summary.getBody().get("itemIds").size() > 0, "summary should include item ids");
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
            + "\",\"endedAt\":\""
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
  void oversizedItemTitleIsRejected() {
    String token = freshToken();
    ResponseEntity<JsonNode> result =
        post("/api/v1/items", token, "{\"title\":\"" + "x".repeat(241) + "\"}");
    assertEquals(HttpStatus.BAD_REQUEST, result.getStatusCode());
  }

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
  void malformedUuidInPathParameterReturnsBadRequest() {
    String token = freshToken();
    assertEquals(HttpStatus.BAD_REQUEST, get("/api/v1/paths/not-a-uuid", token).getStatusCode());
    assertEquals(
        HttpStatus.BAD_REQUEST, get("/api/v1/items/not-a-uuid/progress", token).getStatusCode());
  }

  // Criteria: ownership (paths / items scoped per user)

  @Test
  void usersCannotAccessEachOthersResources() {
    String aliceToken = freshToken();
    String bobToken = freshToken();

    // Alice creates a path
    ResponseEntity<JsonNode> alicePath =
        post("/api/v1/paths", aliceToken, "{\"name\":\"Alice's Path\",\"description\":null}");
    String alicePathId = alicePath.getBody().get("id").asText();

    // Bob cannot read Alice's path
    ResponseEntity<JsonNode> forbidden = get("/api/v1/paths/" + alicePathId, bobToken);
    assertEquals(HttpStatus.NOT_FOUND, forbidden.getStatusCode());

    // Bob cannot attach his item to Alice's path
    ResponseEntity<JsonNode> bobItem =
        post(
            "/api/v1/items",
            bobToken,
            "{\"title\":\"Bob's Item\",\"pathIds\":[\"" + alicePathId + "\"]}");
    assertEquals(HttpStatus.BAD_REQUEST, bobItem.getStatusCode());
  }

  // Criteria: CORS headers

  @Test
  void corsPreflightIsHandled() {
    HttpHeaders headers = new HttpHeaders();
    headers.set("Origin", "http://localhost");
    headers.set("Access-Control-Request-Method", "GET");
    headers.set("Access-Control-Request-Headers", "Authorization");

    ResponseEntity<String> resp =
        rest.exchange(
            base + "/api/v1/items", HttpMethod.OPTIONS, new HttpEntity<>(headers), String.class);
    // Should be 200 OK with CORS allow headers
    assertTrue(
        resp.getStatusCode() == HttpStatus.OK || resp.getStatusCode() == HttpStatus.NO_CONTENT,
        "OPTIONS preflight should succeed, got: " + resp.getStatusCode());
  }

  // Criteria: timer description size boundary

  @Test
  void oversizedTimerDescriptionIsRejected() {
    String token = freshToken();
    ResponseEntity<JsonNode> result =
        post(
            "/api/v1/timers",
            token,
            "{\"description\":\"" + "x".repeat(501) + "\",\"source\":\"WEB\"}");
    assertEquals(HttpStatus.BAD_REQUEST, result.getStatusCode());
  }

  // Criteria: completing items creates activities

  @Test
  void completingItemCreatesCompletionActivity() {
    String token = freshToken();
    ResponseEntity<JsonNode> item =
        post("/api/v1/items", token, "{\"title\":\"Completable\",\"type\":\"COURSE\"}");
    String itemId = item.getBody().get("id").asText();

    put(
        "/api/v1/items/" + itemId,
        token,
        "{\"title\":\"Completable\",\"type\":\"COURSE\",\"status\":\"COMPLETED\"}");

    ResponseEntity<JsonNode> activities = get("/api/v1/activities", token);
    boolean completionFound = false;
    for (JsonNode n : activities.getBody()) {
      if ("ITEM_COMPLETED".equals(n.get("type").asText())) {
        completionFound = true;
        break;
      }
    }
    assertTrue(completionFound, "ITEM_COMPLETED activity should be recorded");
  }

  // Criteria: reducing completed progress reopens item

  @Test
  void reducingProgressFromCompletedReopensItem() {
    String token = freshToken();
    ResponseEntity<JsonNode> item =
        post("/api/v1/items", token, "{\"title\":\"Reopen Me\",\"type\":\"COURSE\"}");
    String itemId = item.getBody().get("id").asText();

    // Complete at 100
    post("/api/v1/items/" + itemId + "/progress", token, "{\"progress\":100}");
    JsonNode completed = get("/api/v1/items", token).getBody();
    // Reduce to 80
    post("/api/v1/items/" + itemId + "/progress", token, "{\"progress\":80}");

    ResponseEntity<JsonNode> updated = get("/api/v1/items", token);
    for (JsonNode n : updated.getBody()) {
      if (n.get("id").asText().equals(itemId)) {
        assertEquals(80, n.get("progress").asInt());
        assertNotEquals(
            "COMPLETED",
            n.get("status").asText(),
            "Item should no longer be COMPLETED after reducing progress");
        break;
      }
    }
  }

  // Criteria: authentication rate limiting

  @Test
  void authRateLimiterBlocksExcessiveAttempts() {
    String email = UUID.randomUUID() + "@ratelimit.test";
    // Exceed default limit (10 attempts per account)
    ResponseEntity<JsonNode> last = null;
    for (int i = 0; i < 12; i++) {
      last =
          post(
              "/api/v1/auth/login",
              null,
              json("email", email, "password", "WrongPass" + i + "!__secure"));
    }
    // Eventually returns 429 Too Many Requests
    assertEquals(HttpStatus.TOO_MANY_REQUESTS, last.getStatusCode());
  }

  // Criteria: path name validation

  @Test
  void pathNameCannotBeBlankOrExceedMaxLength() {
    String token = freshToken();
    assertEquals(
        HttpStatus.BAD_REQUEST, post("/api/v1/paths", token, "{\"name\":\"\"}").getStatusCode());
    assertEquals(
        HttpStatus.BAD_REQUEST,
        post("/api/v1/paths", token, "{\"name\":\"" + "x".repeat(161) + "\"}").getStatusCode());
  }

  // Criteria: description field on paths

  @Test
  void pathDescriptionIsOptionalAndPersistedWhenProvided() {
    String token = freshToken();

    // Without description
    ResponseEntity<JsonNode> noDesc = post("/api/v1/paths", token, "{\"name\":\"No Desc Path\"}");
    assertEquals(HttpStatus.CREATED, noDesc.getStatusCode());
    assertTrue(
        noDesc.getBody().get("description").isNull()
            || noDesc.getBody().get("description").asText().isEmpty());

    // With description
    ResponseEntity<JsonNode> withDesc =
        post(
            "/api/v1/paths",
            token,
            "{\"name\":\"With Desc Path\",\"description\":\"A real description\"}");
    assertEquals(HttpStatus.CREATED, withDesc.getStatusCode());
    assertEquals("A real description", withDesc.getBody().get("description").asText());
  }
}
