package com.know.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.web.server.LocalServerPort;

/** Archiving a status preserves its cards and every board keeps an active status. */
class BoardStatusArchiveIntegrationTest extends IntegrationTestSupport {
  @LocalServerPort int port;
  ApiClient api;

  @BeforeEach
  void setUp() {
    api = new ApiClient(port);
  }

  @Test
  void archivingStatusMovesCardsAfterExistingDestinationCards() {
    String owner = api.register();
    String boardId =
        api.created("POST", "/api/v1/boards", owner, "{\"name\":\"Work\"}")
            .get("id")
            .asText();
    JsonNode defaults = api.get("/api/v1/boards/" + boardId + "/statuses", owner).json();
    String destinationId = defaults.get(0).get("id").asText();
    String sourceStatusId =
        api.created("POST", "/api/v1/boards/" + boardId + "/statuses", owner, "{\"name\":\"Later\"}")
            .get("id")
            .asText();
    api.created(
        "POST",
        "/api/v1/boards/" + boardId + "/cards",
        owner,
        "{\"title\":\"Existing\",\"statusId\":\"" + destinationId + "\"}");
    api.created(
        "POST",
        "/api/v1/boards/" + boardId + "/cards",
        owner,
        "{\"title\":\"Moved 1\",\"statusId\":\"" + sourceStatusId + "\"}");
    api.created(
        "POST",
        "/api/v1/boards/" + boardId + "/cards",
        owner,
        "{\"title\":\"Moved 2\",\"statusId\":\"" + sourceStatusId + "\"}");

    ApiClient.Reply archived =
        api.post("/api/v1/boards/" + boardId + "/statuses/" + sourceStatusId + "/archive", owner, null);
    assertEquals(200, archived.status());
    JsonNode statuses = api.get("/api/v1/boards/" + boardId + "/statuses", owner).json();
    assertTrue(statuses.findValuesAsText("id").contains(sourceStatusId));
    assertEquals(sourceStatusId, statuses.get(4).get("id").asText());
    assertTrue(statuses.get(4).get("archived").asBoolean());

    JsonNode destinationCards =
        api.get(
                "/api/v1/boards/" + boardId + "/cards?statusId=" + destinationId,
                owner)
            .json();
    List<String> titles = new ArrayList<>();
    destinationCards.forEach(card -> titles.add(card.get("title").asText()));
    assertEquals(List.of("Existing", "Moved 1", "Moved 2"), titles);
    assertEquals(destinationId, destinationCards.get(1).get("statusId").asText());
    assertEquals(1, destinationCards.get(1).get("position").asInt());
    assertEquals(2, destinationCards.get(2).get("position").asInt());
  }

  @Test
  void archivingFinalActiveStatusConflicts() {
    String owner = api.register();
    String boardId =
        api.created("POST", "/api/v1/boards", owner, "{\"name\":\"Keep one\"}")
            .get("id")
            .asText();
    JsonNode statuses = api.get("/api/v1/boards/" + boardId + "/statuses", owner).json();
    List<String> statusIds = new ArrayList<>();
    statuses.forEach(status -> statusIds.add(status.get("id").asText()));
    for (int i = 1; i < statusIds.size(); i++) {
      assertEquals(
          200,
          api.post("/api/v1/boards/" + boardId + "/statuses/" + statusIds.get(i) + "/archive", owner, null)
              .status());
    }
    assertEquals(
        409,
        api.post("/api/v1/boards/" + boardId + "/statuses/" + statusIds.get(0) + "/archive", owner, null)
            .status());
  }
}
