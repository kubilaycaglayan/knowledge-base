package com.know.integration;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Assumptions;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;

/** Pausing and resuming sessions (docs/session-pause-acceptance-checklist.md). */
class TimerPauseIntegrationTest extends IntegrationTestSupport {
  @LocalServerPort int port;
  @Autowired TestRestTemplate rest;
  @Autowired ObjectMapper mapper;
  @Autowired JdbcTemplate jdbc;
  String base;

  @BeforeEach
  void setUp() {
    base = "http://localhost:" + port;
  }

  String token() {
    String body = "{\"email\":\"" + UUID.randomUUID() + "@test.example\",\"password\":\"SecurePassword123!\"}";
    ResponseEntity<JsonNode> res = exchange(HttpMethod.POST, "/api/v1/auth/register", null, body);
    assertEquals(HttpStatus.OK, res.getStatusCode());
    return res.getBody().get("token").asText();
  }

  ResponseEntity<JsonNode> exchange(HttpMethod method, String path, String token, String body) {
    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    if (token != null) headers.setBearerAuth(token);
    return rest.exchange(base + path, method, new HttpEntity<>(body, headers), JsonNode.class);
  }

  ResponseEntity<JsonNode> get(String path, String token) {
    return exchange(HttpMethod.GET, path, token, null);
  }

  ResponseEntity<JsonNode> post(String path, String token, String body) {
    return exchange(HttpMethod.POST, path, token, body);
  }

  ResponseEntity<JsonNode> put(String path, String token, String body) {
    return exchange(HttpMethod.PUT, path, token, body);
  }

  @Test
  void concurrentTimerStartsKeepThePostgresOneRunningTimerInvariant() throws Exception {
    Assumptions.assumeTrue(
        System.getenv("KB_TEST_POSTGRES_URL") != null,
        "This race is PostgreSQL-specific and runs in the opt-in PostgreSQL suite");
    String token = token();
    CyclicBarrier startTogether = new CyclicBarrier(2);
    try (ExecutorService requests = Executors.newFixedThreadPool(2)) {
      Future<Integer> first = requests.submit(() -> startTimerTogether(token, startTogether));
      Future<Integer> second = requests.submit(() -> startTimerTogether(token, startTogether));
      int firstStatus = first.get(10, TimeUnit.SECONDS);
      int secondStatus = second.get(10, TimeUnit.SECONDS);

      assertEquals(1, java.util.List.of(firstStatus, secondStatus).stream().filter(s -> s == 201).count());
      assertEquals(1, java.util.List.of(firstStatus, secondStatus).stream().filter(s -> s == 409).count());
      JsonNode current = get("/api/v1/timers/current", token).getBody();
      assertNotNull(current);
      assertTrue(current.get("running").asBoolean());
      assertEquals(HttpStatus.OK, post("/api/v1/timers/stop", token, "{}").getStatusCode());
    }
  }

  private int startTimerTogether(String token, CyclicBarrier startTogether) throws Exception {
    startTogether.await(5, TimeUnit.SECONDS);
    return post("/api/v1/timers", token, "{\"labelIds\":[],\"description\":\"concurrent start\"}")
        .getStatusCode()
        .value();
  }

  @Test
  void postgresConcurrentDraftLabelReplacementsKeepOneAssignment() throws Exception {
    Assumptions.assumeTrue(
        System.getenv("KB_TEST_POSTGRES_URL") != null,
        "This concurrent draft label assignment case runs against PostgreSQL");
    String owner = token();
    String labelId = label(owner, "Concurrent draft label");
    CyclicBarrier startTogether = new CyclicBarrier(2);
    try (ExecutorService requests = Executors.newFixedThreadPool(2)) {
      Future<Integer> first = requests.submit(() -> saveDraftTogether(owner, labelId, startTogether));
      Future<Integer> second = requests.submit(() -> saveDraftTogether(owner, labelId, startTogether));
      assertEquals(200, first.get(10, TimeUnit.SECONDS));
      assertEquals(200, second.get(10, TimeUnit.SECONDS));
    }
    JsonNode draft = get("/api/v1/timers/draft", owner).getBody();
    assertEquals(1, draft.get("labelIds").size());
    assertEquals(labelId, draft.get("labelIds").get(0).asText());
  }

  @Test
  void postgresPauseFailureRollsBackStoppedSegmentWhenDraftLabelsFail() {
    Assumptions.assumeTrue(
        System.getenv("KB_TEST_POSTGRES_URL") != null,
        "Pause transaction rollback requires PostgreSQL");
    String owner = token();
    String labelId = label(owner, "Pause rollback label");
    JsonNode running = startedMinutesAgo(owner, null, labelId, 3);
    String suffix = UUID.randomUUID().toString().replace("-", "");
    String functionName = "fail_pause_draft_" + suffix;
    jdbc.execute(
        "create function "
            + functionName
            + "() returns trigger language plpgsql as $$ begin raise exception 'forced pause draft failure'; end $$");
    jdbc.execute(
        "create trigger "
            + functionName
            + " before insert on tracker_draft_label for each row execute function "
            + functionName
            + "()");
    try {
      assertEquals(
          HttpStatus.INTERNAL_SERVER_ERROR,
          post("/api/v1/timers/pause", owner, "{}").getStatusCode());
    } finally {
      jdbc.execute("drop trigger if exists " + functionName + " on tracker_draft_label");
      jdbc.execute("drop function if exists " + functionName + "()");
    }
    JsonNode current = get("/api/v1/timers/current", owner).getBody();
    assertTrue(current.get("running").asBoolean());
    assertEquals(running.get("id").asText(), current.get("id").asText());
    assertEquals(
        0L,
        jdbc.queryForObject(
            "select count(*) from tracker_draft where user_id = ?",
            Long.class,
            userId(owner)));
  }

  @Test
  void postgresStartFailureRollsBackNewTimerAndPreservesDraft() {
    Assumptions.assumeTrue(
        System.getenv("KB_TEST_POSTGRES_URL") != null,
        "Timer start transaction rollback requires PostgreSQL");
    String owner = token();
    String labelId = label(owner, "Start rollback label");
    assertEquals(
        HttpStatus.OK,
        put(
                "/api/v1/timers/draft",
                owner,
                "{\"labelIds\":[\"" + labelId + "\"],\"description\":\"preserved draft\"}")
            .getStatusCode());
    String suffix = UUID.randomUUID().toString().replace("-", "");
    String functionName = "fail_start_label_" + suffix;
    jdbc.execute(
        "create function "
            + functionName
            + "() returns trigger language plpgsql as $$ begin raise exception 'forced start label failure'; end $$");
    jdbc.execute(
        "create trigger "
            + functionName
            + " before insert on time_entry_label for each row execute function "
            + functionName
            + "()");
    try {
      assertEquals(
          HttpStatus.INTERNAL_SERVER_ERROR,
          post(
                  "/api/v1/timers",
                  owner,
                  "{\"labelIds\":[\"" + labelId + "\"],\"description\":\"preserved draft\"}")
              .getStatusCode());
    } finally {
      jdbc.execute("drop trigger if exists " + functionName + " on time_entry_label");
      jdbc.execute("drop function if exists " + functionName + "()");
    }

    assertNull(get("/api/v1/timers/current", owner).getBody());
    JsonNode draft = get("/api/v1/timers/draft", owner).getBody();
    assertEquals("preserved draft", draft.get("description").asText());
    assertEquals(labelId, draft.get("labelIds").get(0).asText());
    assertEquals(
        0L,
        jdbc.queryForObject(
            "select count(*) from time_entry where user_id = ? and ended_at is null",
            Long.class,
            userId(owner)));
  }

  @Test
  void postgresResumeFailureRollsBackNewTimerAndKeepsPausedDraft() {
    Assumptions.assumeTrue(
        System.getenv("KB_TEST_POSTGRES_URL") != null,
        "Timer resume transaction rollback requires PostgreSQL");
    String owner = token();
    String labelId = label(owner, "Resume rollback label");
    assertEquals(
        HttpStatus.CREATED,
        post("/api/v1/timers", owner, "{\"labelIds\":[],\"description\":\"resume rollback\"}")
            .getStatusCode());
    assertEquals(HttpStatus.OK, post("/api/v1/timers/pause", owner, "{}").getStatusCode());
    assertEquals(
        HttpStatus.OK,
        put(
                "/api/v1/timers/draft",
                owner,
                "{\"labelIds\":[\"" + labelId + "\"],\"description\":\"paused draft\"}")
            .getStatusCode());
    String suffix = UUID.randomUUID().toString().replace("-", "");
    String functionName = "fail_resume_label_" + suffix;
    jdbc.execute(
        "create function "
            + functionName
            + "() returns trigger language plpgsql as $$ begin raise exception 'forced resume label failure'; end $$");
    jdbc.execute(
        "create trigger "
            + functionName
            + " before insert on time_entry_label for each row execute function "
            + functionName
            + "()");
    try {
      assertEquals(
          HttpStatus.INTERNAL_SERVER_ERROR,
          post("/api/v1/timers/resume", owner, "{}").getStatusCode());
    } finally {
      jdbc.execute("drop trigger if exists " + functionName + " on time_entry_label");
      jdbc.execute("drop function if exists " + functionName + "()");
    }

    assertNull(get("/api/v1/timers/current", owner).getBody());
    JsonNode draft = get("/api/v1/timers/draft", owner).getBody();
    assertTrue(draft.hasNonNull("pausedSeconds"));
    assertEquals("paused draft", draft.get("description").asText());
    assertEquals(labelId, draft.get("labelIds").get(0).asText());
    assertEquals(
        0L,
        jdbc.queryForObject(
            "select count(*) from time_entry where user_id = ? and ended_at is null",
            Long.class,
            userId(owner)));
  }

  @Test
  void postgresConfigureFailureRollsBackTimerChangesWhenNewLabelFails() throws Exception {
    Assumptions.assumeTrue(
        System.getenv("KB_TEST_POSTGRES_URL") != null,
        "Timer configuration transaction rollback requires PostgreSQL");
    String owner = token();
    String labelId = label(owner, "Configure rollback label");
    JsonNode started =
        post("/api/v1/timers", owner, "{\"labelIds\":[],\"description\":\"original timer\"}")
            .getBody();
    Instant start = Instant.parse(started.get("startedAt").asText());
    String suffix = UUID.randomUUID().toString().replace("-", "");
    String functionName = "fail_configure_label_" + suffix;
    jdbc.execute(
        "create function "
            + functionName
            + "() returns trigger language plpgsql as $$ begin raise exception 'forced configure label failure'; end $$");
    jdbc.execute(
        "create trigger "
            + functionName
            + " before insert on time_entry_label for each row execute function "
            + functionName
            + "()");
    try {
      assertEquals(
          HttpStatus.INTERNAL_SERVER_ERROR,
          put(
                  "/api/v1/timers/" + started.get("id").asText(),
                  owner,
                  "{\"labelIds\":[\""
                      + labelId
                      + "\"],\"startedAt\":\""
                      + start.minusSeconds(1)
                      + "\",\"endedAt\":null,\"description\":\"changed timer\"}")
              .getStatusCode());
    } finally {
      jdbc.execute("drop trigger if exists " + functionName + " on time_entry_label");
      jdbc.execute("drop function if exists " + functionName + "()");
    }

    JsonNode current = get("/api/v1/timers/current", owner).getBody();
    assertEquals("original timer", current.get("description").asText());
    assertTrue(current.get("running").asBoolean());
    assertTrue(current.get("labelIds").isEmpty());
    assertEquals(
        0L,
        jdbc.queryForObject(
            "select count(*) from time_entry_label where time_entry_id = ?",
            Long.class,
            UUID.fromString(started.get("id").asText())));
  }

  private UUID userId(String token) {
    try {
      return UUID.fromString(
          mapper
              .readTree(java.util.Base64.getUrlDecoder().decode(token.split("\\.")[1]))
              .get("sub")
              .asText());
    } catch (Exception exception) {
      throw new AssertionError("Could not read test user from token", exception);
    }
  }

  private int saveDraftTogether(String token, String labelId, CyclicBarrier startTogether)
      throws Exception {
    startTogether.await(5, TimeUnit.SECONDS);
    return put(
            "/api/v1/timers/draft",
            token,
            "{\"labelIds\":[\"" + labelId + "\"],\"description\":\"shared draft\"}")
        .getStatusCode()
        .value();
  }

  String path(String token, String name) {
    return post("/api/v1/paths", token, "{\"name\":\"" + name + "\"}").getBody().get("id").asText();
  }

  String label(String token, String name) {
    return post("/api/v1/labels", token, "{\"name\":\"" + name + "\",\"scopes\":[\"TIME_ENTRY\"]}")
        .getBody()
        .get("id")
        .asText();
  }

  /** Starts a timer and moves its start back so the segment is long enough to be recorded. */
  JsonNode startedMinutesAgo(String token, String pathId, String labelId, int minutes) {
    String labels = labelId == null ? "[]" : "[\"" + labelId + "\"]";
    String pathJson = pathId == null ? "null" : "\"" + pathId + "\"";
    ResponseEntity<JsonNode> started =
        post(
            "/api/v1/timers",
            token,
            "{\"pathId\":" + pathJson + ",\"labelIds\":" + labels + ",\"description\":\"Deep work\"}");
    assertEquals(HttpStatus.CREATED, started.getStatusCode());
    return backdate(token, started.getBody(), minutes);
  }

  JsonNode backdate(String token, JsonNode timer, int minutes) {
    String startedAt = Instant.now().minus(minutes, ChronoUnit.MINUTES).toString();
    StringBuilder labels = new StringBuilder("[");
    timer.get("labelIds").forEach(id -> labels.append(labels.length() > 1 ? "," : "").append(id));
    labels.append("]");
    String pathJson = timer.get("pathId").isNull() ? "null" : timer.get("pathId").toString();
    ResponseEntity<JsonNode> configured =
        put(
            "/api/v1/timers/" + timer.get("id").asText(),
            token,
            "{\"pathId\":"
                + pathJson
                + ",\"labelIds\":"
                + labels
                + ",\"startedAt\":\""
                + startedAt
                + "\",\"description\":"
                + timer.get("description")
                + "}");
    assertEquals(HttpStatus.OK, configured.getStatusCode());
    return configured.getBody();
  }

  boolean noCurrentTimer(String token) {
    JsonNode current = get("/api/v1/timers/current", token).getBody();
    return current == null || current.isNull();
  }

  // SP-01
  @Test
  void pauseRecordsTheSegmentAndKeepsTheSessionContext() {
    String token = token();
    String pathId = path(token, "Pause path");
    String labelId = label(token, "Pause label");
    JsonNode timer = startedMinutesAgo(token, pathId, labelId, 10);

    ResponseEntity<JsonNode> paused = post("/api/v1/timers/pause", token, "{}");
    assertEquals(HttpStatus.OK, paused.getStatusCode());
    long pausedSeconds = paused.getBody().get("pausedSeconds").asLong();
    assertTrue(pausedSeconds >= 600 && pausedSeconds < 610, "paused total " + pausedSeconds);
    assertTrue(noCurrentTimer(token));

    JsonNode draft = get("/api/v1/timers/draft", token).getBody();
    assertEquals(pathId, draft.get("pathId").asText());
    assertEquals(labelId, draft.get("labelIds").get(0).asText());
    assertEquals("Deep work", draft.get("description").asText());
    assertEquals(pausedSeconds, draft.get("pausedSeconds").asLong());

    JsonNode recorded = get("/api/v1/time-entries/" + timer.get("id").asText(), token).getBody();
    assertFalse(recorded.get("running").asBoolean());
    assertEquals(pausedSeconds, recorded.get("durationSeconds").asLong());
  }

  // SP-01
  @Test
  void pauseWithoutARunningTimerConflicts() {
    String token = token();
    assertEquals(HttpStatus.CONFLICT, post("/api/v1/timers/pause", token, "{}").getStatusCode());
    assertTrue(get("/api/v1/timers/draft", token).getBody().get("pausedSeconds").isNull());
  }

  // SP-02
  @Test
  void resumeContinuesThePausedSession() {
    String token = token();
    String pathId = path(token, "Resume path");
    String labelId = label(token, "Resume label");
    JsonNode first = startedMinutesAgo(token, pathId, labelId, 5);
    long pausedSeconds =
        post("/api/v1/timers/pause", token, "{}").getBody().get("pausedSeconds").asLong();

    ResponseEntity<JsonNode> resumed = post("/api/v1/timers/resume", token, "{}");
    assertEquals(HttpStatus.CREATED, resumed.getStatusCode());
    JsonNode timer = resumed.getBody();
    assertTrue(timer.get("running").asBoolean());
    assertNotEquals(first.get("id").asText(), timer.get("id").asText());
    assertEquals(pathId, timer.get("pathId").asText());
    assertEquals(labelId, timer.get("labelIds").get(0).asText());
    assertEquals("Deep work", timer.get("description").asText());
    assertEquals(pausedSeconds, timer.get("carriedSeconds").asLong());

    JsonNode current = get("/api/v1/timers/current", token).getBody();
    assertEquals(timer.get("id").asText(), current.get("id").asText());
    assertEquals(pausedSeconds, current.get("carriedSeconds").asLong());
    assertEquals(
        HttpStatus.CONFLICT, put("/api/v1/timers/draft", token, "{\"labelIds\":[]}").getStatusCode());
  }

  // SP-02
  @Test
  void resumeRequiresAPausedSession() {
    String token = token();
    assertEquals(HttpStatus.CONFLICT, post("/api/v1/timers/resume", token, "{}").getStatusCode());

    String pathId = path(token, "Soon deleted");
    startedMinutesAgo(token, pathId, null, 3);
    assertEquals(HttpStatus.OK, post("/api/v1/timers/pause", token, "{}").getStatusCode());
    // A fresh start is allowed while paused and drops the pause.
    assertEquals(
        HttpStatus.CREATED, post("/api/v1/timers", token, "{\"labelIds\":[]}").getStatusCode());
    post("/api/v1/timers/stop", token, "{}");
    startedMinutesAgo(token, pathId, null, 3);
    long pausedSeconds =
        post("/api/v1/timers/pause", token, "{}").getBody().get("pausedSeconds").asLong();
    exchange(HttpMethod.DELETE, "/api/v1/paths/" + pathId, token, null);

    assertEquals(HttpStatus.BAD_REQUEST, post("/api/v1/timers/resume", token, "{}").getStatusCode());
    assertTrue(noCurrentTimer(token));
    assertEquals(
        pausedSeconds, get("/api/v1/timers/draft", token).getBody().get("pausedSeconds").asLong());
  }

  // SP-03
  @Test
  void pausedTotalsAccumulateAcrossSegments() {
    String token = token();
    startedMinutesAgo(token, null, null, 4);
    long firstTotal =
        post("/api/v1/timers/pause", token, "{}").getBody().get("pausedSeconds").asLong();
    JsonNode resumed = post("/api/v1/timers/resume", token, "{}").getBody();
    backdate(token, resumed, 2);

    long secondTotal =
        post("/api/v1/timers/pause", token, "{}").getBody().get("pausedSeconds").asLong();
    assertTrue(
        secondTotal >= firstTotal + 120 && secondTotal < firstTotal + 130,
        firstTotal + " then " + secondTotal);

    JsonNode again = post("/api/v1/timers/resume", token, "{}").getBody();
    assertEquals(secondTotal, again.get("carriedSeconds").asLong());
    backdate(token, again, 1);
    assertEquals(HttpStatus.OK, post("/api/v1/timers/stop", token, "{}").getStatusCode());
    assertTrue(get("/api/v1/timers/draft", token).getBody().get("pausedSeconds").isNull());
    assertEquals(HttpStatus.CONFLICT, post("/api/v1/timers/resume", token, "{}").getStatusCode());
  }

  // SP-04
  @Test
  void finishEndsAPausedSession() {
    String token = token();
    assertEquals(HttpStatus.CONFLICT, post("/api/v1/timers/finish", token, "{}").getStatusCode());
    String pathId = path(token, "Finish path");
    startedMinutesAgo(token, pathId, null, 2);
    post("/api/v1/timers/pause", token, "{}");

    ResponseEntity<JsonNode> finished = post("/api/v1/timers/finish", token, "{}");
    assertEquals(HttpStatus.OK, finished.getStatusCode());
    assertTrue(finished.getBody().get("pausedSeconds").isNull());
    assertEquals(pathId, finished.getBody().get("pathId").asText());
    JsonNode draft = get("/api/v1/timers/draft", token).getBody();
    assertTrue(draft.get("pausedSeconds").isNull());
    assertEquals("Deep work", draft.get("description").asText());
    assertEquals(HttpStatus.CONFLICT, post("/api/v1/timers/resume", token, "{}").getStatusCode());
    assertTrue(noCurrentTimer(token));
  }

  // SP-04
  @Test
  void draftEditsKeepThePauseAndANewStartDropsIt() {
    String token = token();
    String pathId = path(token, "Edited while paused");
    startedMinutesAgo(token, null, null, 2);
    long pausedSeconds =
        post("/api/v1/timers/pause", token, "{}").getBody().get("pausedSeconds").asLong();

    ResponseEntity<JsonNode> edited =
        put(
            "/api/v1/timers/draft",
            token,
            "{\"pathId\":\"" + pathId + "\",\"labelIds\":[],\"description\":\"Renamed\"}");
    assertEquals(HttpStatus.OK, edited.getStatusCode());
    assertEquals(pausedSeconds, edited.getBody().get("pausedSeconds").asLong());
    JsonNode resumed = post("/api/v1/timers/resume", token, "{}").getBody();
    assertEquals(pathId, resumed.get("pathId").asText());
    assertEquals("Renamed", resumed.get("description").asText());

    backdate(token, resumed, 1);
    post("/api/v1/timers/pause", token, "{}");
    ResponseEntity<JsonNode> fresh =
        post("/api/v1/timers", token, "{\"labelIds\":[],\"description\":\"New work\"}");
    assertEquals(HttpStatus.CREATED, fresh.getStatusCode());
    assertEquals(0, fresh.getBody().get("carriedSeconds").asLong());
    post("/api/v1/timers/stop", token, "{}");
    assertTrue(get("/api/v1/timers/draft", token).getBody().get("pausedSeconds").isNull());
  }

  // SP-05
  @Test
  void pauseIsScopedToItsOwner() {
    String owner = token(), other = token();
    startedMinutesAgo(owner, null, null, 2);
    assertEquals(HttpStatus.CONFLICT, post("/api/v1/timers/pause", other, "{}").getStatusCode());
    post("/api/v1/timers/pause", owner, "{}");

    assertTrue(get("/api/v1/timers/draft", other).getBody().get("pausedSeconds").isNull());
    assertEquals(HttpStatus.CONFLICT, post("/api/v1/timers/resume", other, "{}").getStatusCode());
    assertEquals(HttpStatus.CONFLICT, post("/api/v1/timers/finish", other, "{}").getStatusCode());
    assertFalse(get("/api/v1/timers/draft", owner).getBody().get("pausedSeconds").isNull());
    assertEquals(HttpStatus.UNAUTHORIZED, post("/api/v1/timers/pause", null, "{}").getStatusCode());
  }

  // SP-05
  @Test
  void pauseAndResumePublishTimerEvents() throws Exception {
    String token = token();
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

    startedMinutesAgo(token, null, null, 2);
    messages.poll(5, TimeUnit.SECONDS); // started
    messages.poll(5, TimeUnit.SECONDS); // backdated
    post("/api/v1/timers/pause", token, "{}");
    assertTrue(mapper.readTree(messages.poll(5, TimeUnit.SECONDS)).get("timer").isNull());
    JsonNode resumed = post("/api/v1/timers/resume", token, "{}").getBody();
    JsonNode state = mapper.readTree(messages.poll(5, TimeUnit.SECONDS));
    assertEquals(resumed.get("id").asText(), state.get("timer").get("id").asText());
    assertEquals(resumed.get("carriedSeconds").asLong(), state.get("timer").get("carriedSeconds").asLong());
    backdate(token, resumed, 1);
    messages.poll(5, TimeUnit.SECONDS); // backdated
    post("/api/v1/timers/pause", token, "{}");
    messages.poll(5, TimeUnit.SECONDS); // paused
    post("/api/v1/timers/finish", token, "{}");
    JsonNode finished = mapper.readTree(messages.poll(5, TimeUnit.SECONDS));
    assertEquals("TIMER_STATE", finished.get("type").asText());
    assertTrue(finished.get("timer").isNull());
    socket.sendClose(WebSocket.NORMAL_CLOSURE, "done").get(5, TimeUnit.SECONDS);
  }
}
