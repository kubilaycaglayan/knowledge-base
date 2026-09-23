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

/** Path boards: every path owns one board from birth (docs/path-boards-acceptance-checklist.md). */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class PathBoardIntegrationTest {
  @DynamicPropertySource
  static void configureDataSource(DynamicPropertyRegistry registry) {
    registry.add(
        "spring.datasource.url",
        () ->
            "jdbc:h2:mem:know_path_boards;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1");
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
    ResponseEntity<JsonNode> res = post("/api/v1/auth/register", null, body);
    assertEquals(HttpStatus.OK, res.getStatusCode());
    return res.getBody().get("token").asText();
  }

  HttpHeaders bearer(String token) {
    HttpHeaders h = new HttpHeaders();
    h.setContentType(MediaType.APPLICATION_JSON);
    if (token != null) h.setBearerAuth(token);
    return h;
  }

  ResponseEntity<JsonNode> exchange(HttpMethod method, String path, String token, String body) {
    return rest.exchange(base + path, method, new HttpEntity<>(body, bearer(token)), JsonNode.class);
  }

  ResponseEntity<JsonNode> post(String path, String token, String body) { return exchange(HttpMethod.POST, path, token, body); }
  ResponseEntity<JsonNode> put(String path, String token, String body) { return exchange(HttpMethod.PUT, path, token, body); }
  ResponseEntity<JsonNode> get(String path, String token) { return exchange(HttpMethod.GET, path, token, null); }
  ResponseEntity<JsonNode> delete(String path, String token) { return exchange(HttpMethod.DELETE, path, token, null); }

  ResponseEntity<JsonNode> importCsv(String token, String csv) {
    HttpHeaders headers = bearer(token);
    headers.setContentType(MediaType.parseMediaType("text/csv"));
    return rest.exchange(base + "/api/v1/imports/knowledge-base", HttpMethod.POST, new HttpEntity<>(csv, headers), JsonNode.class);
  }

  String createPath(String token, String name) {
    ResponseEntity<JsonNode> res = post("/api/v1/paths", token, "{\"name\":\"" + name + "\"}");
    assertEquals(HttpStatus.CREATED, res.getStatusCode());
    return res.getBody().get("id").asText();
  }

  String createBoard(String token, String name) {
    return post("/api/v1/boards", token, "{\"name\":\"" + name + "\"}").getBody().get("id").asText();
  }

  List<JsonNode> boards(String token, String query) {
    List<JsonNode> result = new ArrayList<>();
    get("/api/v1/boards" + query, token).getBody().forEach(result::add);
    return result;
  }

  JsonNode boardForPath(String token, String pathId) {
    return boards(token, "?includeHidden=true").stream()
        .filter(board -> pathId.equals(board.path("pathId").asText(null)))
        .findFirst().orElse(null);
  }

  List<String> statusNames(String token, String boardId) {
    List<String> names = new ArrayList<>();
    get("/api/v1/boards/" + boardId + "/statuses", token).getBody().forEach(s -> names.add(s.get("name").asText()));
    return names;
  }

  String statusId(String token, String boardId, String name) {
    for (JsonNode s : get("/api/v1/boards/" + boardId + "/statuses", token).getBody())
      if (s.get("name").asText().equals(name)) return s.get("id").asText();
    throw new AssertionError("Missing status " + name);
  }

  // PB-01, PB-07
  @Test
  void creatingAPathCreatesItsBoardWithDefaultStatuses() {
    String token = token();
    String pathId = createPath(token, "Writing");

    JsonNode board = boardForPath(token, pathId);
    assertNotNull(board, "A path board should exist");
    assertEquals("Writing", board.get("name").asText());
    assertFalse(board.get("hidden").asBoolean());
    assertEquals(List.of("Backlog", "Pending", "In Progress", "Done"), statusNames(token, board.get("id").asText()));
    assertTrue(boards(token, "").stream().anyMatch(b -> b.get("id").equals(board.get("id"))));
  }

  // PB-02
  @Test
  void restoringAPathReusesItsBoard() {
    String token = token();
    String pathId = createPath(token, "Restorable");
    String boardId = boardForPath(token, pathId).get("id").asText();

    assertEquals(HttpStatus.NO_CONTENT, delete("/api/v1/paths/" + pathId, token).getStatusCode());
    assertEquals(HttpStatus.OK, post("/api/v1/paths/" + pathId + "/restore", token, "{}").getStatusCode());

    long count = boards(token, "?includeHidden=true").stream().filter(b -> pathId.equals(b.path("pathId").asText(null))).count();
    assertEquals(1, count);
    assertEquals(boardId, boardForPath(token, pathId).get("id").asText());
  }

  // PB-02
  @Test
  void createForPathIsIdempotent() {
    String token = token();
    UUID pathId = UUID.randomUUID();
    String csv = "entity,id,payload\npath," + pathId + ",\"{\"\"name\"\":\"\"Twice\"\",\"\"status\"\":\"\"ACTIVE\"\"}\"\n";
    assertEquals(HttpStatus.OK, importCsv(token, csv).getStatusCode());
    importCsv(token, csv);

    long count = boards(token, "?includeHidden=true").stream().filter(b -> pathId.toString().equals(b.path("pathId").asText(null))).count();
    assertEquals(1, count);
  }

  // PB-03
  @Test
  void importedPathsGetBoards() {
    String token = token();
    String project = "Clockify-" + UUID.randomUUID().toString().substring(0, 8);
    String payload = "{\"timeentries\":[{\"_id\":\"pb-" + UUID.randomUUID() + "\",\"description\":\"Session\",\"projectName\":\"" + project
        + "\",\"timeInterval\":{\"start\":\"2024-07-01T10:00:00Z\",\"end\":\"2024-07-01T11:00:00Z\",\"duration\":3600}}]}";
    assertEquals(HttpStatus.OK, post("/api/v1/imports/clockify", token, payload).getStatusCode());
    String clockifyPath = null;
    for (JsonNode p : get("/api/v1/paths", token).getBody()) if (project.equals(p.get("name").asText())) clockifyPath = p.get("id").asText();
    assertNotNull(clockifyPath);
    assertNotNull(boardForPath(token, clockifyPath), "Clockify paths get a board");

    UUID csvPath = UUID.randomUUID();
    String csv = "entity,id,payload\npath," + csvPath + ",\"{\"\"name\"\":\"\"CSV path\"\",\"\"status\"\":\"\"ACTIVE\"\"}\"\n";
    ResponseEntity<JsonNode> imported = importCsv(token, csv);
    assertEquals(HttpStatus.OK, imported.getStatusCode(), String.valueOf(imported.getBody()));
    JsonNode csvBoard = boardForPath(token, csvPath.toString());
    assertNotNull(csvBoard, "Knowledge Base import paths get a board");
    assertEquals("CSV path", csvBoard.get("name").asText());
  }

  // PB-05
  @Test
  void renamingAPathRenamesItsBoard() {
    String token = token();
    String pathId = createPath(token, "Old name");
    assertEquals(HttpStatus.OK, put("/api/v1/paths/" + pathId, token, "{\"name\":\"New name\"}").getStatusCode());
    assertEquals("New name", boardForPath(token, pathId).get("name").asText());
  }

  // PB-06, PB-12
  @Test
  void pathBoardsCannotBeRenamedOrArchivedDirectly() {
    String token = token();
    String pathId = createPath(token, "Locked");
    String boardId = boardForPath(token, pathId).get("id").asText();

    assertEquals(HttpStatus.CONFLICT, put("/api/v1/boards/" + boardId, token, "{\"name\":\"Other\"}").getStatusCode());
    assertEquals(HttpStatus.CONFLICT, post("/api/v1/boards/" + boardId + "/archive", token, "{}").getStatusCode());
    JsonNode board = boardForPath(token, pathId);
    assertEquals("Locked", board.get("name").asText());
    assertFalse(board.get("archived").asBoolean());
  }

  // PB-08
  @Test
  void hidingAPathBoardKeepsItsCards() {
    String token = token();
    String pathId = createPath(token, "Hideable");
    String boardId = boardForPath(token, pathId).get("id").asText();
    assertEquals(HttpStatus.CREATED, post("/api/v1/boards/" + boardId + "/cards", token, "{\"title\":\"Kept\"}").getStatusCode());

    ResponseEntity<JsonNode> hidden = post("/api/v1/boards/" + boardId + "/visibility", token, "{\"hidden\":true}");
    assertEquals(HttpStatus.OK, hidden.getStatusCode());
    assertTrue(hidden.getBody().get("hidden").asBoolean());
    assertTrue(boards(token, "").stream().noneMatch(b -> b.get("id").asText().equals(boardId)));
    assertTrue(boardForPath(token, pathId).get("hidden").asBoolean());

    assertEquals(HttpStatus.OK, post("/api/v1/boards/" + boardId + "/visibility", token, "{\"hidden\":false}").getStatusCode());
    assertTrue(boards(token, "").stream().anyMatch(b -> b.get("id").asText().equals(boardId)));
    assertEquals("Kept", get("/api/v1/boards/" + boardId + "/cards", token).getBody().get(0).get("title").asText());
  }

  // PB-09
  @Test
  void visibilityOnlyAppliesToPathBoards() {
    String token = token();
    String boardId = createBoard(token, "Custom");
    assertEquals(HttpStatus.CONFLICT, post("/api/v1/boards/" + boardId + "/visibility", token, "{\"hidden\":true}").getStatusCode());
  }

  // PB-10
  @Test
  void pathResponsesExposeTheirBoard() {
    String token = token();
    String pathId = createPath(token, "Exposed");
    String boardId = boardForPath(token, pathId).get("id").asText();

    JsonNode path = get("/api/v1/paths/" + pathId, token).getBody();
    assertEquals(boardId, path.get("boardId").asText());
    assertFalse(path.get("boardHidden").asBoolean());

    post("/api/v1/boards/" + boardId + "/visibility", token, "{\"hidden\":true}");
    JsonNode listed = null;
    for (JsonNode p : get("/api/v1/paths", token).getBody()) if (p.get("id").asText().equals(pathId)) listed = p;
    assertNotNull(listed);
    assertEquals(boardId, listed.get("boardId").asText());
    assertTrue(listed.get("boardHidden").asBoolean());
  }

  // PB-11
  @Test
  void deletingAPathHidesItsBoardUntilRestored() {
    String token = token();
    String pathId = createPath(token, "Transient");
    String boardId = boardForPath(token, pathId).get("id").asText();

    delete("/api/v1/paths/" + pathId, token);
    assertTrue(boards(token, "?includeHidden=true").stream().noneMatch(b -> b.get("id").asText().equals(boardId)));

    post("/api/v1/paths/" + pathId + "/restore", token, "{}");
    assertTrue(boards(token, "").stream().anyMatch(b -> b.get("id").asText().equals(boardId)));
  }

  // PB-13
  @Test
  void mergingPathsMovesCardsByStatusName() {
    String token = token();
    String sourcePath = createPath(token, "Source");
    String targetPath = createPath(token, "Target");
    String source = boardForPath(token, sourcePath).get("id").asText();
    String target = boardForPath(token, targetPath).get("id").asText();

    put("/api/v1/boards/" + source + "/statuses/" + statusId(token, source, "In Progress"), token, "{\"name\":\"in progress\"}");
    String review = post("/api/v1/boards/" + source + "/statuses", token, "{\"name\":\"Review\"}").getBody().get("id").asText();
    post("/api/v1/boards/" + target + "/cards", token, "{\"title\":\"Existing\",\"statusId\":\"" + statusId(token, target, "In Progress") + "\"}");
    post("/api/v1/boards/" + source + "/cards", token, "{\"title\":\"Matched\",\"statusId\":\"" + statusId(token, source, "in progress") + "\"}");
    post("/api/v1/boards/" + source + "/cards", token, "{\"title\":\"Fallback\",\"statusId\":\"" + review + "\"}");
    String archivedCard = post("/api/v1/boards/" + source + "/cards", token, "{\"title\":\"Archived\",\"statusId\":\"" + statusId(token, source, "Done") + "\"}").getBody().get("id").asText();
    post("/api/v1/boards/" + source + "/cards/" + archivedCard + "/archive", token, "{}");

    assertEquals(HttpStatus.NO_CONTENT, post("/api/v1/paths/" + sourcePath + "/merge", token, "{\"targetPathId\":\"" + targetPath + "\"}").getStatusCode());

    List<JsonNode> moved = new ArrayList<>();
    get("/api/v1/boards/" + target + "/cards", token).getBody().forEach(moved::add);
    JsonNode matched = moved.stream().filter(c -> c.get("title").asText().equals("Matched")).findFirst().orElseThrow();
    JsonNode fallback = moved.stream().filter(c -> c.get("title").asText().equals("Fallback")).findFirst().orElseThrow();
    assertEquals(statusId(token, target, "In Progress"), matched.get("statusId").asText());
    assertEquals(1, matched.get("position").asInt(), "Moved cards are appended after existing cards");
    assertEquals(statusId(token, target, "Backlog"), fallback.get("statusId").asText());
    assertEquals(List.of(targetPath), List.of(matched.get("pathIds").get(0).asText()));
    assertEquals(1, matched.get("pathIds").size());

    JsonNode archived = get("/api/v1/boards/" + target + "/cards?archived=true", token).getBody();
    assertEquals(1, archived.size());
    assertEquals("Archived", archived.get(0).get("title").asText());
    assertEquals(statusId(token, target, "Done"), archived.get(0).get("statusId").asText());

    assertTrue(boards(token, "?archived=true").stream().anyMatch(b -> b.get("id").asText().equals(source)));
  }

  // PB-14
  @Test
  void pathBoardCardsAlwaysBelongToTheirPath() {
    String token = token();
    String pathId = createPath(token, "Owner path");
    String otherPath = createPath(token, "Other path");
    String boardId = boardForPath(token, pathId).get("id").asText();

    JsonNode created = post("/api/v1/boards/" + boardId + "/cards", token, "{\"title\":\"Card\",\"pathIds\":[\"" + otherPath + "\"]}").getBody();
    assertEquals(1, created.get("pathIds").size());
    assertEquals(pathId, created.get("pathIds").get(0).asText());

    JsonNode updated = put("/api/v1/boards/" + boardId + "/cards/" + created.get("id").asText(), token, "{\"title\":\"Card\",\"pathIds\":[]}").getBody();
    assertEquals(1, updated.get("pathIds").size());
    assertEquals(pathId, updated.get("pathIds").get(0).asText());
  }

  // PB-16
  @Test
  void boardListFollowsTabOrder() {
    String token = token();
    String first = createPath(token, "First path");
    String second = createPath(token, "Second path");
    String pinned = createBoard(token, "Pinned custom");
    String y = createBoard(token, "Y custom");
    String z = createBoard(token, "Z custom");
    assertEquals(HttpStatus.NO_CONTENT, put("/api/v1/paths/order", token, "{\"pathIds\":[\"" + second + "\",\"" + first + "\"]}").getStatusCode());
    assertEquals(HttpStatus.OK, post("/api/v1/boards/" + pinned + "/pin", token, "{\"pinned\":true}").getStatusCode());
    assertEquals(HttpStatus.NO_CONTENT, put("/api/v1/boards/order", token, "{\"ids\":[\"" + z + "\",\"" + y + "\"]}").getStatusCode());

    List<String> names = boards(token, "").stream().map(b -> b.get("name").asText()).toList();
    assertEquals(List.of("Pinned custom", "Second path", "First path", "Z custom", "Y custom"), names);
  }

  // PB-17
  @Test
  void pinningOnlyAppliesToCustomBoards() {
    String token = token();
    String pathId = createPath(token, "Not pinnable");
    String pathBoard = boardForPath(token, pathId).get("id").asText();
    String custom = createBoard(token, "Pinnable");

    assertEquals(HttpStatus.CONFLICT, post("/api/v1/boards/" + pathBoard + "/pin", token, "{\"pinned\":true}").getStatusCode());
    ResponseEntity<JsonNode> pinned = post("/api/v1/boards/" + custom + "/pin", token, "{\"pinned\":true}");
    assertEquals(HttpStatus.OK, pinned.getStatusCode());
    assertTrue(pinned.getBody().get("pinned").asBoolean());
    assertFalse(post("/api/v1/boards/" + custom + "/pin", token, "{\"pinned\":false}").getBody().get("pinned").asBoolean());
  }

  // PB-18
  @Test
  void reorderingCustomBoards() {
    String token = token();
    String a = createBoard(token, "A");
    String b = createBoard(token, "B");
    String pathBoard = boardForPath(token, createPath(token, "In the way")).get("id").asText();
    String foreign = createBoard(token(), "Foreign");

    assertEquals(HttpStatus.BAD_REQUEST, put("/api/v1/boards/order", token, "{\"ids\":[\"" + a + "\",\"" + pathBoard + "\"]}").getStatusCode());
    assertEquals(HttpStatus.BAD_REQUEST, put("/api/v1/boards/order", token, "{\"ids\":[\"" + a + "\",\"" + foreign + "\"]}").getStatusCode());
    assertEquals(HttpStatus.NO_CONTENT, put("/api/v1/boards/order", token, "{\"ids\":[\"" + a + "\",\"" + b + "\"]}").getStatusCode());
    List<String> custom = boards(token, "").stream().filter(x -> x.path("pathId").isNull() || x.path("pathId").isMissingNode()).map(x -> x.get("name").asText()).toList();
    assertEquals(List.of("A", "B"), custom);
  }

  // PB-19
  @Test
  void pathBoardMutationsRejectForeignBoards() {
    String owner = token();
    String intruder = token();
    String pathBoard = boardForPath(owner, createPath(owner, "Private")).get("id").asText();
    String custom = createBoard(owner, "Private custom");

    assertEquals(HttpStatus.NOT_FOUND, post("/api/v1/boards/" + pathBoard + "/visibility", intruder, "{\"hidden\":true}").getStatusCode());
    assertEquals(HttpStatus.NOT_FOUND, post("/api/v1/boards/" + custom + "/pin", intruder, "{\"pinned\":true}").getStatusCode());
    assertEquals(HttpStatus.BAD_REQUEST, put("/api/v1/boards/order", intruder, "{\"ids\":[\"" + custom + "\"]}").getStatusCode());
    List<JsonNode> ownerBoards = boards(owner, "");
    assertFalse(ownerBoards.stream().filter(b -> b.get("id").asText().equals(pathBoard)).findFirst().orElseThrow().get("hidden").asBoolean());
    assertFalse(ownerBoards.stream().filter(b -> b.get("id").asText().equals(custom)).findFirst().orElseThrow().get("pinned").asBoolean());
  }
}
