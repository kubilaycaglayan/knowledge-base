package com.know.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.web.server.LocalServerPort;

/** Log label updates replace the assignment set and enforce ownership and LOG scope. */
class LogLabelsIntegrationTest extends IntegrationTestSupport {
  @LocalServerPort int port;
  ApiClient api;

  @BeforeEach
  void setUp() {
    api = new ApiClient(port);
  }

  private String createLabel(String token, String name, String scope) {
    return api.created(
            "POST",
            "/api/v1/labels",
            token,
            "{\"name\":\"" + name + "\",\"scopes\":[\"" + scope + "\"]}")
        .get("id")
        .asText();
  }

  @Test
  void labelUpdatesReplaceAssignmentsAndRejectForeignOrWrongScopeLabels() {
    String owner = api.register();
    String other = api.register();
    JsonNode log =
        api.created(
            "POST",
            "/api/v1/logs",
            owner,
            "{\"body\":\"Labeled thought\",\"occurredAt\":\"2026-09-11T10:15:00Z\"}");
    String logId = log.get("id").asText();
    String keep = createLabel(owner, "Keep", "LOG");
    String remove = createLabel(owner, "Remove", "LOG");
    String wrongScope = createLabel(owner, "Note only", "NOTE");
    String foreign = createLabel(other, "Private", "LOG");

    ApiClient.Reply first =
        api.put("/api/v1/logs/" + logId + "/labels", owner, "{\"labelIds\":[\"" + keep + "\",\"" + remove + "\"]}");
    assertEquals(200, first.status(), first.body());
    assertTrue(first.json().get("labelIds").toString().contains(keep));
    assertTrue(first.json().get("labelIds").toString().contains(remove));

    ApiClient.Reply replacement =
        api.put("/api/v1/logs/" + logId + "/labels", owner, "{\"labelIds\":[\"" + keep + "\"]}");
    assertEquals(200, replacement.status(), replacement.body());
    JsonNode persisted = api.get("/api/v1/logs/" + logId, owner).json().get("labelIds");
    assertEquals(1, persisted.size());
    assertEquals(keep, persisted.get(0).asText());
    assertFalse(persisted.toString().contains(remove));

    assertEquals(
        400,
        api.put(
                "/api/v1/logs/" + logId + "/labels",
                owner,
                "{\"labelIds\":[\"" + wrongScope + "\"]}")
            .status());
    assertEquals(
        400,
        api.put(
                "/api/v1/logs/" + logId + "/labels",
                owner,
                "{\"labelIds\":[\"" + foreign + "\"]}")
            .status());
  }
}
