package com.know.integration;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.web.server.LocalServerPort;

/** The log list is owner-scoped and ordered by occurrence time, with no query filters. */
class LogListIntegrationTest extends IntegrationTestSupport {
  @LocalServerPort int port;
  ApiClient api;

  @BeforeEach
  void setUp() {
    api = new ApiClient(port);
  }

  private JsonNode log(String token, String body, String occurredAt) {
    return api.created(
        "POST",
        "/api/v1/logs",
        token,
        "{\"body\":\"" + body + "\",\"occurredAt\":\"" + occurredAt + "\"}");
  }

  @Test
  void listReturnsOnlyOwnedLogsNewestOccurrenceFirst() {
    String owner = api.register();
    String other = api.register();
    JsonNode old = log(owner, "Old", "2026-09-01T09:00:00Z");
    JsonNode middle = log(owner, "Middle", "2026-09-02T09:00:00Z");
    JsonNode latest = log(owner, "Latest", "2026-09-03T09:00:00Z");
    JsonNode foreign = log(other, "Foreign latest", "2026-09-04T09:00:00Z");

    JsonNode rows = api.get("/api/v1/logs", owner).json();
    assertEquals(3, rows.size());
    assertEquals(
        List.of(
            latest.get("id").asText(), middle.get("id").asText(), old.get("id").asText()),
        rows.findValuesAsText("id"));
    assertFalse(rows.toString().contains(foreign.get("id").asText()));
    assertFalse(rows.toString().contains("Foreign latest"));
    assertTrue(api.get("/api/v1/logs", api.register()).json().isEmpty());
  }
}
