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

  @Test
  void timerStopAndCancelAliasesHaveMatchingStatusShapeAndEffects() {
    String owner = api.register();

    JsonNode first = startTimer(owner);
    ApiClient.Reply canonicalStop = api.post("/api/v1/timers/stop", owner, null);
    assertEquals(200, canonicalStop.status(), canonicalStop.body());
    JsonNode stoppedByCanonical = canonicalStop.json();
    assertEquals(first.get("id").asText(), stoppedByCanonical.get("id").asText());
    assertFalse(stoppedByCanonical.get("running").asBoolean());
    assertCurrentIsEmpty(owner);

    JsonNode second = startTimer(owner);
    ApiClient.Reply idStop =
        api.post("/api/v1/timers/" + second.get("id").asText() + "/stop", owner, null);
    assertEquals(canonicalStop.status(), idStop.status(), idStop.body());
    JsonNode stoppedById = idStop.json();
    assertEquals(stoppedByCanonical.get("id").asText(), stoppedById.get("id").asText());
    assertEquals(stoppedByCanonical.get("running"), stoppedById.get("running"));
    assertCurrentIsEmpty(owner);

    startTimer(owner);
    ApiClient.Reply canonicalCancel = api.post("/api/v1/timers/cancel", owner, null);
    assertEquals(204, canonicalCancel.status(), canonicalCancel.body());
    assertCurrentIsEmpty(owner);

    JsonNode fourth = startTimer(owner);
    ApiClient.Reply idCancel =
        api.post("/api/v1/timers/" + fourth.get("id").asText() + "/cancel", owner, null);
    assertEquals(canonicalCancel.status(), idCancel.status(), idCancel.body());
    assertCurrentIsEmpty(owner);
  }

  private void assertCurrentIsEmpty(String owner) {
    ApiClient.Reply current = api.get("/api/v1/timers/current", owner);
    assertEquals(200, current.status(), current.body());
    assertTrue(current.body().isBlank() || current.json().isNull(), current.body());
  }

  private JsonNode startTimer(String owner) {
    ApiClient.Reply start =
        api.post("/api/v1/timers", owner, "{\"labelIds\":[],\"description\":\"Alias check\"}");
    assertEquals(201, start.status(), start.body());
    return start.json();
  }
}
