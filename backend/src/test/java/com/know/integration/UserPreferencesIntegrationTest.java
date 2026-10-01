package com.know.integration;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

/** Server-stored user preferences (docs/user-preferences-acceptance-checklist.md). */
class UserPreferencesIntegrationTest extends IntegrationTestSupport {
  @LocalServerPort int port;
  @Autowired TestRestTemplate rest;
  String base;

  @BeforeEach
  void setUp() {
    base = "http://localhost:" + port;
  }

  String token() {
    String body = "{\"email\":\"" + UUID.randomUUID() + "@test.example\",\"password\":\"SecurePassword123!\"}";
    ResponseEntity<JsonNode> res = exchange(HttpMethod.POST, "/api/v1/auth/register", null, body);
    assertEquals(HttpStatus.OK, res.getStatusCode());
    return res.getBody().get("token").asText();
  }

  ResponseEntity<JsonNode> exchange(HttpMethod method, String path, String token, String body) {
    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    if (token != null) headers.setBearerAuth(token);
    return rest.exchange(base + path, method, new HttpEntity<>(body, headers), JsonNode.class);
  }

  String path(String token, String name) {
    return exchange(HttpMethod.POST, "/api/v1/paths", token, "{\"name\":\"" + name + "\"}").getBody().get("id").asText();
  }

  void entry(String token, String pathId, String startedAt) {
    String body = "{\"pathId\":\"" + pathId + "\",\"labelIds\":[],\"startedAt\":\"" + startedAt + "\",\"endedAt\":\"" + startedAt.replace("T09", "T10") + "\"}";
    assertTrue(exchange(HttpMethod.POST, "/api/v1/time-entries", token, body).getStatusCode().is2xxSuccessful());
  }

  ResponseEntity<JsonNode> preferences(String token) {
    return exchange(HttpMethod.GET, "/api/v1/preferences", token, null);
  }

  ResponseEntity<JsonNode> update(String token, String body) {
    return exchange(HttpMethod.PUT, "/api/v1/preferences", token, body);
  }

  // UP-01
  @Test
  void preferencesDefaultForANewUser() {
    JsonNode body = preferences(token()).getBody();
    assertEquals("auto", body.get("theme").asText());
    assertFalse(body.get("kanbanWide").asBoolean());
    assertFalse(body.get("ganttWide").asBoolean());
    assertEquals(0, body.get("recentPathIds").size());
    assertEquals(HttpStatus.UNAUTHORIZED, preferences(null).getStatusCode());
  }

  // UP-02
  @Test
  void preferencesArePartialUpdatesPerUser() {
    String owner = token(), other = token();
    JsonNode dark = update(owner, "{\"theme\":\"dark\"}").getBody();
    assertEquals("dark", dark.get("theme").asText());
    assertFalse(dark.get("kanbanWide").asBoolean());
    JsonNode wide = update(owner, "{\"kanbanWide\":true}").getBody();
    assertEquals("dark", wide.get("theme").asText(), "Omitted fields keep their value");
    assertTrue(wide.get("kanbanWide").asBoolean());
    JsonNode timelineWide = update(owner, "{\"ganttWide\":true}").getBody();
    assertTrue(timelineWide.get("ganttWide").asBoolean());
    assertTrue(timelineWide.get("kanbanWide").asBoolean(), "The Gantt width update keeps the Kanban width");
    assertFalse(preferences(other).getBody().get("ganttWide").asBoolean());
    assertEquals("dark", preferences(owner).getBody().get("theme").asText());
    assertEquals("auto", preferences(other).getBody().get("theme").asText());
    assertEquals("tokyo-neon", update(owner, "{\"theme\":\"tokyo-neon\"}").getBody().get("theme").asText());
    assertEquals("tokyo-neon", preferences(owner).getBody().get("theme").asText());
  }

  // UP-02
  @Test
  void unknownThemeIsRejected() {
    String token = token();
    assertEquals(HttpStatus.BAD_REQUEST, update(token, "{\"theme\":\"sepia\"}").getStatusCode());
    assertEquals("auto", preferences(token).getBody().get("theme").asText());
  }

  // UP-03
  @Test
  void recentPathsComeFromRecentTimeEntries() {
    String token = token();
    List<String> ids = new ArrayList<>();
    for (int i = 0; i < 7; i++) ids.add(path(token, "Path " + i));
    for (int i = 0; i < 7; i++) entry(token, ids.get(i), "2026-09-0" + (i + 1) + "T09:00:00Z");
    entry(token, ids.get(1), "2026-09-08T09:00:00Z");
    exchange(HttpMethod.DELETE, "/api/v1/paths/" + ids.get(5), token, null);
    List<String> recent = new ArrayList<>();
    preferences(token).getBody().get("recentPathIds").forEach(id -> recent.add(id.asText()));
    assertEquals(List.of(ids.get(1), ids.get(6), ids.get(4), ids.get(3), ids.get(2)), recent);
  }
  // AB-10
  @Test
  void lastCardBoardIsStoredAndValidated() {
    String token = token(), other = token();
    assertTrue(preferences(token).getBody().get("lastCardBoardId").isNull());
    String boardId = exchange(HttpMethod.POST, "/api/v1/boards", token, "{\"name\":\"Work\"}").getBody().get("id").asText();
    String foreign = exchange(HttpMethod.POST, "/api/v1/boards", other, "{\"name\":\"Theirs\"}").getBody().get("id").asText();

    JsonNode saved = update(token, "{\"lastCardBoardId\":\"" + boardId + "\"}").getBody();
    assertEquals(boardId, saved.get("lastCardBoardId").asText());
    assertEquals("auto", saved.get("theme").asText(), "Omitted fields keep their value");
    assertEquals(boardId, update(token, "{\"theme\":\"dark\"}").getBody().get("lastCardBoardId").asText());
    assertEquals(HttpStatus.NOT_FOUND, update(token, "{\"lastCardBoardId\":\"" + foreign + "\"}").getStatusCode());
    assertEquals(boardId, preferences(token).getBody().get("lastCardBoardId").asText());
    assertTrue(preferences(other).getBody().get("lastCardBoardId").isNull());
  }

  // BS-01, BS-02
  @Test
  void boardStateDefaultsAndIsValidated() {
    String token = token(), other = token();
    JsonNode board = preferences(token).getBody().get("board");
    assertTrue(board.get("boardId").isNull(), "No stored board means All boards");
    assertEquals("kanban", board.get("view").asText());
    assertTrue(board.get("ganttFrom").isNull());
    assertTrue(board.get("ganttTo").isNull());
    assertEquals(0, board.get("ganttSorts").size());
    assertEquals("", board.get("search").asText());

    String foreign = exchange(HttpMethod.POST, "/api/v1/boards", other, "{\"name\":\"Theirs\"}").getBody().get("id").asText();
    assertEquals(HttpStatus.NOT_FOUND, update(token, "{\"board\":{\"boardId\":\"" + foreign + "\",\"view\":\"kanban\"}}").getStatusCode());
    assertEquals(HttpStatus.BAD_REQUEST, update(token, "{\"board\":{\"view\":\"list\"}}").getStatusCode());
    assertEquals(HttpStatus.BAD_REQUEST, update(token, "{\"board\":{\"view\":\"gantt\",\"ganttFrom\":\"2026-09-10\",\"ganttTo\":\"2026-09-01\"}}").getStatusCode());
    assertEquals(HttpStatus.BAD_REQUEST, update(token, "{\"board\":{\"view\":\"kanban\",\"search\":\"" + "x".repeat(201) + "\"}}").getStatusCode());
    assertTrue(preferences(token).getBody().get("board").get("boardId").isNull());
  }

  // BS-02
  @Test
  void boardStateIsStoredPerUser() {
    String token = token(), other = token();
    String boardId = exchange(HttpMethod.POST, "/api/v1/boards", token, "{\"name\":\"Work\"}").getBody().get("id").asText();
    String body = "{\"board\":{\"boardId\":\"" + boardId + "\",\"view\":\"gantt\",\"ganttFrom\":\"2026-09-01\",\"ganttTo\":\"2026-09-14\",\"ganttSorts\":[\"PRIORITY\",\"DATE\"],\"search\":\"release\"}}";
    JsonNode saved = update(token, body).getBody().get("board");
    assertEquals(boardId, saved.get("boardId").asText());
    assertEquals("gantt", saved.get("view").asText());
    assertEquals("2026-09-01", saved.get("ganttFrom").asText());
    assertEquals("2026-09-14", saved.get("ganttTo").asText());
    assertEquals("release", saved.get("search").asText());
    assertEquals(List.of("PRIORITY", "DATE"), List.of(saved.get("ganttSorts").get(0).asText(), saved.get("ganttSorts").get(1).asText()));
    assertEquals("release", update(token, "{\"theme\":\"dark\"}").getBody().get("board").get("search").asText(), "Omitted fields keep their value");
    assertTrue(preferences(other).getBody().get("board").get("boardId").isNull());

    JsonNode all = update(token, "{\"board\":{\"boardId\":null,\"view\":\"kanban\",\"search\":\"\"}}").getBody().get("board");
    assertTrue(all.get("boardId").isNull(), "A null board selects All boards");
    assertEquals("kanban", all.get("view").asText());
    assertTrue(all.get("ganttFrom").isNull());
  }
}
