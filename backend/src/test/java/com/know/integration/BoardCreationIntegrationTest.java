package com.know.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.web.server.LocalServerPort;

/** Custom board creation persists the board and its ordered default statuses. */
class BoardCreationIntegrationTest extends IntegrationTestSupport {
  @LocalServerPort int port;
  ApiClient api;

  @BeforeEach
  void setUp() {
    api = new ApiClient(port);
  }

  @Test
  void creatingCustomBoardReturnsAndPersistsBoardWithDefaultStatuses() {
    String owner = api.register();

    JsonNode created = api.created("POST", "/api/v1/boards", owner, "{\"name\":\"  Product  \"}");
    String boardId = created.get("id").asText();

    assertEquals("Product", created.get("name").asText());
    assertFalse(created.get("archived").asBoolean());
    assertFalse(created.get("hidden").asBoolean());
    assertFalse(created.get("pinned").asBoolean());
    assertNotNull(created.get("createdAt").asText());

    JsonNode persisted = api.get("/api/v1/boards/" + boardId, owner).json();
    assertEquals(boardId, persisted.get("id").asText());
    assertEquals("Product", persisted.get("name").asText());

    JsonNode statuses = api.get("/api/v1/boards/" + boardId + "/statuses", owner).json();
    List<String> names = new ArrayList<>();
    for (JsonNode status : statuses) {
      names.add(status.get("name").asText());
      assertEquals(boardId, status.get("boardId").asText());
      assertFalse(status.get("archived").asBoolean());
      assertEquals(names.size() - 1, status.get("position").asInt());
    }
    assertEquals(List.of("Backlog", "Pending", "In Progress", "Done"), names);
  }
}
