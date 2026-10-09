package com.know.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.web.server.LocalServerPort;

/** Starting a timer assigns its start time on the server and preserves selected context. */
class TimerStartIntegrationTest extends IntegrationTestSupport {
  @LocalServerPort int port;
  ApiClient api;

  @BeforeEach
  void setUp() {
    api = new ApiClient(port);
  }

  @Test
  void startUsesServerTimePersistsContextAndRejectsASecondRunningTimer() {
    String owner = api.register();
    String pathId =
        api.created("POST", "/api/v1/paths", owner, "{\"name\":\"Timer path\"}")
            .get("id")
            .asText();
    String labelId =
        api.created(
                "POST",
                "/api/v1/labels",
                owner,
                "{\"name\":\"Timer label\",\"scopes\":[\"TIME_ENTRY\"]}")
            .get("id")
            .asText();

    Instant requestStarted = Instant.now();
    ApiClient.Reply start =
        api.post(
            "/api/v1/timers",
            owner,
            "{\"pathId\":\"" + pathId + "\",\"labelIds\":[\"" + labelId + "\"],\"description\":\"Focused session\",\"source\":\"WEB\"}");
    Instant responseReceived = Instant.now();
    assertEquals(201, start.status(), start.body());
    JsonNode timer = start.json();
    assertTrue(timer.get("running").asBoolean());
    Instant startedAt = Instant.parse(timer.get("startedAt").asText());
    assertFalse(startedAt.isBefore(requestStarted));
    assertFalse(startedAt.isAfter(responseReceived));
    assertEquals(pathId, timer.get("pathId").asText());
    assertEquals(labelId, timer.get("labelIds").get(0).asText());
    assertEquals("Focused session", timer.get("description").asText());
    assertEquals("WEB", timer.get("source").asText());

    ApiClient.Reply duplicate =
        api.post(
            "/api/v1/timers",
            owner,
            "{\"labelIds\":[],\"description\":\"Second session\",\"source\":\"WEB\"}");
    assertEquals(409, duplicate.status(), duplicate.body());
    JsonNode current = api.get("/api/v1/timers/current", owner).json();
    assertEquals(timer.get("id").asText(), current.get("id").asText());
  }
}
