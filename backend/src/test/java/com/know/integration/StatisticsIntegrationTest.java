package com.know.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.web.server.LocalServerPort;

/** Statistics use server-calculated interval overlap and aggregate only the requested owner. */
class StatisticsIntegrationTest extends IntegrationTestSupport {
  @LocalServerPort int port;
  ApiClient api;

  private record Segment(Instant start, Instant end, String pathId, String labelId) {}

  @BeforeEach
  void setUp() {
    api = new ApiClient(port);
  }

  private String path(String token, String name) {
    return api.created("POST", "/api/v1/paths", token, "{\"name\":\"" + name + "\"}")
        .get("id")
        .asText();
  }

  private String label(String token, String name) {
    return api.created(
            "POST",
            "/api/v1/labels",
            token,
            "{\"name\":\"" + name + "\",\"scopes\":[\"TIME_ENTRY\"]}")
        .get("id")
        .asText();
  }

  private void entry(String token, Segment segment) {
    api.created(
        "POST",
        "/api/v1/time-entries",
        token,
        "{\"pathId\":\""
            + segment.pathId()
            + "\",\"labelIds\":[\""
            + segment.labelId()
            + "\"],\"startedAt\":\""
            + segment.start()
            + "\",\"endedAt\":\""
            + segment.end()
            + "\"}");
  }

  private long overlap(Segment segment, Instant from, Instant to) {
    Instant start = segment.start().isAfter(from) ? segment.start() : from;
    Instant end = segment.end().isBefore(to) ? segment.end() : to;
    return Math.max(0, Duration.between(start, end).toSeconds());
  }

  private long total(List<Segment> segments, Instant from, Instant to) {
    return segments.stream().mapToLong(segment -> overlap(segment, from, to)).sum();
  }

  private void assertGroup(JsonNode map, String id, List<Segment> segments, Instant from, Instant to) {
    long expected =
        segments.stream()
            .filter(segment -> segment.pathId().equals(id) || segment.labelId().equals(id))
            .mapToLong(segment -> overlap(segment, from, to))
            .sum();
    JsonNode actual = map.get(id);
    assertEquals(expected, actual == null ? 0 : actual.asLong());
  }

  @Test
  void statisticsAggregateIntervalOverlapByPeriodPathLabelAndOwner() {
    String owner = api.register();
    String other = api.register();
    String pathA = path(owner, "Statistics path A");
    String pathB = path(owner, "Statistics path B");
    String labelA = label(owner, "Statistics label A");
    String labelB = label(owner, "Statistics label B");
    String otherPath = path(other, "Foreign statistics path");
    String otherLabel = label(other, "Foreign statistics label");

    Instant now = Instant.now().truncatedTo(ChronoUnit.SECONDS);
    List<Segment> ownerSegments =
        List.of(
            new Segment(now.minusSeconds(3600), now.minusSeconds(300), pathA, labelA),
            new Segment(now.minusSeconds(3 * 86400L + 1800), now.minusSeconds(3 * 86400L), pathB, labelA),
            new Segment(now.minusSeconds(10 * 86400L + 3600), now.minusSeconds(10 * 86400L), pathB, labelB));
    ownerSegments.forEach(segment -> entry(owner, segment));
    entry(
        other,
        new Segment(now.minusSeconds(1800), now.minusSeconds(600), otherPath, otherLabel));

    LocalDate today = now.atZone(ZoneOffset.UTC).toLocalDate();
    Instant todayStart = today.atStartOfDay(ZoneOffset.UTC).toInstant();
    Instant weekStart = today.minusDays(6).atStartOfDay(ZoneOffset.UTC).toInstant();
    Instant monthStart = today.withDayOfMonth(1).atStartOfDay(ZoneOffset.UTC).toInstant();
    JsonNode stats = api.get("/api/v1/statistics", owner).json();

    assertEquals(total(ownerSegments, todayStart, now), stats.get("todaySeconds").asLong());
    assertEquals(total(ownerSegments, weekStart, now), stats.get("weekSeconds").asLong());
    assertEquals(total(ownerSegments, monthStart, now), stats.get("monthSeconds").asLong());
    assertGroup(stats.get("todayByPath"), pathA, ownerSegments, todayStart, now);
    assertGroup(stats.get("weekByPath"), pathB, ownerSegments, weekStart, now);
    assertGroup(stats.get("todayByLabel"), labelA, ownerSegments, todayStart, now);
    assertGroup(stats.get("weekByLabel"), labelA, ownerSegments, weekStart, now);
    assertGroup(stats.get("weekByLabel"), labelB, ownerSegments, weekStart, now);
    assertEquals(0, stats.get("todayByPath").path(otherPath).asLong());
    assertEquals(0, stats.get("todayByLabel").path(otherLabel).asLong());
  }
}
