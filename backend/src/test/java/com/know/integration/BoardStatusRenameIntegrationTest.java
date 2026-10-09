package com.know.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.web.server.LocalServerPort;

/** Status renames persist without changing identity or position and remain nested-owned. */
class BoardStatusRenameIntegrationTest extends IntegrationTestSupport {
  @LocalServerPort int port;
  ApiClient api;

  @BeforeEach
  void setUp() {
    api = new ApiClient(port);
  }

  @Test
  void statusRenamePersistsAndRejectsAStatusFromAnotherBoard() {
    String owner = api.register();
    String firstBoard =
        api.created("POST", "/api/v1/boards", owner, "{\"name\":\"First\"}")
            .get("id")
            .asText();
    String secondBoard =
        api.created("POST", "/api/v1/boards", owner, "{\"name\":\"Second\"}")
            .get("id")
            .asText();
    JsonNode firstStatuses = api.get("/api/v1/boards/" + firstBoard + "/statuses", owner).json();
    JsonNode secondStatuses = api.get("/api/v1/boards/" + secondBoard + "/statuses", owner).json();
    String statusId = firstStatuses.get(0).get("id").asText();
    String foreignStatusId = secondStatuses.get(0).get("id").asText();

    ApiClient.Reply renamed =
        api.put(
            "/api/v1/boards/" + firstBoard + "/statuses/" + statusId,
            owner,
            "{\"name\":\"Intake\"}");
    assertEquals(200, renamed.status());
    assertEquals(statusId, renamed.json().get("id").asText());
    assertEquals("Intake", renamed.json().get("name").asText());
    assertEquals(0, renamed.json().get("position").asInt());

    JsonNode persisted = api.get("/api/v1/boards/" + firstBoard + "/statuses", owner).json();
    assertEquals(statusId, persisted.get(0).get("id").asText());
    assertEquals("Intake", persisted.get(0).get("name").asText());
    assertEquals(
        404,
        api.put(
                "/api/v1/boards/" + firstBoard + "/statuses/" + foreignStatusId,
                owner,
                "{\"name\":\"Wrong board\"}")
            .status());
  }
}
