package com.know.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.web.server.LocalServerPort;

/** Restored cards return to an active status when their previous status is archived. */
class BoardCardRestoreIntegrationTest extends IntegrationTestSupport {
  @LocalServerPort int port;
  ApiClient api;

  @BeforeEach
  void setUp() {
    api = new ApiClient(port);
  }

  @Test
  void restoringCardWithArchivedStatusFallsBackToFirstActiveStatus() {
    String owner = api.register();
    String boardId =
        api.created("POST", "/api/v1/boards", owner, "{\"name\":\"Restore card\"}")
            .get("id")
            .asText();
    JsonNode defaults = api.get("/api/v1/boards/" + boardId + "/statuses", owner).json();
    String fallbackStatusId = defaults.get(0).get("id").asText();
    String oldStatusId =
        api.created(
                "POST",
                "/api/v1/boards/" + boardId + "/statuses",
                owner,
                "{\"name\":\"Later\"}")
            .get("id")
            .asText();
    String cardId =
        api.created(
                "POST",
                "/api/v1/boards/" + boardId + "/cards",
                owner,
                "{\"title\":\"Return me\",\"statusId\":\"" + oldStatusId + "\"}")
            .get("id")
            .asText();

    assertEquals(
        200,
        api.post("/api/v1/boards/" + boardId + "/cards/" + cardId + "/archive", owner, null)
            .status());
    assertEquals(
        200,
        api.post("/api/v1/boards/" + boardId + "/statuses/" + oldStatusId + "/archive", owner, null)
            .status());

    ApiClient.Reply restored =
        api.post("/api/v1/boards/" + boardId + "/cards/" + cardId + "/restore", owner, null);
    assertEquals(200, restored.status());
    JsonNode response = restored.json();
    assertEquals(cardId, response.get("id").asText());
    assertEquals(fallbackStatusId, response.get("statusId").asText());
    assertEquals(0, response.get("position").asInt());
    assertFalse(response.get("archived").asBoolean());

    JsonNode persisted = api.get("/api/v1/boards/" + boardId + "/cards/" + cardId, owner).json();
    assertEquals(fallbackStatusId, persisted.get("statusId").asText());
    assertFalse(persisted.get("archived").asBoolean());
    JsonNode fallbackCards =
        api.get("/api/v1/boards/" + boardId + "/cards?statusId=" + fallbackStatusId, owner)
            .json();
    assertTrue(fallbackCards.findValuesAsText("id").contains(cardId));
  }
}
