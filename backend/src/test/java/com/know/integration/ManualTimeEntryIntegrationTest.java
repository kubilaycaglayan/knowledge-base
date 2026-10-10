package com.know.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.web.server.LocalServerPort;

/** Manual time entries persist valid intervals and reject reversed intervals. */
class ManualTimeEntryIntegrationTest extends IntegrationTestSupport {
  @LocalServerPort int port;
  ApiClient api;

  @BeforeEach
  void setUp() {
    api = new ApiClient(port);
  }

  @Test
  void manualEntryPersistsDurationAndRejectsInvalidIntervals() {
    String owner = api.register();
    ApiClient.Reply created =
        api.post(
            "/api/v1/time-entries",
            owner,
            "{\"startedAt\":\"2026-09-01T10:00:00Z\",\"endedAt\":\"2026-09-01T11:00:00Z\",\"labelIds\":[],\"description\":\"Manual block\"}");
    assertEquals(200, created.status(), created.body());
    JsonNode entry = created.json();
    assertFalse(entry.get("running").asBoolean());
    assertEquals("2026-09-01T10:00:00Z", entry.get("startedAt").asText());
    assertEquals("2026-09-01T11:00:00Z", entry.get("endedAt").asText());
    assertEquals(3600, entry.get("durationSeconds").asLong());
    assertEquals("MANUAL", entry.get("source").asText());

    JsonNode persisted =
        api.get("/api/v1/time-entries/" + entry.get("id").asText(), owner).json();
    assertEquals("Manual block", persisted.get("description").asText());
    assertEquals(3600, persisted.get("durationSeconds").asLong());
    assertEquals(entry.get("startedAt").asText(), persisted.get("startedAt").asText());
    assertEquals(entry.get("endedAt").asText(), persisted.get("endedAt").asText());

    ApiClient.Reply reversed =
        api.post(
            "/api/v1/time-entries",
            owner,
            "{\"startedAt\":\"2026-09-01T11:00:00Z\",\"endedAt\":\"2026-09-01T10:00:00Z\",\"labelIds\":[]} ");
    assertEquals(400, reversed.status(), reversed.body());
    ApiClient.Reply missingEnd =
        api.post(
            "/api/v1/time-entries",
            owner,
            "{\"startedAt\":\"2026-09-01T10:00:00Z\",\"labelIds\":[]}");
    assertEquals(400, missingEnd.status(), missingEnd.body());
  }

  @Test
  void manualEntryNormalizesPositiveAndNegativeOffsetTimestampsToUtc() {
    String owner = api.register();
    ApiClient.Reply created =
        api.post(
            "/api/v1/time-entries",
            owner,
            "{\"startedAt\":\"2026-09-01T05:00:00-05:00\",\"endedAt\":\"2026-09-01T14:00:00+03:00\",\"labelIds\":[]}");

    assertEquals(200, created.status(), created.body());
    JsonNode entry = created.json();
    assertEquals("2026-09-01T10:00:00Z", entry.get("startedAt").asText());
    assertEquals("2026-09-01T11:00:00Z", entry.get("endedAt").asText());
    assertEquals(3600, entry.get("durationSeconds").asLong());

    JsonNode persisted = api.get("/api/v1/time-entries/" + entry.get("id").asText(), owner).json();
    assertEquals("2026-09-01T10:00:00Z", persisted.get("startedAt").asText());
    assertEquals("2026-09-01T11:00:00Z", persisted.get("endedAt").asText());
    assertEquals(3600, persisted.get("durationSeconds").asLong());
  }
}
