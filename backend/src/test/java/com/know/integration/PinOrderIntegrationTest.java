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

/** Pinning a note, path, or board puts it at the end of the pinned items. */
class PinOrderIntegrationTest extends IntegrationTestSupport {
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

  String create(String token, String path, String body) {
    ResponseEntity<JsonNode> res = exchange(HttpMethod.POST, path, token, body);
    assertTrue(res.getStatusCode().is2xxSuccessful(), res.toString());
    return res.getBody().get("id").asText();
  }

  void pin(String token, String path, boolean pinned) {
    assertEquals(HttpStatus.OK, exchange(HttpMethod.POST, path + "/pin", token, "{\"pinned\":" + pinned + "}").getStatusCode());
  }

  void order(String token, String path, String field, String... ids) {
    String body = "{\"" + field + "\":[\"" + String.join("\",\"", ids) + "\"]}";
    assertEquals(HttpStatus.NO_CONTENT, exchange(HttpMethod.PUT, path, token, body).getStatusCode());
  }

  List<String> pinnedNames(String token, String path, String nameField) {
    List<String> names = new ArrayList<>();
    exchange(HttpMethod.GET, path, token, null).getBody().forEach(item -> {
      if (item.get("pinned").asBoolean()) names.add(item.get(nameField).asText());
    });
    return names;
  }

  List<String> noteTitles(String token) {
    List<String> titles = new ArrayList<>();
    exchange(HttpMethod.GET, "/api/v1/notes", token, null).getBody().forEach(note -> titles.add(note.get("title").asText()));
    return titles;
  }

  List<String> boardNames(String token) {
    List<String> names = new ArrayList<>();
    exchange(HttpMethod.GET, "/api/v1/boards", token, null)
        .getBody()
        .forEach(board -> names.add(board.get("name").asText()));
    return names;
  }

  @Test
  void boardOrderPersistsCompleteOwnedOrderAndRejectsDuplicateOrForeignIds() {
    String token = token(), other = token();
    String a = create(token, "/api/v1/boards", "{\"name\":\"A\"}");
    String b = create(token, "/api/v1/boards", "{\"name\":\"B\"}");
    String c = create(token, "/api/v1/boards", "{\"name\":\"C\"}");
    String foreign = create(other, "/api/v1/boards", "{\"name\":\"Foreign\"}");

    order(token, "/api/v1/boards/order", "ids", c, a, b);
    assertEquals(List.of("C", "A", "B"), boardNames(token));

    String duplicateIds = "{\"ids\":[\"" + c + "\",\"" + c + "\",\"" + b + "\"]}";
    assertEquals(
        HttpStatus.BAD_REQUEST,
        exchange(HttpMethod.PUT, "/api/v1/boards/order", token, duplicateIds).getStatusCode());
    String foreignIds = "{\"ids\":[\"" + c + "\",\"" + foreign + "\",\"" + b + "\"]}";
    assertEquals(
        HttpStatus.BAD_REQUEST,
        exchange(HttpMethod.PUT, "/api/v1/boards/order", token, foreignIds).getStatusCode());
    assertEquals(List.of("C", "A", "B"), boardNames(token), "Rejected orders preserve the saved order");
  }

  @Test
  void noteOrderEndpointPersistsCompleteOrderAndRejectsDuplicateOrForeignIds() {
    String token = token(), other = token();
    String a = create(token, "/api/v1/notes", "{\"title\":\"A\",\"content\":\"a\"}");
    String b = create(token, "/api/v1/notes", "{\"title\":\"B\",\"content\":\"b\"}");
    String c = create(token, "/api/v1/notes", "{\"title\":\"C\",\"content\":\"c\"}");
    String foreign = create(other, "/api/v1/notes", "{\"title\":\"Foreign\",\"content\":\"foreign\"}");

    order(token, "/api/v1/notes/order", "noteIds", c, a, b);
    assertEquals(List.of("C", "A", "B"), noteTitles(token));

    String duplicateIds = "{\"noteIds\":[\"" + c + "\",\"" + c + "\",\"" + b + "\"]}";
    assertEquals(HttpStatus.BAD_REQUEST, exchange(HttpMethod.PUT, "/api/v1/notes/order", token, duplicateIds).getStatusCode());
    String foreignIds = "{\"noteIds\":[\"" + c + "\",\"" + foreign + "\",\"" + b + "\"]}";
    assertEquals(HttpStatus.BAD_REQUEST, exchange(HttpMethod.PUT, "/api/v1/notes/order", token, foreignIds).getStatusCode());
    assertEquals(List.of("C", "A", "B"), noteTitles(token), "Rejected orders preserve the saved order");
  }

  @Test
  void pinnedNoteJoinsTheEndOfThePinnedNotes() {
    String token = token();
    String a = create(token, "/api/v1/notes", "{\"title\":\"A\",\"content\":\"<p>a</p>\"}");
    String b = create(token, "/api/v1/notes", "{\"title\":\"B\",\"content\":\"<p>b</p>\"}");
    String c = create(token, "/api/v1/notes", "{\"title\":\"C\",\"content\":\"<p>c</p>\"}");
    String d = create(token, "/api/v1/notes", "{\"title\":\"D\",\"content\":\"<p>d</p>\"}");

    pin(token, "/api/v1/notes/" + a, true);
    pin(token, "/api/v1/notes/" + b, true);
    assertEquals(List.of("A", "B"), pinnedNames(token, "/api/v1/notes", "title"));

    order(token, "/api/v1/notes/order", "noteIds", b, a, d, c);
    pin(token, "/api/v1/notes/" + c, true);
    assertEquals(List.of("B", "A", "C"), pinnedNames(token, "/api/v1/notes", "title"));

    pin(token, "/api/v1/notes/" + d, true);
    assertEquals(List.of("B", "A", "C", "D"), pinnedNames(token, "/api/v1/notes", "title"));

    // Pinning an already pinned note keeps its place.
    pin(token, "/api/v1/notes/" + a, true);
    assertEquals(List.of("B", "A", "C", "D"), pinnedNames(token, "/api/v1/notes", "title"));
  }

  @Test
  void pinnedPathJoinsTheEndOfThePinnedPaths() {
    String token = token();
    String a = create(token, "/api/v1/paths", "{\"name\":\"A\"}");
    String b = create(token, "/api/v1/paths", "{\"name\":\"B\"}");
    String c = create(token, "/api/v1/paths", "{\"name\":\"C\"}");
    String d = create(token, "/api/v1/paths", "{\"name\":\"D\"}");

    pin(token, "/api/v1/paths/" + a, true);
    pin(token, "/api/v1/paths/" + b, true);
    assertEquals(List.of("A", "B"), pinnedNames(token, "/api/v1/paths", "name"));

    order(token, "/api/v1/paths/order", "pathIds", b, a, d, c);
    pin(token, "/api/v1/paths/" + c, true);
    assertEquals(List.of("B", "A", "C"), pinnedNames(token, "/api/v1/paths", "name"));

    pin(token, "/api/v1/paths/" + d, true);
    assertEquals(List.of("B", "A", "C", "D"), pinnedNames(token, "/api/v1/paths", "name"));

    pin(token, "/api/v1/paths/" + a, true);
    assertEquals(List.of("B", "A", "C", "D"), pinnedNames(token, "/api/v1/paths", "name"));
  }

  @Test
  void pinnedBoardJoinsTheEndOfThePinnedBoards() {
    String token = token();
    String custom = create(token, "/api/v1/boards", "{\"name\":\"Custom\"}");
    String other = create(token, "/api/v1/boards", "{\"name\":\"Other\"}");
    String pathId = create(token, "/api/v1/paths", "{\"name\":\"Path\"}");
    String pathBoard = null;
    for (JsonNode board : exchange(HttpMethod.GET, "/api/v1/boards", token, null).getBody())
      if (pathId.equals(board.path("pathId").asText(null))) pathBoard = board.get("id").asText();
    assertNotNull(pathBoard);

    pin(token, "/api/v1/boards/" + custom, true);
    pin(token, "/api/v1/boards/" + pathBoard, true);
    assertEquals(List.of("Custom", "Path"), pinnedNames(token, "/api/v1/boards", "name"));

    order(token, "/api/v1/boards/order", "ids", pathBoard, custom);
    pin(token, "/api/v1/boards/" + other, true);
    assertEquals(List.of("Path", "Custom", "Other"), pinnedNames(token, "/api/v1/boards", "name"));
  }
}
