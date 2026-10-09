package com.know.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.web.server.LocalServerPort;

/** New board statuses are appended and remain scoped to their board. */
class BoardStatusCreateIntegrationTest extends IntegrationTestSupport {
  @LocalServerPort int port;
  ApiClient api;

  @BeforeEach
  void setUp() {
    api = new ApiClient(port);
  }

  @Test
  void creatingStatusAppendsItAfterDefaultsAndPersistsItsBoardOwnership() {
    String owner = api.register();
    String other = api.register();
    String boardId =
        api.created("POST", "/api/v1/boards", owner, "{\"name\":\"Work\"}")
            .get("id")
            .asText();

    ApiClient.Reply created =
        api.post("/api/v1/boards/" + boardId + "/statuses", owner, "{\"name\":\"Review\"}");
    assertEquals(201, created.status());
    JsonNode status = created.json();
    assertEquals("Review", status.get("name").asText());
    assertEquals(boardId, status.get("boardId").asText());
    assertEquals(4, status.get("position").asInt());

    JsonNode statuses = api.get("/api/v1/boards/" + boardId + "/statuses", owner).json();
    assertEquals(5, statuses.size());
    assertEquals(status.get("id").asText(), statuses.get(4).get("id").asText());
    assertEquals("Review", statuses.get(4).get("name").asText());
    assertEquals(boardId, statuses.get(4).get("boardId").asText());

    String foreignBoardId =
        api.created("POST", "/api/v1/boards", other, "{\"name\":\"Foreign\"}")
            .get("id")
            .asText();
    assertEquals(
        404,
        api.post("/api/v1/boards/" + foreignBoardId + "/statuses", owner, "{\"name\":\"Nope\"}")
            .status());
  }
}
