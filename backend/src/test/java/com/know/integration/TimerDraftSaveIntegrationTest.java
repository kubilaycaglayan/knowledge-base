package com.know.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.web.server.LocalServerPort;

/** Timer draft writes persist owned context, validate references, and conflict while running. */
class TimerDraftSaveIntegrationTest extends IntegrationTestSupport {
  @LocalServerPort int port;
  ApiClient api;

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

  @Test
  void saveDraftPersistsOwnedTargetsAndRejectsInvalidOrRunningUpdates() {
    String owner = api.register();
    String other = api.register();
    String ownerPath = path(owner, "Owned draft path");
    String foreignPath = path(other, "Foreign draft path");
    String ownerLabel = label(owner, "Owned draft label");
    String foreignLabel = label(other, "Foreign draft label");

    ApiClient.Reply saved =
        api.put(
            "/api/v1/timers/draft",
            owner,
            "{\"pathId\":\"" + ownerPath + "\",\"labelIds\":[\"" + ownerLabel + "\"],\"description\":\"Next session\"}");
    assertEquals(200, saved.status(), saved.body());
    JsonNode persisted = api.get("/api/v1/timers/draft", owner).json();
    assertEquals(ownerPath, persisted.get("pathId").asText());
    assertEquals(ownerLabel, persisted.get("labelIds").get(0).asText());
    assertEquals("Next session", persisted.get("description").asText());

    assertEquals(
        400,
        api.put(
                "/api/v1/timers/draft",
                owner,
                "{\"pathId\":\"" + foreignPath + "\",\"labelIds\":[],\"description\":null}")
            .status());
    assertEquals(
        400,
        api.put(
                "/api/v1/timers/draft",
                owner,
                "{\"pathId\":null,\"labelIds\":[\"" + foreignLabel + "\"],\"description\":null}")
            .status());
    assertEquals(
        400,
        api.put(
                "/api/v1/timers/draft",
                owner,
                "{\"labelIds\":[],\"description\":\"" + "x".repeat(5001) + "\"}")
            .status());

    JsonNode started =
        api.created(
            "POST",
            "/api/v1/timers",
            owner,
            "{\"pathId\":\"" + ownerPath + "\",\"labelIds\":[\"" + ownerLabel + "\"],\"description\":\"Running\"}");
    ApiClient.Reply whileRunning =
        api.put(
            "/api/v1/timers/draft",
            owner,
            "{\"pathId\":null,\"labelIds\":[],\"description\":null}");
    assertEquals(409, whileRunning.status(), whileRunning.body());
    assertEquals(started.get("id").asText(), api.get("/api/v1/timers/current", owner).json().get("id").asText());
    JsonNode draftAfterConflict = api.get("/api/v1/timers/draft", owner).json();
    assertTrue(draftAfterConflict.get("pathId").isNull());
    assertTrue(draftAfterConflict.get("labelIds").isEmpty());
  }
}
