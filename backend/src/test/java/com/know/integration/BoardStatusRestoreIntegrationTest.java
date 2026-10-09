package com.know.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.web.server.LocalServerPort;

/** Restoring a status clears its archived state without changing identity or position. */
class BoardStatusRestoreIntegrationTest extends IntegrationTestSupport {
  @LocalServerPort int port;
  ApiClient api;

  @BeforeEach
  void setUp() {
    api = new ApiClient(port);
  }

  @Test
  void restoredStatusPersistsItsActiveStateIdentityAndPosition() {
    String owner = api.register();
    String boardId =
        api.created("POST", "/api/v1/boards", owner, "{\"name\":\"Work\"}")
            .get("id")
            .asText();
    String statusId =
        api.created("POST", "/api/v1/boards/" + boardId + "/statuses", owner, "{\"name\":\"Later\"}")
            .get("id")
            .asText();
    assertEquals(
        200,
        api.post("/api/v1/boards/" + boardId + "/statuses/" + statusId + "/archive", owner, null)
            .status());

    ApiClient.Reply restored =
        api.post("/api/v1/boards/" + boardId + "/statuses/" + statusId + "/restore", owner, null);
    assertEquals(200, restored.status());
    JsonNode response = restored.json();
    assertEquals(statusId, response.get("id").asText());
    assertEquals(boardId, response.get("boardId").asText());
    assertEquals("Later", response.get("name").asText());
    assertEquals(4, response.get("position").asInt());
    assertFalse(response.get("archived").asBoolean());

    JsonNode persisted = api.get("/api/v1/boards/" + boardId + "/statuses", owner).json();
    assertTrue(persisted.findValuesAsText("id").contains(statusId));
    assertEquals(statusId, persisted.get(4).get("id").asText());
    assertFalse(persisted.get(4).get("archived").asBoolean());
  }
}
