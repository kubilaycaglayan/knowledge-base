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

/** Sorting a status column by priority (docs/board-column-sort-acceptance-checklist.md). */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class BoardColumnSortIntegrationTest {
  @DynamicPropertySource
  static void configureDataSource(DynamicPropertyRegistry registry) {
    registry.add(
        "spring.datasource.url",
        () ->
            "jdbc:h2:mem:know_column_sort;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1");
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

  String board(String token) {
    return exchange(HttpMethod.POST, "/api/v1/boards", token, "{\"name\":\"Sorted\"}").getBody().get("id").asText();
  }

  JsonNode firstStatus(String token, String boardId) {
    return exchange(HttpMethod.GET, "/api/v1/boards/" + boardId + "/statuses", token, null).getBody().get(0);
  }

  void card(String token, String boardId, String statusId, String title, String priority) {
    String body = "{\"title\":\"" + title + "\",\"priority\":\"" + priority + "\",\"statusId\":\"" + statusId + "\"}";
    assertEquals(HttpStatus.CREATED, exchange(HttpMethod.POST, "/api/v1/boards/" + boardId + "/cards", token, body).getStatusCode());
  }

  ResponseEntity<JsonNode> sort(String token, String boardId, String statusId, String cardSort) {
    return exchange(HttpMethod.PUT, "/api/v1/boards/" + boardId + "/statuses/" + statusId + "/sort", token, "{\"cardSort\":\"" + cardSort + "\"}");
  }

  List<String> titles(JsonNode items) {
    List<String> result = new ArrayList<>();
    items.forEach(item -> result.add(item.get("title").asText()));
    return result;
  }

  // CS-01
  @Test
  void statusesDefaultToManualSort() {
    String token = token();
    String boardId = board(token);
    exchange(HttpMethod.GET, "/api/v1/boards/" + boardId + "/statuses", token, null).getBody()
        .forEach(status -> assertEquals("MANUAL", status.get("cardSort").asText()));
  }

  // CS-02
  @Test
  void statusSortCanBeSetAndCleared() {
    String token = token();
    String boardId = board(token);
    String statusId = firstStatus(token, boardId).get("id").asText();

    ResponseEntity<JsonNode> sorted = sort(token, boardId, statusId, "PRIORITY");
    assertEquals(HttpStatus.OK, sorted.getStatusCode());
    assertEquals("PRIORITY", sorted.getBody().get("cardSort").asText());
    assertEquals("PRIORITY", firstStatus(token, boardId).get("cardSort").asText());

    assertEquals("MANUAL", sort(token, boardId, statusId, "MANUAL").getBody().get("cardSort").asText());
    assertEquals("MANUAL", firstStatus(token, boardId).get("cardSort").asText());
  }

  // CS-02
  @Test
  void statusSortRejectsUnknownValuesAndForeignBoards() {
    String owner = token();
    String boardId = board(owner);
    String statusId = firstStatus(owner, boardId).get("id").asText();

    assertEquals(HttpStatus.BAD_REQUEST, sort(owner, boardId, statusId, "TITLE").getStatusCode());
    assertEquals(HttpStatus.NOT_FOUND, sort(token(), boardId, statusId, "PRIORITY").getStatusCode());
    assertEquals("MANUAL", firstStatus(owner, boardId).get("cardSort").asText());

    exchange(HttpMethod.POST, "/api/v1/boards/" + boardId + "/archive", owner, null);
    assertEquals(HttpStatus.CONFLICT, sort(owner, boardId, statusId, "PRIORITY").getStatusCode());
  }

  // CS-03
  @Test
  void priorityPagesOrderByPriorityThenPosition() {
    String token = token();
    String boardId = board(token);
    String statusId = firstStatus(token, boardId).get("id").asText();
    card(token, boardId, statusId, "low", "LOW");
    card(token, boardId, statusId, "high-1", "HIGH");
    card(token, boardId, statusId, "medium", "MEDIUM");
    card(token, boardId, statusId, "urgent", "URGENT");
    card(token, boardId, statusId, "high-2", "HIGH");
    String page = "/api/v1/boards/" + boardId + "/cards/page?statusId=" + statusId + "&cursor=-1&limit=20";

    assertEquals(List.of("low", "high-1", "medium", "urgent", "high-2"), titles(exchange(HttpMethod.GET, page, token, null).getBody().get("items")));
    sort(token, boardId, statusId, "PRIORITY");
    assertEquals(List.of("urgent", "high-1", "high-2", "medium", "low"), titles(exchange(HttpMethod.GET, page, token, null).getBody().get("items")));
  }

  // CS-03
  @Test
  void priorityPagesWalkEveryCardOnce() {
    String token = token();
    String boardId = board(token);
    String statusId = firstStatus(token, boardId).get("id").asText();
    String[] priorities = {"LOW", "MEDIUM", "HIGH", "URGENT"};
    for (int i = 0; i < 9; i++) card(token, boardId, statusId, "card-" + i, priorities[i % 4]);
    sort(token, boardId, statusId, "PRIORITY");

    List<String> walked = new ArrayList<>();
    String cursor = "-1";
    int pages = 0;
    while (cursor != null && pages++ < 10) {
      JsonNode body = exchange(HttpMethod.GET, "/api/v1/boards/" + boardId + "/cards/page?statusId=" + statusId + "&cursor=" + cursor + "&limit=4", token, null).getBody();
      walked.addAll(titles(body.get("items")));
      cursor = body.get("nextCursor").isNull() ? null : body.get("nextCursor").asText();
    }
    assertEquals(List.of("card-3", "card-7", "card-2", "card-6", "card-1", "card-5", "card-0", "card-4", "card-8"), walked);
  }
  // AB-09
  @Test
  void priorityLastPagesOrderLowFirst() {
    String token = token();
    String boardId = board(token);
    String statusId = firstStatus(token, boardId).get("id").asText();
    card(token, boardId, statusId, "urgent", "URGENT");
    card(token, boardId, statusId, "low-1", "LOW");
    card(token, boardId, statusId, "high", "HIGH");
    card(token, boardId, statusId, "low-2", "LOW");
    assertEquals("PRIORITY_LAST", sort(token, boardId, statusId, "PRIORITY_LAST").getBody().get("cardSort").asText());

    List<String> walked = new ArrayList<>();
    String cursor = "-1";
    int pages = 0;
    while (cursor != null && pages++ < 10) {
      JsonNode body = exchange(HttpMethod.GET, "/api/v1/boards/" + boardId + "/cards/page?statusId=" + statusId + "&cursor=" + cursor + "&limit=3", token, null).getBody();
      walked.addAll(titles(body.get("items")));
      cursor = body.get("nextCursor").isNull() ? null : body.get("nextCursor").asText();
    }
    assertEquals(List.of("low-1", "low-2", "high", "urgent"), walked);
  }
}
