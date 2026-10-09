package com.know.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.web.server.LocalServerPort;

/** Board detail reads return owned records and hide missing or foreign IDs. */
class BoardDetailIntegrationTest extends IntegrationTestSupport {
  @LocalServerPort int port;
  ApiClient api;

  @BeforeEach
  void setUp() {
    api = new ApiClient(port);
  }

  @Test
  void boardDetailReturnsOwnedBoardAndHidesMissingAndForeignBoards() {
    String owner = api.register();
    String other = api.register();
    String boardId =
        api.created("POST", "/api/v1/boards", owner, "{\"name\":\"Owned board\"}")
            .get("id")
            .asText();
    String foreignBoardId =
        api.created("POST", "/api/v1/boards", other, "{\"name\":\"Foreign board\"}")
            .get("id")
            .asText();

    ApiClient.Reply owned = api.get("/api/v1/boards/" + boardId, owner);
    assertEquals(200, owned.status());
    JsonNode board = owned.json();
    assertEquals(boardId, board.get("id").asText());
    assertEquals("Owned board", board.get("name").asText());
    assertFalse(board.get("archived").asBoolean());

    assertEquals(404, api.get("/api/v1/boards/" + UUID.randomUUID(), owner).status());
    assertEquals(404, api.get("/api/v1/boards/" + foreignBoardId, owner).status());
  }
}
