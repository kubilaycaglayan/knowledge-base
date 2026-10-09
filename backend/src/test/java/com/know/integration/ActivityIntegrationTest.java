package com.know.integration;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.*;

/** Persistence-backed behavior for the activity query filters. */
class ActivityIntegrationTest extends IntegrationTestSupport {
  @LocalServerPort int port;
  @Autowired TestRestTemplate rest;
  String base;

  @BeforeEach
  void setUp() {
    base = "http://localhost:" + port;
  }

  String token() {
    String body =
        "{\"email\":\"" + UUID.randomUUID() + "@test.example\",\"password\":\"SecurePassword123!\"}";
    ResponseEntity<JsonNode> response = exchange(HttpMethod.POST, "/api/v1/auth/register", null, body);
    assertEquals(HttpStatus.OK, response.getStatusCode());
    return response.getBody().get("token").asText();
  }

  ResponseEntity<JsonNode> exchange(HttpMethod method, String path, String token, String body) {
    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    if (token != null) headers.setBearerAuth(token);
    return rest.exchange(base + path, method, new HttpEntity<>(body, headers), JsonNode.class);
  }

  String createPath(String token, String name) {
    JsonNode path = exchange(HttpMethod.POST, "/api/v1/paths", token, "{\"name\":\"" + name + "\"}").getBody();
    return path.get("id").asText();
  }

  void createNote(String token, String pathId, String title) {
    String body = "{\"pathId\":\"" + pathId + "\",\"title\":\"" + title + "\",\"content\":\"Note content\"}";
    assertTrue(exchange(HttpMethod.POST, "/api/v1/notes", token, body).getStatusCode().is2xxSuccessful());
  }

  JsonNode activities(String token, String query) {
    return exchange(HttpMethod.GET, "/api/v1/activities" + query, token, null).getBody();
  }

  @Test
  void activityListFiltersPersistedEventsByDatesPathAndTypeAndScopesByOwner() {
    String owner = token();
    String other = token();
    String firstPath = createPath(owner, "First path");
    String secondPath = createPath(owner, "Second path");
    String foreignPath = createPath(other, "Foreign path");
    createNote(owner, firstPath, "First activity");

    JsonNode firstActivity = activities(owner, "?pathId=" + firstPath).get(0);
    assertEquals(firstPath, firstActivity.get("pathId").asText());
    assertEquals("NOTE_CREATED", firstActivity.get("type").asText());
    assertTrue(firstActivity.get("title").asText().contains("First activity"));
    Instant occurredAt = Instant.parse(firstActivity.get("occurredAt").asText());

    createNote(owner, secondPath, "Second activity");
    createNote(other, foreignPath, "Foreign activity");

    JsonNode all = activities(owner, "");
    assertEquals(2, all.size());
    assertTrue(all.toString().contains("First activity"));
    assertTrue(all.toString().contains("Second activity"));
    assertFalse(all.toString().contains("Foreign activity"));

    JsonNode pathFiltered = activities(owner, "?pathId=" + firstPath);
    assertEquals(1, pathFiltered.size());
    assertTrue(pathFiltered.toString().contains("First activity"));

    JsonNode typeFiltered = activities(owner, "?type=NOTE_CREATED");
    assertEquals(2, typeFiltered.size());
    assertFalse(typeFiltered.toString().contains("Foreign activity"));
    assertTrue(activities(owner, "?pathId=" + foreignPath).isEmpty());

    String atBoundary = occurredAt.toString();
    JsonNode exactRange = activities(owner, "?from=" + atBoundary + "&to=" + atBoundary);
    assertEquals(1, exactRange.size(), "Both date bounds include an event at the boundary");
    assertEquals(firstActivity.get("id").asText(), exactRange.get(0).get("id").asText());

    assertTrue(activities(owner, "?from=" + occurredAt.plusSeconds(60)).isEmpty());
    assertTrue(activities(owner, "?to=" + occurredAt.minusSeconds(60)).isEmpty());
  }
}
