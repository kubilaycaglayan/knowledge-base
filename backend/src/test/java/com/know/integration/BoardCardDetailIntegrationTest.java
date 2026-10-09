package com.know.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.web.server.LocalServerPort;

/** Card detail requires both the board and card to belong to the request owner. */
class BoardCardDetailIntegrationTest extends IntegrationTestSupport {
  @LocalServerPort int port;
  ApiClient api;

  @BeforeEach
  void setUp() {
    api = new ApiClient(port);
  }

  String board(String owner, String name) {
    return api.created("POST", "/api/v1/boards", owner, "{\"name\":\"" + name + "\"}")
        .get("id")
        .asText();
  }

  String card(String owner, String boardId, String title) {
    return api.created(
            "POST",
            "/api/v1/boards/" + boardId + "/cards",
            owner,
            "{\"title\":\"" + title + "\"}")
        .get("id")
        .asText();
  }

  @Test
  void cardDetailReturnsOwnedCardAndHidesMissingOrMisnestedCards() {
    String owner = api.register();
    String other = api.register();
    String firstBoard = board(owner, "First");
    String secondBoard = board(owner, "Second");
    String foreignBoard = board(other, "Foreign");
    String ownedCard = card(owner, firstBoard, "Owned card");
    String otherBoardCard = card(owner, secondBoard, "Other board card");
    String foreignCard = card(other, foreignBoard, "Foreign card");

    ApiClient.Reply detail = api.get("/api/v1/boards/" + firstBoard + "/cards/" + ownedCard, owner);
    assertEquals(200, detail.status());
    JsonNode card = detail.json();
    assertEquals(ownedCard, card.get("id").asText());
    assertEquals(firstBoard, card.get("boardId").asText());
    assertEquals("Owned card", card.get("title").asText());

    assertEquals(
        404,
        api.get("/api/v1/boards/" + firstBoard + "/cards/" + UUID.randomUUID(), owner).status());
    assertEquals(
        404,
        api.get("/api/v1/boards/" + firstBoard + "/cards/" + otherBoardCard, owner).status());
    assertEquals(
        404,
        api.get("/api/v1/boards/" + foreignBoard + "/cards/" + foreignCard, owner).status());
  }
}
