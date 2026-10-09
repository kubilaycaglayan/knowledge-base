package com.know.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.web.server.LocalServerPort;

/** Completed time entries can be edited while preserving ownership and interval rules. */
class TimeEntryEditIntegrationTest extends IntegrationTestSupport {
  @LocalServerPort int port;
  ApiClient api;

  @BeforeEach
  void setUp() {
    api = new ApiClient(port);
  }

  @Test
  void editPersistsCompletedEntryAndRejectsInvalidOrForeignUpdates() {
    String owner = api.register();
    String other = api.register();
    JsonNode created =
        api.created(
            "POST",
            "/api/v1/time-entries",
            owner,
            "{\"startedAt\":\"2026-09-01T08:00:00Z\",\"endedAt\":\"2026-09-01T09:00:00Z\",\"labelIds\":[],\"description\":\"Initial\"}");
    String id = created.get("id").asText();
    String pathId =
        api.created("POST", "/api/v1/paths", owner, "{\"name\":\"Edited entry path\"}")
            .get("id")
            .asText();
    String labelId =
        api.created(
                "POST",
                "/api/v1/labels",
                owner,
                "{\"name\":\"Edited entry label\",\"scopes\":[\"TIME_ENTRY\"]}")
            .get("id")
            .asText();

    ApiClient.Reply edited =
        api.put(
            "/api/v1/time-entries/" + id,
            owner,
            "{\"pathId\":\"" + pathId + "\",\"labelIds\":[\"" + labelId + "\"],\"startedAt\":\"2026-09-01T07:00:00Z\",\"endedAt\":\"2026-09-01T09:00:00Z\",\"description\":\"Edited\",\"source\":\"MANUAL\"}");
    assertEquals(200, edited.status(), edited.body());
    assertFalse(edited.json().get("running").asBoolean());
    assertEquals(pathId, edited.json().get("pathId").asText());
    assertEquals(labelId, edited.json().get("labelIds").get(0).asText());
    assertEquals(7200, edited.json().get("durationSeconds").asLong());

    ApiClient.Reply foreign =
        api.put(
            "/api/v1/time-entries/" + id,
            other,
            "{\"pathId\":null,\"labelIds\":[],\"startedAt\":\"2026-09-01T07:00:00Z\",\"endedAt\":\"2026-09-01T09:00:00Z\"}");
    assertEquals(404, foreign.status(), foreign.body());
    ApiClient.Reply reversed =
        api.put(
            "/api/v1/time-entries/" + id,
            owner,
            "{\"pathId\":null,\"labelIds\":[],\"startedAt\":\"2026-09-01T10:00:00Z\",\"endedAt\":\"2026-09-01T09:00:00Z\"}");
    assertEquals(400, reversed.status(), reversed.body());

    JsonNode persisted = api.get("/api/v1/time-entries/" + id, owner).json();
    assertEquals("Edited", persisted.get("description").asText());
    assertEquals(pathId, persisted.get("pathId").asText());
    assertEquals(labelId, persisted.get("labelIds").get(0).asText());
    assertEquals(7200, persisted.get("durationSeconds").asLong());
  }
}
