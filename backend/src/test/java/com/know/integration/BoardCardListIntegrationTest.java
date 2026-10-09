package com.know.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.web.server.LocalServerPort;

/** Board card lists filter by status and archive state while enforcing ownership. */
class BoardCardListIntegrationTest extends IntegrationTestSupport {
  @LocalServerPort int port;
  ApiClient api;

  @BeforeEach
  void setUp() {
    api = new ApiClient(port);
  }

  List<String> titles(JsonNode cards) {
    List<String> result = new ArrayList<>();
    cards.forEach(card -> result.add(card.get("title").asText()));
    return result;
  }

  @Test
  void cardListDefaultsFiltersStatusesAndListsArchivedCardsForOwner() {
    String owner = api.register();
    String other = api.register();
    String boardId =
        api.created("POST", "/api/v1/boards", owner, "{\"name\":\"Cards\"}")
            .get("id")
            .asText();
    JsonNode statuses = api.get("/api/v1/boards/" + boardId + "/statuses", owner).json();
    String backlogId = statuses.get(0).get("id").asText();
    String doneId = statuses.get(3).get("id").asText();
    String backlogCard = createCard(owner, boardId, backlogId, "Backlog card");
    String doneCard = createCard(owner, boardId, doneId, "Done card");
    String archivedCard = createCard(owner, boardId, backlogId, "Archived card");
    api.post("/api/v1/boards/" + boardId + "/cards/" + archivedCard + "/archive", owner, null);

    JsonNode active = api.get("/api/v1/boards/" + boardId + "/cards", owner).json();
    assertEquals(Set.of("Backlog card", "Done card"), new HashSet<>(titles(active)));
    assertEquals(2, active.size());
    assertFalse(active.findValuesAsText("id").contains(archivedCard));

    JsonNode backlog =
        api.get("/api/v1/boards/" + boardId + "/cards?statusId=" + backlogId, owner).json();
    assertEquals(List.of("Backlog card"), titles(backlog));
    JsonNode archived =
        api.get("/api/v1/boards/" + boardId + "/cards?archived=true", owner).json();
    assertEquals(List.of("Archived card"), titles(archived));
    assertTrue(archived.get(0).get("archived").asBoolean());
    assertTrue(active.findValuesAsText("id").contains(backlogCard));
    assertTrue(active.findValuesAsText("id").contains(doneCard));

    String foreignBoardId =
        api.created("POST", "/api/v1/boards", other, "{\"name\":\"Foreign\"}")
            .get("id")
            .asText();
    assertEquals(404, api.get("/api/v1/boards/" + foreignBoardId + "/cards", owner).status());
  }

  private String createCard(String owner, String boardId, String statusId, String title) {
    return api.created(
            "POST",
            "/api/v1/boards/" + boardId + "/cards",
            owner,
            "{\"title\":\"" + title + "\",\"statusId\":\"" + statusId + "\"}")
        .get("id")
        .asText();
  }
}
