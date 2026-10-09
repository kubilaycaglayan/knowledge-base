package com.know.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.web.server.LocalServerPort;

/** Timer draft reads return defaults and persist a user's idle selection. */
class TimerDraftReadIntegrationTest extends IntegrationTestSupport {
  @LocalServerPort int port;
  ApiClient api;

  @BeforeEach
  void setUp() {
    api = new ApiClient(port);
  }

  @Test
  void draftReturnsDefaultsAndThePersistedIdleSelection() {
    String owner = api.register();
    String other = api.register();
    JsonNode defaults = api.get("/api/v1/timers/draft", owner).json();
    assertTrue(defaults.get("labelIds").isArray());
    assertEquals(0, defaults.get("labelIds").size());
    assertTrue(defaults.get("pathId").isNull());
    assertTrue(defaults.get("description").isNull());
    assertTrue(defaults.get("pausedSeconds").isNull());

    String pathId =
        api.created("POST", "/api/v1/paths", owner, "{\"name\":\"Draft path\"}")
            .get("id")
            .asText();
    String labelId =
        api.created(
                "POST",
                "/api/v1/labels",
                owner,
                "{\"name\":\"Draft label\",\"scopes\":[\"TIME_ENTRY\"]}")
            .get("id")
            .asText();
    ApiClient.Reply saved =
        api.put(
            "/api/v1/timers/draft",
            owner,
            "{\"pathId\":\"" + pathId + "\",\"labelIds\":[\"" + labelId + "\"],\"description\":\"Study next\"}");
    assertEquals(200, saved.status(), saved.body());

    JsonNode persisted = api.get("/api/v1/timers/draft", owner).json();
    assertEquals(pathId, persisted.get("pathId").asText());
    assertEquals(labelId, persisted.get("labelIds").get(0).asText());
    assertEquals("Study next", persisted.get("description").asText());
    assertTrue(api.get("/api/v1/timers/draft", other).json().get("labelIds").isEmpty());
  }
}
