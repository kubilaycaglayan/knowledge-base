package com.know.integration;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.web.server.LocalServerPort;

/** Board lists separate active, archived, hidden, and foreign-owner boards. */
class BoardListIntegrationTest extends IntegrationTestSupport {
  @LocalServerPort int port;
  ApiClient api;

  @BeforeEach
  void setUp() {
    api = new ApiClient(port);
  }

  @Test
  void boardListDefaultsToVisibleActiveAndSupportsArchivedAndHiddenLists() {
    String owner = api.register();
    String other = api.register();
    String active =
        api.created("POST", "/api/v1/boards", owner, "{\"name\":\"Visible board\"}")
            .get("id")
            .asText();
    JsonNode path = api.created("POST", "/api/v1/paths", owner, "{\"name\":\"Hidden path\"}");
    String hidden = path.get("boardId").asText();
    String archived =
        api.created("POST", "/api/v1/boards", owner, "{\"name\":\"Archived board\"}")
            .get("id")
            .asText();
    String foreign =
        api.created("POST", "/api/v1/boards", other, "{\"name\":\"Foreign board\"}")
            .get("id")
            .asText();

    assertEquals(
        200,
        api.post("/api/v1/boards/" + hidden + "/visibility", owner, "{\"hidden\":true}")
            .status());
    assertEquals(200, api.post("/api/v1/boards/" + archived + "/archive", owner, "{}").status());

    List<String> visibleActiveIds = api.get("/api/v1/boards", owner).json().findValuesAsText("id");
    assertTrue(visibleActiveIds.contains(active));
    assertFalse(visibleActiveIds.contains(hidden));
    assertFalse(visibleActiveIds.contains(archived));
    assertFalse(visibleActiveIds.contains(foreign));

    List<String> activeIncludingHidden =
        api.get("/api/v1/boards?includeHidden=true", owner).json().findValuesAsText("id");
    assertTrue(activeIncludingHidden.contains(active));
    assertTrue(activeIncludingHidden.contains(hidden));
    assertFalse(activeIncludingHidden.contains(archived));
    assertFalse(activeIncludingHidden.contains(foreign));

    List<String> archivedIds = api.get("/api/v1/boards?archived=true", owner).json().findValuesAsText("id");
    assertTrue(archivedIds.contains(archived));
    assertFalse(archivedIds.contains(active));
    assertFalse(archivedIds.contains(hidden));
    assertFalse(archivedIds.contains(foreign));
  }
}
