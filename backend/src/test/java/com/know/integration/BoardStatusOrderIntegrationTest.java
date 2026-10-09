package com.know.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.web.server.LocalServerPort;

/** Status reordering requires every board-owned status exactly once. */
class BoardStatusOrderIntegrationTest extends IntegrationTestSupport {
  @LocalServerPort int port;
  ApiClient api;

  @BeforeEach
  void setUp() {
    api = new ApiClient(port);
  }

  List<String> ids(JsonNode statuses) {
    List<String> result = new ArrayList<>();
    statuses.forEach(status -> result.add(status.get("id").asText()));
    return result;
  }

  String orderBody(List<String> ids) {
    return "{\"ids\":[\"" + String.join("\",\"", ids) + "\"]}";
  }

  @Test
  void statusOrderPersistsCompleteOrderAndRejectsDuplicateMissingAndForeignIds() {
    String owner = api.register();
    String boardId =
        api.created("POST", "/api/v1/boards", owner, "{\"name\":\"Ordered\"}")
            .get("id")
            .asText();
    String foreignBoardId =
        api.created("POST", "/api/v1/boards", owner, "{\"name\":\"Other\"}")
            .get("id")
            .asText();
    List<String> original = ids(api.get("/api/v1/boards/" + boardId + "/statuses", owner).json());
    String foreignStatus =
        api.get("/api/v1/boards/" + foreignBoardId + "/statuses", owner)
            .json()
            .get(0)
            .get("id")
            .asText();
    List<String> reversed = new ArrayList<>(original);
    java.util.Collections.reverse(reversed);

    ApiClient.Reply reordered =
        api.put("/api/v1/boards/" + boardId + "/statuses/order", owner, orderBody(reversed));
    assertEquals(200, reordered.status());
    assertEquals(reversed, ids(reordered.json()));
    assertEquals(reversed, ids(api.get("/api/v1/boards/" + boardId + "/statuses", owner).json()));

    assertEquals(
        400,
        api.put(
                "/api/v1/boards/" + boardId + "/statuses/order",
                owner,
                orderBody(List.of(reversed.get(0), reversed.get(0), reversed.get(2), reversed.get(3))))
            .status());
    assertEquals(
        400,
        api.put(
                "/api/v1/boards/" + boardId + "/statuses/order",
                owner,
                orderBody(reversed.subList(0, 3)))
            .status());
    List<String> foreignOrder = new ArrayList<>(reversed);
    foreignOrder.set(0, foreignStatus);
    assertEquals(
        400,
        api.put("/api/v1/boards/" + boardId + "/statuses/order", owner, orderBody(foreignOrder))
            .status());
    assertEquals(reversed, ids(api.get("/api/v1/boards/" + boardId + "/statuses", owner).json()));
  }
}
