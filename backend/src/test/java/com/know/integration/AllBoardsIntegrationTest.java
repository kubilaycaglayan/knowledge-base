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

/** The All boards view (docs/all-boards-view-acceptance-checklist.md). */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AllBoardsIntegrationTest {
  @DynamicPropertySource
  static void configureDataSource(DynamicPropertyRegistry registry) {
    registry.add(
        "spring.datasource.url",
        () ->
            "jdbc:h2:mem:know_all_boards;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1");
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

  ResponseEntity<JsonNode> get(String path, String token) { return exchange(HttpMethod.GET, path, token, null); }
  ResponseEntity<JsonNode> post(String path, String token, String body) { return exchange(HttpMethod.POST, path, token, body); }
  ResponseEntity<JsonNode> put(String path, String token, String body) { return exchange(HttpMethod.PUT, path, token, body); }

  String board(String token, String name) {
    return post("/api/v1/boards", token, "{\"name\":\"" + name + "\"}").getBody().get("id").asText();
  }

  String path(String token, String name) {
    return post("/api/v1/paths", token, "{\"name\":\"" + name + "\"}").getBody().get("id").asText();
  }

  String pathBoard(String token, String pathId) {
    for (JsonNode b : get("/api/v1/boards?includeHidden=true", token).getBody())
      if (pathId.equals(b.path("pathId").asText(null))) return b.get("id").asText();
    throw new AssertionError("Missing path board");
  }

  String statusId(String token, String boardId, String name) {
    for (JsonNode s : get("/api/v1/boards/" + boardId + "/statuses", token).getBody())
      if (s.get("name").asText().equals(name)) return s.get("id").asText();
    throw new AssertionError("Missing status " + name);
  }

  List<String> statusNames(String token, String boardId) {
    List<String> names = new ArrayList<>();
    get("/api/v1/boards/" + boardId + "/statuses", token).getBody().forEach(s -> names.add(s.get("name").asText()));
    return names;
  }

  JsonNode card(String token, String boardId, String statusName, String title, String priority) {
    String body = "{\"title\":\"" + title + "\",\"priority\":\"" + priority + "\",\"statusId\":\"" + statusId(token, boardId, statusName) + "\"}";
    ResponseEntity<JsonNode> res = post("/api/v1/boards/" + boardId + "/cards", token, body);
    assertEquals(HttpStatus.CREATED, res.getStatusCode());
    return res.getBody();
  }

  JsonNode columns(String token) {
    return get("/api/v1/boards/all/columns", token).getBody();
  }

  List<String> columnNames(String token) {
    List<String> names = new ArrayList<>();
    columns(token).forEach(c -> names.add(c.get("name").asText()));
    return names;
  }

  List<String> titles(JsonNode items) {
    List<String> result = new ArrayList<>();
    items.forEach(item -> result.add(item.get("title").asText()));
    return result;
  }

  List<String> walkColumn(String token, String name, int limit) {
    List<String> walked = new ArrayList<>();
    String cursor = "-1";
    int pages = 0;
    while (cursor != null && pages++ < 20) {
      JsonNode body = get("/api/v1/boards/all/columns/cards/page?name=" + name.replace(" ", "%20") + "&cursor=" + cursor + "&limit=" + limit, token).getBody();
      walked.addAll(titles(body.get("items")));
      cursor = body.get("nextCursor").isNull() ? null : body.get("nextCursor").asText();
    }
    return walked;
  }

  // AB-01
  @Test
  void cardsAndStatusesCarryBoardId() {
    String token = token();
    String boardId = board(token, "Work");
    JsonNode card = card(token, boardId, "Backlog", "Write", "MEDIUM");
    assertEquals(boardId, card.get("boardId").asText());
    get("/api/v1/boards/" + boardId + "/statuses", token).getBody().forEach(s -> assertEquals(boardId, s.get("boardId").asText()));
    get("/api/v1/boards/" + boardId + "/cards", token).getBody().forEach(c -> assertEquals(boardId, c.get("boardId").asText()));
  }

  // AB-02
  @Test
  void columnsMergeByNameInTabOrder() {
    String token = token();
    String work = board(token, "Work");
    String home = board(token, "Home");
    post("/api/v1/boards/" + work + "/statuses", token, "{\"name\":\"Review\"}");
    post("/api/v1/boards/" + home + "/statuses", token, "{\"name\":\" in progress \"}");
    post("/api/v1/boards/" + home + "/statuses", token, "{\"name\":\"Waiting\"}");

    assertEquals(List.of("Backlog", "Pending", "In Progress", "Done", "Review", "Waiting"), columnNames(token));
    JsonNode inProgress = columns(token).get(2);
    assertEquals("MANUAL", inProgress.get("cardSort").asText());
    List<String> boardIds = new ArrayList<>();
    inProgress.get("statuses").forEach(s -> boardIds.add(s.get("boardId").asText()));
    assertEquals(List.of(work, home, home), boardIds, "Both boards' In Progress plus Home's second one merge, in tab order");
  }

  // AB-02
  @Test
  void columnsCoverOnlyTheUsersTabBoards() {
    String token = token();
    String kept = board(token, "Kept");
    String archived = board(token, "Old");
    post("/api/v1/boards/" + archived + "/statuses", token, "{\"name\":\"Archived board column\"}");
    post("/api/v1/boards/" + archived + "/archive", token, null);
    String hiddenPath = path(token, "Quiet");
    String hiddenBoard = pathBoard(token, hiddenPath);
    post("/api/v1/boards/" + hiddenBoard + "/statuses", token, "{\"name\":\"Hidden column\"}");
    post("/api/v1/boards/" + hiddenBoard + "/visibility", token, "{\"hidden\":true}");
    String gone = statusId(token, kept, "Pending");
    assertEquals(HttpStatus.OK, post("/api/v1/boards/" + kept + "/statuses/" + gone + "/archive", token, null).getStatusCode());
    String other = token();
    String foreign = board(other, "Foreign");
    post("/api/v1/boards/" + foreign + "/statuses", other, "{\"name\":\"Foreign column\"}");

    assertEquals(List.of("Backlog", "In Progress", "Done"), columnNames(token));
    columns(token).forEach(c -> c.get("statuses").forEach(s -> assertEquals(kept, s.get("boardId").asText())));
    assertEquals(HttpStatus.UNAUTHORIZED, get("/api/v1/boards/all/columns", null).getStatusCode());
  }

  // AB-03
  @Test
  void columnPagesInterleaveBoardsByPosition() {
    String token = token();
    String work = board(token, "Work");
    String home = board(token, "Home");
    card(token, work, "Backlog", "w0", "LOW");
    card(token, work, "Backlog", "w1", "URGENT");
    card(token, work, "Backlog", "w2", "MEDIUM");
    card(token, home, "Backlog", "h0", "HIGH");
    card(token, home, "Backlog", "h1", "LOW");
    card(token, work, "Done", "elsewhere", "LOW");

    assertEquals(List.of("w0", "h0", "w1", "h1", "w2"), walkColumn(token, "Backlog", 2));
    assertEquals(List.of("w0", "h0", "w1", "h1", "w2"), walkColumn(token, "backlog", 20), "Names match case-insensitively");
    JsonNode empty = get("/api/v1/boards/all/columns/cards/page?name=Nowhere&cursor=-1&limit=20", token).getBody();
    assertEquals(0, empty.get("items").size());
    assertTrue(empty.get("nextCursor").isNull());
    assertEquals(HttpStatus.BAD_REQUEST, get("/api/v1/boards/all/columns/cards/page?name=Backlog&cursor=-1&limit=0", token).getStatusCode());
    assertEquals(0, get("/api/v1/boards/all/columns/cards/page?name=Backlog&cursor=-1&limit=20", token()).getBody().get("items").size(), "Another user sees none of these cards");
  }

  // AB-03, AB-04
  @Test
  void columnPagesFollowTheColumnSort() {
    String token = token();
    String work = board(token, "Work");
    String home = board(token, "Home");
    card(token, work, "Backlog", "w-low", "LOW");
    card(token, work, "Backlog", "w-urgent", "URGENT");
    card(token, home, "Backlog", "h-high", "HIGH");
    card(token, home, "Backlog", "h-urgent", "URGENT");
    card(token, home, "Backlog", "h-low", "LOW");

    assertEquals(HttpStatus.OK, put("/api/v1/boards/all/columns/sort", token, "{\"name\":\"Backlog\",\"cardSort\":\"PRIORITY\"}").getStatusCode());
    assertEquals(List.of("w-urgent", "h-urgent", "h-high", "w-low", "h-low"), walkColumn(token, "Backlog", 2));
    put("/api/v1/boards/all/columns/sort", token, "{\"name\":\"Backlog\",\"cardSort\":\"PRIORITY_LAST\"}");
    assertEquals(List.of("w-low", "h-low", "h-high", "w-urgent", "h-urgent"), walkColumn(token, "Backlog", 3));
  }

  // AB-04
  @Test
  void mergedColumnSortIsStoredPerUserWithoutTouchingBoards() {
    String token = token();
    String work = board(token, "Work");
    ResponseEntity<JsonNode> saved = put("/api/v1/boards/all/columns/sort", token, "{\"name\":\" done \",\"cardSort\":\"PRIORITY_LAST\"}");
    assertEquals(HttpStatus.OK, saved.getStatusCode());
    assertEquals("PRIORITY_LAST", columns(token).get(3).get("cardSort").asText());
    get("/api/v1/boards/" + work + "/statuses", token).getBody().forEach(s -> assertEquals("MANUAL", s.get("cardSort").asText()));

    String other = token();
    board(other, "Theirs");
    assertEquals("MANUAL", columns(other).get(3).get("cardSort").asText());
    assertEquals(HttpStatus.BAD_REQUEST, put("/api/v1/boards/all/columns/sort", token, "{\"name\":\"Done\",\"cardSort\":\"TITLE\"}").getStatusCode());
    assertEquals(HttpStatus.BAD_REQUEST, put("/api/v1/boards/all/columns/sort", token, "{\"name\":\"  \",\"cardSort\":\"PRIORITY\"}").getStatusCode());
    put("/api/v1/boards/all/columns/sort", token, "{\"name\":\"Done\",\"cardSort\":\"MANUAL\"}");
    assertEquals("MANUAL", columns(token).get(3).get("cardSort").asText());
  }

  // AB-05
  @Test
  void ganttCoversEveryTabBoard() {
    String token = token();
    String work = board(token, "Work");
    String home = board(token, "Home");
    String hidden = board(token, "Archived");
    for (String[] c : new String[][] {{work, "work-dated"}, {home, "home-dated"}, {hidden, "archived-board"}}) {
      String body = "{\"title\":\"" + c[1] + "\",\"priority\":\"LOW\",\"startDate\":\"2026-09-02\",\"dueDate\":\"2026-09-03\"}";
      assertEquals(HttpStatus.CREATED, post("/api/v1/boards/" + c[0] + "/cards", token, body).getStatusCode());
    }
    card(token, work, "Backlog", "undated", "LOW");
    post("/api/v1/boards/" + hidden + "/archive", token, null);

    JsonNode items = get("/api/v1/boards/all/gantt?from=2026-09-01&to=2026-09-10", token).getBody();
    List<String> titles = titles(items);
    assertTrue(titles.containsAll(List.of("work-dated", "home-dated")));
    assertEquals(2, titles.size());
    assertEquals(HttpStatus.BAD_REQUEST, get("/api/v1/boards/all/gantt?from=2026-09-10&to=2026-09-01", token).getStatusCode());
  }

  // AB-06
  @Test
  void createInColumnCreatesAMissingColumn() {
    String token = token();
    String work = board(token, "Work");
    ResponseEntity<JsonNode> existing = post("/api/v1/boards/" + work + "/cards/in-column", token, "{\"columnName\":\"done\",\"title\":\"Shipped\",\"priority\":\"LOW\"}");
    assertEquals(HttpStatus.CREATED, existing.getStatusCode());
    assertFalse(existing.getBody().get("statusCreated").asBoolean());
    assertEquals(statusId(token, work, "Done"), existing.getBody().get("card").get("statusId").asText());

    ResponseEntity<JsonNode> created = post("/api/v1/boards/" + work + "/cards/in-column", token, "{\"columnName\":\" Review \",\"title\":\"Check\",\"priority\":\"HIGH\"}");
    assertEquals(HttpStatus.CREATED, created.getStatusCode());
    assertTrue(created.getBody().get("statusCreated").asBoolean());
    assertEquals("Review", created.getBody().get("status").get("name").asText());
    assertEquals(4, created.getBody().get("status").get("position").asInt());
    assertEquals(created.getBody().get("status").get("id"), created.getBody().get("card").get("statusId"));
    assertEquals(List.of("Backlog", "Pending", "In Progress", "Done", "Review"), statusNames(token, work));
    assertEquals(HttpStatus.NOT_FOUND, post("/api/v1/boards/" + work + "/cards/in-column", token(), "{\"columnName\":\"Review\",\"title\":\"x\",\"priority\":\"LOW\"}").getStatusCode());
    assertEquals(HttpStatus.BAD_REQUEST, post("/api/v1/boards/" + work + "/cards/in-column", token, "{\"columnName\":\" \",\"title\":\"x\",\"priority\":\"LOW\"}").getStatusCode());
  }

  // AB-07
  @Test
  void moveToColumnCreatesAMissingColumn() {
    String token = token();
    String work = board(token, "Work");
    String cardId = card(token, work, "Backlog", "Draft", "LOW").get("id").asText();
    card(token, work, "Done", "Finished", "LOW");

    JsonNode moved = post("/api/v1/boards/" + work + "/cards/" + cardId + "/move-to-column", token, "{\"columnName\":\"DONE\",\"position\":0}").getBody();
    assertFalse(moved.get("statusCreated").asBoolean());
    assertEquals(statusId(token, work, "Done"), moved.get("card").get("statusId").asText());
    assertEquals(0, moved.get("card").get("position").asInt());

    ResponseEntity<JsonNode> created = post("/api/v1/boards/" + work + "/cards/" + cardId + "/move-to-column", token, "{\"columnName\":\"Blocked\",\"position\":3}");
    assertEquals(HttpStatus.OK, created.getStatusCode());
    assertTrue(created.getBody().get("statusCreated").asBoolean());
    assertEquals("Blocked", created.getBody().get("status").get("name").asText());
    assertEquals(0, created.getBody().get("card").get("position").asInt());
    assertEquals(statusId(token, work, "Blocked"), created.getBody().get("card").get("statusId").asText());
    assertEquals(HttpStatus.NOT_FOUND, post("/api/v1/boards/" + work + "/cards/" + cardId + "/move-to-column", token(), "{\"columnName\":\"Done\",\"position\":0}").getStatusCode());
  }

  // AB-08
  @Test
  void transferMovesACardToAnotherBoard() {
    String token = token();
    String work = board(token, "Work");
    String home = board(token, "Home");
    post("/api/v1/boards/" + work + "/statuses", token, "{\"name\":\"Review\"}");
    String first = card(token, work, "Pending", "Plan", "HIGH").get("id").asText();
    card(token, home, "Pending", "Already there", "LOW");

    JsonNode same = post("/api/v1/boards/" + work + "/cards/" + first + "/transfer", token, "{\"boardId\":\"" + home + "\"}").getBody();
    assertEquals(home, same.get("card").get("boardId").asText());
    assertEquals(statusId(token, home, "Pending"), same.get("card").get("statusId").asText());
    assertEquals(1, same.get("card").get("position").asInt(), "Lands at the end of the column");
    assertFalse(same.get("statusCreated").asBoolean());
    assertEquals(HttpStatus.NOT_FOUND, get("/api/v1/boards/" + work + "/cards/" + first, token).getStatusCode());

    String review = card(token, work, "Review", "Look", "LOW").get("id").asText();
    JsonNode created = post("/api/v1/boards/" + work + "/cards/" + review + "/transfer", token, "{\"boardId\":\"" + home + "\"}").getBody();
    assertTrue(created.get("statusCreated").asBoolean());
    assertEquals("Review", created.get("status").get("name").asText());
    assertEquals(home, created.get("status").get("boardId").asText());

    String pathId = path(token, "Garden");
    String pathBoard = pathBoard(token, pathId);
    JsonNode toPath = post("/api/v1/boards/" + home + "/cards/" + review + "/transfer", token, "{\"boardId\":\"" + pathBoard + "\"}").getBody();
    assertEquals(List.of(pathId), List.of(toPath.get("card").get("pathIds").get(0).asText()));
    assertEquals(1, toPath.get("card").get("pathIds").size());
    JsonNode back = post("/api/v1/boards/" + pathBoard + "/cards/" + review + "/transfer", token, "{\"boardId\":\"" + work + "\"}").getBody();
    assertEquals(pathId, back.get("card").get("pathIds").get(0).asText(), "Leaving a path board keeps the path");
  }

  // AB-08
  @Test
  void transferRejectsForeignAndArchivedBoards() {
    String token = token();
    String work = board(token, "Work");
    String old = board(token, "Old");
    String cardId = card(token, work, "Backlog", "Stay", "LOW").get("id").asText();
    post("/api/v1/boards/" + old + "/archive", token, null);
    String other = token();
    String foreign = board(other, "Foreign");

    assertEquals(HttpStatus.NOT_FOUND, post("/api/v1/boards/" + work + "/cards/" + cardId + "/transfer", token, "{\"boardId\":\"" + foreign + "\"}").getStatusCode());
    assertEquals(HttpStatus.CONFLICT, post("/api/v1/boards/" + work + "/cards/" + cardId + "/transfer", token, "{\"boardId\":\"" + old + "\"}").getStatusCode());
    assertEquals(HttpStatus.NOT_FOUND, post("/api/v1/boards/" + work + "/cards/" + cardId + "/transfer", other, "{\"boardId\":\"" + foreign + "\"}").getStatusCode());
    assertEquals(work, get("/api/v1/boards/" + work + "/cards/" + cardId, token).getBody().get("boardId").asText());
  }
}
