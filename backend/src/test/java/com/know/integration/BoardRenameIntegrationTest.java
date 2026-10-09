package com.know.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.web.server.LocalServerPort;

/** Custom boards can be renamed; path board names remain owned by their paths. */
class BoardRenameIntegrationTest extends IntegrationTestSupport {
  @LocalServerPort int port;
  ApiClient api;

  @BeforeEach
  void setUp() {
    api = new ApiClient(port);
  }

  @Test
  void customBoardRenamePersistsAndPathBoardRenameConflicts() {
    String owner = api.register();
    String customBoardId =
        api.created("POST", "/api/v1/boards", owner, "{\"name\":\"Before\"}")
            .get("id")
            .asText();

    ApiClient.Reply renamed =
        api.put("/api/v1/boards/" + customBoardId, owner, "{\"name\":\"  After  \"}");
    assertEquals(200, renamed.status());
    assertEquals("After", renamed.json().get("name").asText());
    JsonNode persisted = api.get("/api/v1/boards/" + customBoardId, owner).json();
    assertEquals(customBoardId, persisted.get("id").asText());
    assertEquals("After", persisted.get("name").asText());

    JsonNode path = api.created("POST", "/api/v1/paths", owner, "{\"name\":\"Path name\"}");
    String pathBoardId = path.get("boardId").asText();
    ApiClient.Reply pathRename =
        api.put("/api/v1/boards/" + pathBoardId, owner, "{\"name\":\"Changed path\"}");
    assertEquals(409, pathRename.status());
    assertEquals("Path name", api.get("/api/v1/boards/" + pathBoardId, owner).json().get("name").asText());
  }
}
