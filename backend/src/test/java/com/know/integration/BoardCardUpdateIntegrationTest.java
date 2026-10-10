package com.know.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.web.server.LocalServerPort;

/** Card edits persist scalar fields and owned path/label references. */
class BoardCardUpdateIntegrationTest extends IntegrationTestSupport {
  @LocalServerPort int port;
  ApiClient api;

  @BeforeEach
  void setUp() {
    api = new ApiClient(port);
  }

  @Test
  void cardUpdatePersistsFieldsAndOwnedReferences() {
    String owner = api.register();
    String boardId =
        api.created("POST", "/api/v1/boards", owner, "{\"name\":\"Work\"}")
            .get("id")
            .asText();
    JsonNode statuses = api.get("/api/v1/boards/" + boardId + "/statuses", owner).json();
    String statusId = statuses.get(0).get("id").asText();
    String pathId =
        api.created("POST", "/api/v1/paths", owner, "{\"name\":\"Project\"}")
            .get("id")
            .asText();
    String labelId =
        api.created(
                "POST",
                "/api/v1/labels",
                owner,
                "{\"name\":\"Board label\",\"scopes\":[\"BOARD\"]}")
            .get("id")
            .asText();
    String cardId =
        api.created(
                "POST",
                "/api/v1/boards/" + boardId + "/cards",
                owner,
                "{\"title\":\"Before\",\"statusId\":\"" + statusId + "\"}")
            .get("id")
            .asText();

    ApiClient.Reply updated =
        api.put(
            "/api/v1/boards/" + boardId + "/cards/" + cardId,
            owner,
            "{\"title\":\"After\",\"body\":\"Updated body\",\"priority\":\"HIGH\","
                + "\"startDate\":\"2026-04-01\",\"dueDate\":\"2026-04-10\","
                + "\"pathIds\":[\"" + pathId + "\"],\"labelIds\":[\"" + labelId + "\"]}");
    assertEquals(200, updated.status());
    JsonNode response = updated.json();
    assertEquals(cardId, response.get("id").asText());
    assertEquals("After", response.get("title").asText());
    assertEquals("Updated body", response.get("body").asText());
    assertEquals("HIGH", response.get("priority").asText());
    assertEquals("2026-04-01", response.get("startDate").asText());
    assertEquals("2026-04-10", response.get("dueDate").asText());
    assertEquals(pathId, response.get("pathIds").get(0).asText());
    assertEquals(labelId, response.get("labelIds").get(0).asText());

    JsonNode persisted = api.get("/api/v1/boards/" + boardId + "/cards/" + cardId, owner).json();
    assertEquals("After", persisted.get("title").asText());
    assertEquals("Updated body", persisted.get("body").asText());
    assertEquals(pathId, persisted.get("pathIds").get(0).asText());
    assertEquals(labelId, persisted.get("labelIds").get(0).asText());
  }

  @Test
  void cardCreateAndInColumnAcceptEveryDeclaredPriority() {
    String owner = api.register();
    String boardId =
        api.created("POST", "/api/v1/boards", owner, "{\"name\":\"Priorities\"}")
            .get("id")
            .asText();

    for (String priority : java.util.List.of("LOW", "MEDIUM", "HIGH", "URGENT")) {
      JsonNode created =
          api.created(
              "POST",
              "/api/v1/boards/" + boardId + "/cards",
              owner,
              "{\"title\":\"" + priority + "\",\"priority\":\"" + priority + "\"}");
      assertEquals(priority, created.get("priority").asText());
      JsonNode persisted =
          api.get("/api/v1/boards/" + boardId + "/cards/" + created.get("id").asText(), owner)
              .json();
      assertEquals(priority, persisted.get("priority").asText());

      JsonNode placed =
          api.created(
              "POST",
              "/api/v1/boards/" + boardId + "/cards/in-column",
              owner,
              "{\"columnName\":\"Review\",\"title\":\"In-column "
                  + priority
                  + "\",\"priority\":\""
                  + priority
                  + "\"}");
      assertEquals(priority, placed.get("card").get("priority").asText());
      JsonNode placedReadback =
          api.get(
                  "/api/v1/boards/"
                      + boardId
                      + "/cards/"
                      + placed.get("card").get("id").asText(),
                  owner)
              .json();
      assertEquals(priority, placedReadback.get("priority").asText());
    }
  }

  @Test
  void cardPriorityDefaultsToMediumWhenOmittedOrNullAcrossWriteRoutes() {
    String owner = api.register();
    String boardId =
        api.created("POST", "/api/v1/boards", owner, "{\"name\":\"Priority defaults\"}")
            .get("id")
            .asText();

    JsonNode created =
        api.created(
            "POST", "/api/v1/boards/" + boardId + "/cards", owner, "{\"title\":\"Omitted\"}");
    assertEquals("MEDIUM", created.get("priority").asText());
    assertEquals(
        "MEDIUM",
        api.get("/api/v1/boards/" + boardId + "/cards/" + created.get("id").asText(), owner)
            .json()
            .get("priority")
            .asText());

    String updateId =
        api.created(
                "POST",
                "/api/v1/boards/" + boardId + "/cards",
                owner,
                "{\"title\":\"Reset from high\",\"priority\":\"HIGH\"}")
            .get("id")
            .asText();
    JsonNode updated =
        api.put(
                "/api/v1/boards/" + boardId + "/cards/" + updateId,
                owner,
                "{\"title\":\"Explicit null\",\"priority\":null}")
            .json();
    assertEquals("MEDIUM", updated.get("priority").asText());
    assertEquals(
        "MEDIUM",
        api.get("/api/v1/boards/" + boardId + "/cards/" + updateId, owner)
            .json()
            .get("priority")
            .asText());

    JsonNode placed =
        api.created(
            "POST",
            "/api/v1/boards/" + boardId + "/cards/in-column",
            owner,
            "{\"columnName\":\"Review\",\"title\":\"Explicit null\",\"priority\":null}");
    assertEquals("MEDIUM", placed.get("card").get("priority").asText());
    assertEquals(
        "MEDIUM",
        api.get(
                "/api/v1/boards/" + boardId + "/cards/" + placed.get("card").get("id").asText(),
                owner)
            .json()
            .get("priority")
            .asText());
  }
}
