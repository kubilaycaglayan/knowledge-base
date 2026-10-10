package com.know.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.web.server.LocalServerPort;

/** Timer configuration is owner-scoped and an optional end time completes the timer. */
class TimerConfigureIntegrationTest extends IntegrationTestSupport {
  @LocalServerPort int port;
  ApiClient api;

  @BeforeEach
  void setUp() {
    api = new ApiClient(port);
  }

  private JsonNode start(String token, String description) {
    return api.created(
        "POST",
        "/api/v1/timers",
        token,
        "{\"labelIds\":[],\"description\":\"" + description + "\",\"source\":\"WEB\"}");
  }

  @Test
  void configurePersistsRunningTimerFieldsAndOptionalEndTimeWithoutCrossingOwners() {
    String owner = api.register();
    String other = api.register();
    JsonNode ownerTimer = start(owner, "Initial");
    JsonNode otherTimer = start(other, "Other user's timer");
    String ownerId = ownerTimer.get("id").asText();
    String otherId = otherTimer.get("id").asText();
    String startedAt = Instant.now().minusSeconds(90).truncatedTo(ChronoUnit.MICROS).toString();
    String startedAtWithOffset = Instant.parse(startedAt).atOffset(ZoneOffset.ofHours(-5)).toString();

    ApiClient.Reply forbidden =
        api.put(
            "/api/v1/timers/" + ownerId,
            other,
            "{\"pathId\":null,\"labelIds\":[],\"startedAt\":\"" + startedAt + "\",\"description\":\"Intrusion\"}");
    assertEquals(404, forbidden.status(), forbidden.body());
    assertEquals(otherId, api.get("/api/v1/timers/current", other).json().get("id").asText());

    String endedAt = Instant.now().minusSeconds(5).truncatedTo(ChronoUnit.MICROS).toString();
    String endedAtWithOffset = Instant.parse(endedAt).atOffset(ZoneOffset.ofHours(3)).toString();
    ApiClient.Reply configured =
        api.put(
            "/api/v1/timers/" + ownerId,
            owner,
            "{\"pathId\":null,\"labelIds\":[],\"startedAt\":\""
                + startedAtWithOffset
                + "\",\"endedAt\":\""
                + endedAtWithOffset
                + "\",\"description\":\"Completed by configuration\"}");
    assertEquals(200, configured.status(), configured.body());
    assertFalse(configured.json().get("running").asBoolean());
    assertEquals(startedAt, configured.json().get("startedAt").asText());
    assertEquals(endedAt, configured.json().get("endedAt").asText());
    assertEquals("Completed by configuration", configured.json().get("description").asText());
    assertTrue(api.get("/api/v1/timers/current", owner).body().isBlank());

    JsonNode persisted = api.get("/api/v1/time-entries/" + ownerId, owner).json();
    assertFalse(persisted.get("running").asBoolean());
    assertEquals(startedAt, persisted.get("startedAt").asText());
    assertEquals(endedAt, persisted.get("endedAt").asText());
    assertEquals("Completed by configuration", persisted.get("description").asText());
  }
}
