package com.know.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.web.server.LocalServerPort;

/** Time-entry history is owner-scoped, completion-ordered, and optionally paged. */
class TimeEntryHistoryIntegrationTest extends IntegrationTestSupport {
  @LocalServerPort int port;
  ApiClient api;

  @BeforeEach
  void setUp() {
    api = new ApiClient(port);
  }

  private JsonNode entry(String token, String description, String start, String end) {
    return api.created(
        "POST",
        "/api/v1/time-entries",
        token,
        "{\"startedAt\":\"" + start + "\",\"endedAt\":\"" + end + "\",\"labelIds\":[],\"description\":\"" + description + "\"}");
  }

  @Test
  void historyIsOwnerScopedNewestFirstAndPaginatesWithMetadata() {
    String owner = api.register();
    String other = api.register();
    JsonNode oldest = entry(owner, "Oldest", "2026-09-01T08:00:00Z", "2026-09-01T09:00:00Z");
    JsonNode middle = entry(owner, "Middle", "2026-09-02T08:00:00Z", "2026-09-02T09:00:00Z");
    JsonNode newest = entry(owner, "Newest", "2026-09-03T08:00:00Z", "2026-09-03T09:00:00Z");
    JsonNode foreign = entry(other, "Foreign", "2026-09-04T08:00:00Z", "2026-09-04T09:00:00Z");

    JsonNode all = api.get("/api/v1/time-entries", owner).json();
    assertEquals(
        List.of(newest.get("id").asText(), middle.get("id").asText(), oldest.get("id").asText()),
        all.findValuesAsText("id"));
    assertFalse(all.toString().contains(foreign.get("id").asText()));
    assertFalse(all.toString().contains("Foreign"));

    JsonNode firstPage = api.get("/api/v1/time-entries?page=0&size=2", owner).json();
    assertEquals(0, firstPage.get("page").asInt());
    assertEquals(2, firstPage.get("pageSize").asInt());
    assertEquals(3, firstPage.get("totalSessions").asLong());
    assertEquals(2, firstPage.get("totalPages").asLong());
    assertEquals(
        List.of(newest.get("id").asText(), middle.get("id").asText()),
        firstPage.get("sessions").findValuesAsText("id"));

    JsonNode secondPage = api.get("/api/v1/time-entries?page=1&size=2", owner).json();
    assertEquals(List.of(oldest.get("id").asText()), secondPage.get("sessions").findValuesAsText("id"));

    JsonNode middlePage = api.get("/api/v1/time-entries?page=1&size=1", owner).json();
    assertEquals(List.of(middle.get("id").asText()), middlePage.get("sessions").findValuesAsText("id"));
    JsonNode finalPage = api.get("/api/v1/time-entries?page=2&size=1", owner).json();
    assertEquals(List.of(oldest.get("id").asText()), finalPage.get("sessions").findValuesAsText("id"));
    JsonNode emptyPage = api.get("/api/v1/time-entries?page=0&size=2", api.register()).json();
    assertEquals(0, emptyPage.get("totalSessions").asInt());
    assertEquals(1, emptyPage.get("totalPages").asInt());
    assertEquals(0, emptyPage.get("sessions").size());
  }

  @Test
  void equalCompletionTimesUseStartedAtAsTheHistoryTieBreak() {
    String owner = api.register();
    String completedAt = "2026-09-03T10:00:00Z";
    JsonNode earlierStart = entry(owner, "Earlier start", "2026-09-03T08:00:00Z", completedAt);
    JsonNode laterStart = entry(owner, "Later start", "2026-09-03T09:00:00Z", completedAt);

    JsonNode all = api.get("/api/v1/time-entries", owner).json();
    assertEquals(
        List.of(laterStart.get("id").asText(), earlierStart.get("id").asText()),
        all.findValuesAsText("id"));
    JsonNode secondPage = api.get("/api/v1/time-entries?page=1&size=1", owner).json();
    assertEquals(
        List.of(earlierStart.get("id").asText()),
        secondPage.get("sessions").findValuesAsText("id"));
  }
}
