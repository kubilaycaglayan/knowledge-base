package com.know.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.web.server.LocalServerPort;

/** The current timer endpoint reports running timers and hides paused sessions. */
class TimerCurrentIntegrationTest extends IntegrationTestSupport {
  @LocalServerPort int port;
  ApiClient api;

  @BeforeEach
  void setUp() {
    api = new ApiClient(port);
  }

  @Test
  void currentReturnsNullWhenEmptyAndPausedAndReturnsTheRunningTimer() {
    String owner = api.register();
    ApiClient.Reply empty = api.get("/api/v1/timers/current", owner);
    assertEquals(200, empty.status(), empty.body());
    assertTrue(empty.body().isBlank() || empty.json().isNull(), empty.body());

    JsonNode started =
        api.created(
            "POST",
            "/api/v1/timers",
            owner,
            "{\"labelIds\":[],\"description\":\"Current state\",\"source\":\"WEB\"}");
    ApiClient.Reply running = api.get("/api/v1/timers/current", owner);
    assertEquals(200, running.status(), running.body());
    assertEquals(started.get("id").asText(), running.json().get("id").asText());
    assertTrue(running.json().get("running").asBoolean());

    ApiClient.Reply paused = api.post("/api/v1/timers/pause", owner, "{}");
    assertEquals(200, paused.status(), paused.body());
    ApiClient.Reply afterPause = api.get("/api/v1/timers/current", owner);
    assertEquals(200, afterPause.status(), afterPause.body());
    assertTrue(afterPause.body().isBlank() || afterPause.json().isNull(), afterPause.body());
    assertTrue(api.get("/api/v1/timers/draft", owner).json().hasNonNull("pausedSeconds"));
  }
}
