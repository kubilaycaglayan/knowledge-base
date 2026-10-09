package com.know.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.web.server.LocalServerPort;

/** Card moves persist target status and positions while rejecting invalid targets. */
class BoardCardMoveIntegrationTest extends IntegrationTestSupport {
  @LocalServerPort int port;
  ApiClient api;

  @BeforeEach
  void setUp() {
    api = new ApiClient(port);
  }

  String card(String owner, String boardId, String statusId, String title) {
    return api.created(
            "POST",
            "/api/v1/boards/" + boardId + "/cards",
            owner,
            "{\"title\":\"" + title + "\",\"statusId\":\"" + statusId + "\"}")
        .get("id")
        .asText();
  }

  @Test
  void cardMovePersistsDestinationPositionAndRejectsForeignOrArchivedStatuses() {
    String owner = api.register();
    String boardId =
        api.created("POST", "/api/v1/boards", owner, "{\"name\":\"Move cards\"}")
            .get("id")
            .asText();
    JsonNode statuses = api.get("/api/v1/boards/" + boardId + "/statuses", owner).json();
    String sourceStatus = statuses.get(0).get("id").asText();
    String destinationStatus = statuses.get(1).get("id").asText();
    card(owner, boardId, destinationStatus, "Existing 1");
    card(owner, boardId, destinationStatus, "Existing 2");
    String movingCard = card(owner, boardId, sourceStatus, "Moving");

    ApiClient.Reply moved =
        api.post(
            "/api/v1/boards/" + boardId + "/cards/" + movingCard + "/move",
            owner,
            "{\"statusId\":\"" + destinationStatus + "\",\"position\":1}");
    assertEquals(200, moved.status());
    assertEquals(destinationStatus, moved.json().get("statusId").asText());
    assertEquals(1, moved.json().get("position").asInt());

    JsonNode destinationCards =
        api.get(
                "/api/v1/boards/" + boardId + "/cards?statusId=" + destinationStatus,
                owner)
            .json();
    List<String> titles = new ArrayList<>();
    destinationCards.forEach(item -> titles.add(item.get("title").asText()));
    assertEquals(List.of("Existing 1", "Moving", "Existing 2"), titles);
    assertEquals(List.of(0, 1, 2), List.of(
        destinationCards.get(0).get("position").asInt(),
        destinationCards.get(1).get("position").asInt(),
        destinationCards.get(2).get("position").asInt()));

    String foreignBoard =
        api.created("POST", "/api/v1/boards", owner, "{\"name\":\"Another\"}")
            .get("id")
            .asText();
    String foreignStatus =
        api.get("/api/v1/boards/" + foreignBoard + "/statuses", owner)
            .json()
            .get(0)
            .get("id")
            .asText();
    assertEquals(
        404,
        api.post(
                "/api/v1/boards/" + boardId + "/cards/" + movingCard + "/move",
                owner,
                "{\"statusId\":\"" + foreignStatus + "\",\"position\":0}")
            .status());

    String archivedStatus =
        api.created(
                "POST",
                "/api/v1/boards/" + boardId + "/statuses",
                owner,
                "{\"name\":\"Archived target\"}")
            .get("id")
            .asText();
    assertEquals(
        200,
        api.post(
                "/api/v1/boards/" + boardId + "/statuses/" + archivedStatus + "/archive",
                owner,
                null)
            .status());
    assertEquals(
        409,
        api.post(
                "/api/v1/boards/" + boardId + "/cards/" + movingCard + "/move",
                owner,
                "{\"statusId\":\"" + archivedStatus + "\",\"position\":0}")
            .status());
  }
}
