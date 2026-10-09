package com.know.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.web.server.LocalServerPort;

/** Log updates persist the replacement values and reject stale versions. */
class LogUpdateIntegrationTest extends IntegrationTestSupport {
  @LocalServerPort int port;
  ApiClient api;

  @BeforeEach
  void setUp() {
    api = new ApiClient(port);
  }

  @Test
  void updatePersistsBodyAndOccurrenceTimeAndRejectsStaleVersion() {
    String owner = api.register();
    JsonNode created =
        api.created(
            "POST",
            "/api/v1/logs",
            owner,
            "{\"body\":\"Original thought\",\"occurredAt\":\"2026-09-11T10:15:00Z\"}");
    String id = created.get("id").asText();
    long version = created.get("version").asLong();

    ApiClient.Reply update =
        api.put(
            "/api/v1/logs/" + id,
            owner,
            "{\"body\":\"Revised thought\",\"occurredAt\":\"2026-09-12T11:20:00Z\",\"version\":"
                + version
                + "}");
    assertEquals(200, update.status(), update.body());
    assertEquals("Revised thought", update.json().get("body").asText());
    assertEquals("2026-09-12T11:20:00Z", update.json().get("occurredAt").asText());
    assertNotEquals(version, update.json().get("version").asLong());

    ApiClient.Reply detail = api.get("/api/v1/logs/" + id, owner);
    assertEquals("Revised thought", detail.json().get("body").asText());
    assertEquals("2026-09-12T11:20:00Z", detail.json().get("occurredAt").asText());
    assertEquals(update.json().get("version").asLong(), detail.json().get("version").asLong());

    ApiClient.Reply stale =
        api.put(
            "/api/v1/logs/" + id,
            owner,
            "{\"body\":\"Stale replacement\",\"occurredAt\":\"2026-09-13T12:00:00Z\",\"version\":"
                + version
                + "}");
    assertEquals(409, stale.status(), stale.body());
    JsonNode afterConflict = api.get("/api/v1/logs/" + id, owner).json();
    assertEquals("Revised thought", afterConflict.get("body").asText());
    assertEquals("2026-09-12T11:20:00Z", afterConflict.get("occurredAt").asText());
  }
}
