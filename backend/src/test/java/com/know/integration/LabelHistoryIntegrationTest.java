package com.know.integration;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

/** Label usage history (docs/label-history-acceptance-checklist.md). */
class LabelHistoryIntegrationTest extends IntegrationTestSupport {
  @LocalServerPort int port;
  @Autowired TestRestTemplate rest;
  String base;

  @BeforeEach
  void setUp() {
    base = "http://localhost:" + port;
  }

  String token() {
    String body =
        "{\"email\":\"" + UUID.randomUUID() + "@test.example\",\"password\":\"SecurePassword123!\"}";
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

  JsonNode ok(HttpMethod method, String path, String token, String body) {
    ResponseEntity<JsonNode> res = exchange(method, path, token, body);
    assertTrue(res.getStatusCode().is2xxSuccessful(), path + " -> " + res.getStatusCode());
    return res.getBody();
  }

  String label(String token, String name) {
    return ok(
            HttpMethod.POST,
            "/api/v1/labels",
            token,
            "{\"name\":\""
                + name
                + "\",\"scopes\":[\"NOTE\",\"CALENDAR\",\"TIME_ENTRY\",\"LOG\",\"BOARD\"]}")
        .get("id")
        .asText();
  }

  static String ids(String... labelIds) {
    StringBuilder json = new StringBuilder("[");
    for (String id : labelIds) json.append(json.length() > 1 ? "," : "").append('"').append(id).append('"');
    return json.append(']').toString();
  }

  String session(String token, Instant start, Instant end, String... labelIds) {
    return ok(
            HttpMethod.POST,
            "/api/v1/time-entries",
            token,
            "{\"labelIds\":"
                + ids(labelIds)
                + ",\"startedAt\":\""
                + start
                + "\",\"endedAt\":\""
                + end
                + "\"}")
        .get("id")
        .asText();
  }

  void log(String token, Instant occurredAt, String... labelIds) {
    String id =
        ok(
                HttpMethod.POST,
                "/api/v1/logs",
                token,
                "{\"body\":\"Log\",\"occurredAt\":\"" + occurredAt + "\"}")
            .get("id")
            .asText();
    ok(HttpMethod.PUT, "/api/v1/logs/" + id + "/labels", token, "{\"labelIds\":" + ids(labelIds) + "}");
  }

  String note(String token, String labelName) {
    return ok(
            HttpMethod.POST,
            "/api/v1/notes",
            token,
            "{\"title\":\"Note\",\"content\":\"{}\",\"tags\":[\"" + labelName + "\"]}")
        .get("id")
        .asText();
  }

  void card(String token, String... labelIds) {
    String board =
        ok(HttpMethod.POST, "/api/v1/boards", token, "{\"name\":\"History board\"}")
            .get("id")
            .asText();
    ok(
        HttpMethod.POST,
        "/api/v1/boards/" + board + "/cards",
        token,
        "{\"title\":\"Card\",\"labelIds\":" + ids(labelIds) + "}");
  }

  JsonNode history(String token, String labelId, String query) {
    return ok(HttpMethod.GET, "/api/v1/labels/" + labelId + "/history" + query, token, null);
  }

  static Instant at(String iso) {
    return Instant.parse(iso);
  }

  // LH-01
  @Test
  void historySummarisesEveryKindOfUse() {
    String token = token();
    String labelId = label(token, "Everywhere");
    session(token, at("2026-03-10T09:00:00Z"), at("2026-03-10T10:30:00Z"), labelId);
    session(token, at("2026-05-02T14:00:00Z"), at("2026-05-02T15:00:00Z"), labelId);
    log(token, at("2026-02-01T08:15:00Z"), labelId);
    ok(
        HttpMethod.PUT,
        "/api/v1/calendar/days/2026-01-20",
        token,
        "{\"labels\":[{\"labelId\":\"" + labelId + "\"}]}");
    note(token, "Everywhere");
    Instant beforeCard = Instant.now().minusSeconds(5);
    card(token, labelId);

    JsonNode history = history(token, labelId, "");
    assertEquals(labelId, history.get("labelId").asText());
    assertEquals("Everywhere", history.get("name").asText());
    assertEquals(at("2026-01-20T00:00:00Z"), Instant.parse(history.get("firstUsedAt").asText()));
    assertTrue(Instant.parse(history.get("lastUsedAt").asText()).isAfter(beforeCard));
    assertEquals(6, history.get("totalUses").asLong());
    assertEquals(9000, history.get("trackedSeconds").asLong());
    JsonNode uses = history.get("uses");
    assertEquals(2, uses.get("sessions").asLong());
    assertEquals(1, uses.get("logs").asLong());
    assertEquals(1, uses.get("notes").asLong());
    assertEquals(1, uses.get("calendarDays").asLong());
    assertEquals(1, uses.get("cards").asLong());
  }

  // LH-02
  @Test
  void relatedRecordsArePagedScopedAndExcludeDeletedContent() {
    String owner = token();
    String labelId = label(owner, "Record list");
    for (int i = 0; i < 11; i++)
      session(owner, at("2026-05-02T09:00:00Z").plusSeconds(i),
          at("2026-05-02T10:00:00Z").plusSeconds(i), labelId);
    String endpoint = "/api/v1/labels/" + labelId + "/history/records";
    JsonNode first = ok(HttpMethod.GET, endpoint + "?kind=sessions", owner, null);
    assertEquals(10, first.get("items").size());
    assertTrue(first.get("hasMore").asBoolean());
    assertEquals("2026-05-02T09:00:10Z", first.get("items").get(0).get("date").asText());
    JsonNode second = ok(HttpMethod.GET, endpoint + "?kind=sessions&page=1", owner, null);
    assertEquals(1, second.get("items").size());
    assertFalse(second.get("hasMore").asBoolean());
    log(owner, at("2026-05-02T09:00:00Z"), labelId);
    assertEquals("Log", ok(HttpMethod.GET, endpoint + "?kind=logs", owner, null)
        .get("items").get(0).get("title").asText());
    ok(HttpMethod.PUT, "/api/v1/calendar/days/2026-05-02", owner,
        "{\"note\":\"A good day\",\"labels\":[{\"labelId\":\"" + labelId + "\"}]}");
    assertEquals("2026-05-02", ok(HttpMethod.GET, endpoint + "?kind=dates", owner, null)
        .get("items").get(0).get("date").asText());
    String noteId = note(owner, "Record list");
    assertEquals("Note", ok(HttpMethod.GET, endpoint + "?kind=notes", owner, null)
        .get("items").get(0).get("title").asText());
    exchange(HttpMethod.DELETE, "/api/v1/notes/" + noteId, owner, null);
    assertEquals(0, ok(HttpMethod.GET, endpoint + "?kind=notes", owner, null).get("items").size());
    String sessionId = first.get("items").get(0).get("id").asText();
    exchange(HttpMethod.DELETE, "/api/v1/time-entries/" + sessionId, owner, null);
    assertFalse(ok(HttpMethod.GET, endpoint + "?kind=sessions", owner, null).get("hasMore").asBoolean());
    assertEquals(HttpStatus.NOT_FOUND, exchange(HttpMethod.GET, endpoint + "?kind=logs", token(), null).getStatusCode());
    assertEquals(HttpStatus.BAD_REQUEST, exchange(HttpMethod.GET, endpoint + "?kind=sessions&page=-1", owner, null).getStatusCode());
    assertEquals(HttpStatus.BAD_REQUEST, exchange(HttpMethod.GET, endpoint + "?kind=unknown", owner, null).getStatusCode());
  }

  @Test
  void unusedLabelHasAnEmptyHistory() {
    String token = token();
    String labelId = label(token, "Unused");

    JsonNode history = history(token, labelId, "");
    assertTrue(history.get("firstUsedAt").isNull());
    assertTrue(history.get("lastUsedAt").isNull());
    assertEquals(0, history.get("totalUses").asLong());
    assertEquals(0, history.get("trackedSeconds").asLong());
    assertEquals(0, history.get("timeline").size());
    assertEquals(24, history.get("hours").size());
    history.get("hours").forEach(hour -> assertEquals(0, hour.get("uses").asLong()));
    assertEquals(0, history.get("related").size());
  }

  @Test
  void postgresHighVolumeRecordPagesHaveStableOrderWithoutGaps() {
    org.junit.jupiter.api.Assumptions.assumeTrue(
        System.getenv("KB_TEST_POSTGRES_URL") != null,
        "This high-volume history case runs against PostgreSQL");
    String owner = token();
    String labelId = label(owner, "Large history");
    Instant base = at("2026-05-02T09:00:00Z");
    for (int index = 0; index < 55; index++) {
      Instant start = base.plusSeconds(index * 60L);
      session(owner, start, start.plusSeconds(20), labelId);
    }

    String endpoint = "/api/v1/labels/" + labelId + "/history/records?kind=sessions";
    List<String> actual = new java.util.ArrayList<>();
    List<String> dates = new java.util.ArrayList<>();
    for (int page = 0; page < 6; page++) {
      JsonNode response = ok(HttpMethod.GET, endpoint + "&page=" + page, owner, null);
      response.get("items")
          .forEach(
              item -> {
                actual.add(item.get("id").asText());
                dates.add(item.get("date").asText());
              });
      assertEquals(page < 5, response.get("hasMore").asBoolean());
    }
    assertEquals(55, actual.size());
    assertEquals(55, actual.stream().distinct().count());
    List<String> expectedDates = new java.util.ArrayList<>();
    for (int index = 54; index >= 0; index--)
      expectedDates.add(base.plusSeconds(index * 60L).toString());
    assertEquals(expectedDates, dates);
  }

  @Test
  void postgresConcurrentIdenticalLogLabelAssignmentsAreIdempotent() throws Exception {
    org.junit.jupiter.api.Assumptions.assumeTrue(
        System.getenv("KB_TEST_POSTGRES_URL") != null,
        "This concurrent label assignment case runs against PostgreSQL");
    String owner = token();
    String labelId = label(owner, "Concurrent assignment");
    JsonNode log =
        ok(
            HttpMethod.POST,
            "/api/v1/logs",
            owner,
            "{\"body\":\"Concurrent log\",\"occurredAt\":\"2026-05-02T09:00:00Z\"}");
    CyclicBarrier startTogether = new CyclicBarrier(2);
    try (ExecutorService requests = Executors.newFixedThreadPool(2)) {
      Future<Integer> first =
          requests.submit(() -> assignLabelTogether(owner, log.get("id").asText(), labelId, startTogether));
      Future<Integer> second =
          requests.submit(() -> assignLabelTogether(owner, log.get("id").asText(), labelId, startTogether));
      assertEquals(200, first.get(10, TimeUnit.SECONDS));
      assertEquals(200, second.get(10, TimeUnit.SECONDS));
    }
    JsonNode history = history(owner, labelId, "");
    assertEquals(1, history.get("uses").get("logs").asLong());
  }

  @Test
  void postgresConcurrentTimeEntryLabelReplacementsKeepOneAssignment() throws Exception {
    org.junit.jupiter.api.Assumptions.assumeTrue(
        System.getenv("KB_TEST_POSTGRES_URL") != null,
        "This concurrent time-entry label assignment case runs against PostgreSQL");
    String owner = token();
    String labelId = label(owner, "Concurrent time assignment");
    Instant start = at("2026-05-02T09:00:00Z");
    String entryId = session(owner, start, start.plusSeconds(20));
    CyclicBarrier startTogether = new CyclicBarrier(2);
    try (ExecutorService requests = Executors.newFixedThreadPool(2)) {
      Future<Integer> first =
          requests.submit(
              () ->
                  replaceTimeEntryLabelsTogether(
                      owner, entryId, labelId, start, start.plusSeconds(20), startTogether));
      Future<Integer> second =
          requests.submit(
              () ->
                  replaceTimeEntryLabelsTogether(
                      owner, entryId, labelId, start, start.plusSeconds(20), startTogether));
      assertEquals(200, first.get(10, TimeUnit.SECONDS));
      assertEquals(200, second.get(10, TimeUnit.SECONDS));
    }
    JsonNode entry = ok(HttpMethod.GET, "/api/v1/time-entries/" + entryId, owner, null);
    List<String> assignments = new java.util.ArrayList<>();
    entry.get("labelIds").forEach(value -> assignments.add(value.asText()));
    assertEquals(List.of(labelId), assignments);
  }

  @Test
  void postgresRequestedZoneBucketsTrackedTimeAcrossSpringForward() {
    org.junit.jupiter.api.Assumptions.assumeTrue(
        System.getenv("KB_TEST_POSTGRES_URL") != null,
        "This timezone transition case runs against PostgreSQL");
    String owner = token();
    String labelId = label(owner, "Spring forward");
    session(
        owner,
        Instant.parse("2024-03-10T06:30:00Z"),
        Instant.parse("2024-03-10T08:00:00Z"),
        labelId);

    JsonNode result = history(owner, labelId, "?zone=America/New_York");
    assertEquals(5400, result.get("trackedSeconds").asLong());
    assertEquals(1800, result.get("hours").get(1).get("trackedSeconds").asLong());
    assertEquals(0, result.get("hours").get(2).get("trackedSeconds").asLong());
    assertEquals(3600, result.get("hours").get(3).get("trackedSeconds").asLong());
  }

  private int assignLabelTogether(
      String token, String logId, String labelId, CyclicBarrier startTogether) throws Exception {
    startTogether.await(5, TimeUnit.SECONDS);
    return exchange(
            HttpMethod.PUT,
            "/api/v1/logs/" + logId + "/labels",
            token,
            "{\"labelIds\":[\"" + labelId + "\"]}")
        .getStatusCode()
        .value();
  }

  private int replaceTimeEntryLabelsTogether(
      String token,
      String entryId,
      String labelId,
      Instant start,
      Instant end,
      CyclicBarrier startTogether)
      throws Exception {
    startTogether.await(5, TimeUnit.SECONDS);
    return exchange(
            HttpMethod.PUT,
            "/api/v1/time-entries/" + entryId,
            token,
            "{\"labelIds\":[\""
                + labelId
                + "\"],\"startedAt\":\""
                + start
                + "\",\"endedAt\":\""
                + end
                + "\",\"description\":\"Concurrent entry\"}")
        .getStatusCode()
        .value();
  }

  // LH-03
  @Test
  void timelineAndHoursUseTheRequestedZone() {
    String token = token();
    String labelId = label(token, "Midnight");
    YearMonth month = YearMonth.now(ZoneOffset.UTC).minusMonths(2);
    Instant start = month.atEndOfMonth().atTime(23, 30).toInstant(ZoneOffset.UTC);
    session(token, start, start.plus(1, ChronoUnit.HOURS), labelId);

    JsonNode utc = history(token, labelId, "");
    JsonNode timeline = utc.get("timeline");
    assertEquals(3, timeline.size());
    assertEquals(month.toString(), timeline.get(0).get("month").asText());
    assertEquals(1, timeline.get(0).get("uses").asLong());
    assertEquals(1800, timeline.get(0).get("trackedSeconds").asLong());
    assertEquals(month.plusMonths(1).toString(), timeline.get(1).get("month").asText());
    assertEquals(0, timeline.get(1).get("uses").asLong());
    assertEquals(1800, timeline.get(1).get("trackedSeconds").asLong());
    assertEquals(month.plusMonths(2).toString(), timeline.get(2).get("month").asText());
    assertEquals(0, timeline.get(2).get("trackedSeconds").asLong());
    JsonNode hours = utc.get("hours");
    assertEquals(23, hours.get(23).get("hour").asInt());
    assertEquals(1, hours.get(23).get("uses").asLong());
    assertEquals(1800, hours.get(23).get("trackedSeconds").asLong());
    assertEquals(0, hours.get(0).get("uses").asLong());
    assertEquals(1800, hours.get(0).get("trackedSeconds").asLong());

    // Istanbul is UTC+3 all year, so the session starts at 02:30 on the next month's first day.
    JsonNode istanbul = history(token, labelId, "?zone=Europe/Istanbul");
    assertEquals(month.plusMonths(1).toString(), istanbul.get("timeline").get(0).get("month").asText());
    assertEquals(3600, istanbul.get("timeline").get(0).get("trackedSeconds").asLong());
    assertEquals(1, istanbul.get("hours").get(2).get("uses").asLong());
    assertEquals(1800, istanbul.get("hours").get(2).get("trackedSeconds").asLong());
    assertEquals(1800, istanbul.get("hours").get(3).get("trackedSeconds").asLong());
  }

  // LH-03
  @Test
  void unknownZoneIsRejected() {
    String token = token();
    String labelId = label(token, "Zoned");
    assertEquals(
        HttpStatus.BAD_REQUEST,
        exchange(HttpMethod.GET, "/api/v1/labels/" + labelId + "/history?zone=Mars/Base", token, null)
            .getStatusCode());
  }

  // LH-04
  @Test
  void relatedLabelsCountSharedUses() {
    String token = token();
    String a = label(token, "Alpha");
    String b = label(token, "Bravo");
    String c = label(token, "Charlie");
    label(token, "Unrelated");
    session(token, at("2026-04-01T09:00:00Z"), at("2026-04-01T10:00:00Z"), a, b);
    session(token, at("2026-04-02T09:00:00Z"), at("2026-04-02T09:30:00Z"), a, b, c);
    log(token, at("2026-04-03T09:00:00Z"), a, c);
    card(token, a, b);

    JsonNode related = history(token, a, "").get("related");
    assertEquals(2, related.size());
    assertEquals(b, related.get(0).get("id").asText());
    assertEquals("Bravo", related.get(0).get("name").asText());
    assertTrue(related.get(0).has("color"));
    assertEquals(3, related.get(0).get("together").asLong());
    assertEquals(5400, related.get(0).get("trackedSeconds").asLong());
    assertEquals(c, related.get(1).get("id").asText());
    assertEquals(2, related.get(1).get("together").asLong());
    assertEquals(1800, related.get(1).get("trackedSeconds").asLong());

    JsonNode fromBravo = history(token, b, "").get("related");
    assertEquals(a, fromBravo.get(0).get("id").asText());
    assertEquals(3, fromBravo.get(0).get("together").asLong());
    assertEquals(c, fromBravo.get(1).get("id").asText());
    assertEquals(1, fromBravo.get(1).get("together").asLong());
  }

  // LH-05
  @Test
  void historyIsScopedToItsOwner() {
    String owner = token();
    String labelId = label(owner, "Private");
    String other = token();
    assertEquals(
        HttpStatus.NOT_FOUND,
        exchange(HttpMethod.GET, "/api/v1/labels/" + labelId + "/history", other, null)
            .getStatusCode());
  }

  // LH-05
  @Test
  void deletedSessionsAndArchivedNotesDoNotCount() {
    String token = token();
    String labelId = label(token, "Gone");
    String sessionId =
        session(token, at("2026-04-01T09:00:00Z"), at("2026-04-01T10:00:00Z"), labelId);
    String noteId = note(token, "Gone");
    assertEquals(
        HttpStatus.NO_CONTENT,
        exchange(HttpMethod.DELETE, "/api/v1/time-entries/" + sessionId, token, null)
            .getStatusCode());
    assertEquals(
        HttpStatus.NO_CONTENT,
        exchange(HttpMethod.DELETE, "/api/v1/notes/" + noteId, token, null).getStatusCode());

    JsonNode history = history(token, labelId, "");
    assertEquals(0, history.get("totalUses").asLong());
    assertEquals(0, history.get("trackedSeconds").asLong());
    assertTrue(history.get("firstUsedAt").isNull());
  }
}
