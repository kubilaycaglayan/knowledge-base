package com.know.integration;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/** Server-stored user preferences (docs/user-preferences-acceptance-checklist.md). */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class UserPreferencesIntegrationTest {
  @DynamicPropertySource
  static void configureDataSource(DynamicPropertyRegistry registry) {
    registry.add(
        "spring.datasource.url",
        () ->
            "jdbc:h2:mem:know_user_preferences;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1");
    registry.add("spring.datasource.driver-class-name", () -> "org.h2.Driver");
    registry.add("spring.datasource.username", () -> "sa");
    registry.add("spring.datasource.password", () -> "");
    registry.add("spring.jpa.hibernate.ddl-auto", () -> "create-drop");
    registry.add("spring.flyway.enabled", () -> "false");
    registry.add("app.jwt-secret", () -> "integration-test-secret-with-enough-chars-123");
    registry.add("app.cors-origins", () -> "http://localhost");
    registry.add("app.google-client-id", () -> "");
  }

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
    assertEquals("dark", preferences(owner).getBody().get("theme").asText());
    assertEquals("auto", preferences(other).getBody().get("theme").asText());
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
}
