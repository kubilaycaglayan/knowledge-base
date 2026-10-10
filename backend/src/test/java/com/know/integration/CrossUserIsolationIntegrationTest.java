package com.know.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.web.server.LocalServerPort;

/**
 * One matrix over every owned resource type: another user can neither see nor change it, nor
 * attach it to their own data (docs/test-hardening-plan.md, TH-07 and TH-08).
 */
class CrossUserIsolationIntegrationTest extends IntegrationTestSupport {
  @LocalServerPort int port;
  ApiClient api;

  String owner;
  String intruder;
  String marker;
  Map<String, String> ids;

  @BeforeEach
  void setUp() {
    api = new ApiClient(port);
    owner = api.register();
    intruder = api.register();
    marker = "secret-" + UUID.randomUUID();
    ids = new LinkedHashMap<>();
    ids.put(
        "label",
        api.created(
                "POST",
                "/api/v1/labels",
                owner,
                "{\"name\":\"" + marker + "-label\",\"scopes\":[\"NOTE\",\"TIME_ENTRY\",\"LOG\",\"BOARD\"]}")
            .get("id")
            .asText());
    ids.put(
        "path",
        api.created("POST", "/api/v1/paths", owner, "{\"name\":\"" + marker + "-path\"}")
            .get("id")
            .asText());
    ids.put(
        "note",
        api.created(
                "POST",
                "/api/v1/notes",
                owner,
                "{\"title\":\"" + marker + "\",\"pathId\":\"" + ids.get("path")
                    + "\",\"content\":\"<p>" + marker + "</p>\",\"contentText\":\"" + marker + "\"}")
            .get("id")
            .asText());
    ids.put(
        "activity",
        api.get("/api/v1/activities?pathId=" + ids.get("path"), owner)
            .json()
            .get(0)
            .get("id")
            .asText());
    ids.put(
        "log",
        api.created(
                "POST",
                "/api/v1/logs",
                owner,
                "{\"body\":\"" + marker + "\",\"occurredAt\":\"2026-09-01T09:00:00Z\"}")
            .get("id")
            .asText());
    ids.put(
        "board",
        api.created("POST", "/api/v1/boards", owner, "{\"name\":\"" + marker + "-board\"}")
            .get("id")
            .asText());
    ids.put(
        "status",
        api.get("/api/v1/boards/" + ids.get("board") + "/statuses", owner)
            .json()
            .get(0)
            .get("id")
            .asText());
    ids.put(
        "card",
        api.created(
                "POST",
                "/api/v1/boards/" + ids.get("board") + "/cards",
                owner,
                "{\"title\":\"" + marker + "-card\"}")
            .get("id")
            .asText());
    ids.put(
        "entry",
        api.created(
                "POST",
                "/api/v1/time-entries",
                owner,
                "{\"pathId\":\"" + ids.get("path") + "\",\"labelIds\":[],\"description\":\"" + marker
                    + "\",\"startedAt\":\"2026-09-01T09:00:00Z\",\"endedAt\":\"2026-09-01T10:00:00Z\"}")
            .get("id")
            .asText());
    ids.put(
        "calendarLabel",
        api.created(
                "POST",
                "/api/v1/calendar/labels",
                owner,
                "{\"name\":\"" + marker + "-cal\",\"color\":\"#2878D5\"}")
            .get("id")
            .asText());
    api.created(
        "PUT",
        "/api/v1/calendar/days/2026-09-01",
        owner,
        "{\"note\":\"" + marker + "\",\"labels\":[{\"labelId\":\"" + ids.get("calendarLabel") + "\"}]}");
  }

  List<String> ownerViews() {
    String board = "/api/v1/boards/" + ids.get("board");
    return List.of(
            "/api/v1/paths/" + ids.get("path"),
            "/api/v1/activities?pathId=" + ids.get("path"),
            "/api/v1/notes/" + ids.get("note"),
            "/api/v1/logs/" + ids.get("log"),
            "/api/v1/labels",
            board,
            board + "/statuses",
            board + "/cards/" + ids.get("card"),
            "/api/v1/time-entries/" + ids.get("entry"),
            "/api/v1/calendar/labels",
            "/api/v1/calendar/days?startDate=2026-09-01&endDate=2026-09-01")
        .stream()
        .map(
            path -> {
              ApiClient.Reply reply = api.get(path, owner);
              assertEquals(200, reply.status(), path + " " + reply.body());
              return path + " " + reply.body();
            })
        .toList();
  }

  static boolean refused(int status) {
    return status >= 400 && status < 500 && status != 401;
  }

  // TH-07
  @Test
  void intruderCannotReadChangeOrDeleteOwnedResources() {
    String intruderPath =
        api.created("POST", "/api/v1/paths", intruder, "{\"name\":\"Mine\"}").get("id").asText();
    String intruderBoard =
        api.created("POST", "/api/v1/boards", intruder, "{\"name\":\"Mine\"}").get("id").asText();
    String board = "/api/v1/boards/" + ids.get("board");
    String card = board + "/cards/" + ids.get("card");
    String status = ids.get("status");
    List<String[]> attempts =
        List.of(
            new String[] {"GET", "/api/v1/paths/" + ids.get("path"), null},
            new String[] {"GET", "/api/v1/paths/" + ids.get("path") + "/summary", null},
            new String[] {"PUT", "/api/v1/paths/" + ids.get("path"), "{\"name\":\"Taken\"}"},
            new String[] {"POST", "/api/v1/paths/" + ids.get("path") + "/pin", "{\"pinned\":true}"},
            new String[] {
              "POST",
              "/api/v1/paths/" + ids.get("path") + "/merge",
              "{\"targetPathId\":\"" + intruderPath + "\"}"
            },
            new String[] {
              "POST",
              "/api/v1/paths/" + intruderPath + "/merge",
              "{\"targetPathId\":\"" + ids.get("path") + "\"}"
            },
            new String[] {"DELETE", "/api/v1/paths/" + ids.get("path"), null},
            new String[] {"POST", "/api/v1/paths/" + ids.get("path") + "/restore", "{}"},
            new String[] {"GET", "/api/v1/notes/" + ids.get("note"), null},
            new String[] {"PUT", "/api/v1/notes/" + ids.get("note"), "{\"content\":\"<p>Taken</p>\"}"},
            new String[] {"POST", "/api/v1/notes/" + ids.get("note") + "/pin", "{\"pinned\":true}"},
            new String[] {"DELETE", "/api/v1/notes/" + ids.get("note"), null},
            new String[] {"POST", "/api/v1/notes/" + ids.get("note") + "/restore", "{}"},
            new String[] {"GET", "/api/v1/logs/" + ids.get("log"), null},
            new String[] {
              "PUT",
              "/api/v1/logs/" + ids.get("log"),
              "{\"body\":\"Taken\",\"occurredAt\":\"2026-09-01T09:00:00Z\"}"
            },
            new String[] {"PUT", "/api/v1/logs/" + ids.get("log") + "/labels", "{\"labelIds\":[]}"},
            new String[] {"DELETE", "/api/v1/logs/" + ids.get("log"), null},
            new String[] {
              "PUT", "/api/v1/labels/" + ids.get("label"), "{\"name\":\"Taken\",\"scopes\":[\"NOTE\"]}"
            },
            new String[] {"DELETE", "/api/v1/labels/" + ids.get("label"), null},
            new String[] {"DELETE", "/api/v1/labels/" + ids.get("label") + "?removeAssignments=true", null},
            new String[] {"GET", board, null},
            new String[] {"PUT", board, "{\"name\":\"Taken\"}"},
            new String[] {"POST", board + "/pin", "{\"pinned\":true}"},
            new String[] {"POST", board + "/visibility", "{\"hidden\":true}"},
            new String[] {"POST", board + "/archive", "{}"},
            new String[] {"GET", board + "/statuses", null},
            new String[] {"POST", board + "/statuses", "{\"name\":\"Taken\"}"},
            new String[] {"PUT", board + "/statuses/" + status, "{\"name\":\"Taken\"}"},
            new String[] {"POST", board + "/statuses/" + status + "/archive", "{}"},
            new String[] {"GET", board + "/cards", null},
            new String[] {"GET", board + "/cards/page?statusId=" + status, null},
            new String[] {"GET", board + "/gantt?from=2026-08-01&to=2026-10-31", null},
            new String[] {"POST", board + "/cards", "{\"title\":\"Planted\"}"},
            new String[] {"GET", card, null},
            new String[] {"PUT", card, "{\"title\":\"Taken\"}"},
            new String[] {"POST", card + "/move", "{\"statusId\":\"" + status + "\",\"position\":0}"},
            new String[] {"POST", card + "/transfer", "{\"boardId\":\"" + intruderBoard + "\"}"},
            new String[] {"POST", card + "/archive", "{}"},
            new String[] {"GET", "/api/v1/boards/" + intruderBoard + "/cards/" + ids.get("card"), null},
            new String[] {
              "PUT", "/api/v1/boards/" + intruderBoard + "/cards/" + ids.get("card"), "{\"title\":\"Taken\"}"
            },
            new String[] {"GET", "/api/v1/time-entries/" + ids.get("entry"), null},
            new String[] {
              "PUT",
              "/api/v1/time-entries/" + ids.get("entry"),
              "{\"labelIds\":[],\"startedAt\":\"2026-09-01T09:00:00Z\",\"endedAt\":\"2026-09-01T11:00:00Z\"}"
            },
            new String[] {"DELETE", "/api/v1/time-entries/" + ids.get("entry"), null},
            new String[] {"PUT", "/api/v1/timers/" + ids.get("entry"), "{\"labelIds\":[],\"startedAt\":\"2026-09-01T09:00:00Z\"}"},
            new String[] {"POST", "/api/v1/timers/" + ids.get("entry") + "/stop", "{}"},
            new String[] {"POST", "/api/v1/timers/" + ids.get("entry") + "/cancel", "{}"},
            new String[] {
              "PUT",
              "/api/v1/calendar/labels/" + ids.get("calendarLabel"),
              "{\"name\":\"Taken\",\"color\":\"#2878D5\"}"
            },
            new String[] {"DELETE", "/api/v1/calendar/labels/" + ids.get("calendarLabel"), null});
    List<String> before = ownerViews();
    List<String> failures = new ArrayList<>();
    for (String[] attempt : attempts) {
      ApiClient.Reply reply = api.send(attempt[0], attempt[1], intruder, attempt[2]);
      if (!refused(reply.status()) || reply.body().contains(marker))
        failures.add(attempt[0] + " " + attempt[1] + " -> " + reply.status() + " " + reply.body());
    }
    assertTrue(failures.isEmpty(), "Intruder was not refused:\n" + String.join("\n", failures));
    assertEquals(before, ownerViews(), "Owner data changed after refused attempts");
  }

  @Test
  void foreignAndMissingDirectIdsHaveTheSameNotFoundResponse() {
    String board = "/api/v1/boards/" + ids.get("board");
    String[][] operations = {
      {"GET", "/api/v1/paths/{id}", ids.get("path"), null},
      {"GET", "/api/v1/notes/{id}", ids.get("note"), null},
      {"GET", "/api/v1/logs/{id}", ids.get("log"), null},
      {"PUT", "/api/v1/labels/{id}", ids.get("label"), "{\"name\":\"Hidden\",\"scopes\":[\"NOTE\"]}"},
      {"GET", "/api/v1/boards/{id}", ids.get("board"), null},
      {"PUT", board + "/statuses/{id}", ids.get("status"), "{\"name\":\"Hidden\"}"},
      {"GET", board + "/cards/{id}", ids.get("card"), null},
      {"GET", "/api/v1/time-entries/{id}", ids.get("entry"), null},
      {"PUT", "/api/v1/timers/{id}", ids.get("entry"), "{\"labelIds\":[],\"startedAt\":\"2026-09-01T09:00:00Z\"}"},
      {"PUT", "/api/v1/calendar/labels/{id}", ids.get("calendarLabel"), "{\"name\":\"Hidden\",\"color\":\"#2878D5\"}"}
    };
    List<String> before = ownerViews();
    List<String> failures = new ArrayList<>();

    for (String[] operation : operations) {
      String template = operation[1];
      String foreignPath = template.replace("{id}", operation[2]);
      String missingPath = template.replace("{id}", UUID.randomUUID().toString());
      ApiClient.Reply foreign = api.send(operation[0], foreignPath, intruder, operation[3]);
      ApiClient.Reply missing = api.send(operation[0], missingPath, intruder, operation[3]);
      if (foreign.status() != 404 || missing.status() != 404)
        failures.add(operation[0] + " " + template + " -> foreign " + foreign.status() + ", missing " + missing.status());
    }

    assertTrue(failures.isEmpty(), "Foreign and missing IDs differed:\n" + String.join("\n", failures));
    assertEquals(before, ownerViews(), "Owner data changed after foreign-ID requests");
  }

  // TH-07: another user's ids cannot be attached to the intruder's own data.
  @Test
  void intruderCannotReferenceOwnedResourcesFromTheirOwnData() {
    String intruderBoard =
        api.created("POST", "/api/v1/boards", intruder, "{\"name\":\"Mine\"}").get("id").asText();
    String intruderLog =
        api.created(
                "POST",
                "/api/v1/logs",
                intruder,
                "{\"body\":\"Mine\",\"occurredAt\":\"2026-09-01T09:00:00Z\"}")
            .get("id")
            .asText();
    String cards = "/api/v1/boards/" + intruderBoard + "/cards";
    String intruderCard = api.created("POST", cards, intruder, "{\"title\":\"Mine\"}").get("id").asText();
    List<String[]> attempts =
        List.of(
            new String[] {
              "POST",
              "/api/v1/time-entries",
              "{\"pathId\":\"" + ids.get("path")
                  + "\",\"labelIds\":[],\"startedAt\":\"2026-09-02T09:00:00Z\",\"endedAt\":\"2026-09-02T10:00:00Z\"}"
            },
            new String[] {
              "POST",
              "/api/v1/time-entries",
              "{\"labelIds\":[\"" + ids.get("label")
                  + "\"],\"startedAt\":\"2026-09-02T09:00:00Z\",\"endedAt\":\"2026-09-02T10:00:00Z\"}"
            },
            new String[] {"POST", "/api/v1/timers", "{\"pathId\":\"" + ids.get("path") + "\",\"labelIds\":[]}"},
            new String[] {"POST", "/api/v1/timers", "{\"labelIds\":[\"" + ids.get("label") + "\"]}"},
            new String[] {
              "POST", "/api/v1/notes", "{\"pathId\":\"" + ids.get("path") + "\",\"content\":\"<p>Mine</p>\"}"
            },
            new String[] {
              "POST", "/api/v1/notes", "{\"timeEntryId\":\"" + ids.get("entry") + "\",\"content\":\"<p>Mine</p>\"}"
            },
            new String[] {
              "POST", "/api/v1/notes", "{\"activityId\":\"" + ids.get("activity") + "\",\"content\":\"<p>Mine</p>\"}"
            },
            new String[] {
              "PUT", "/api/v1/logs/" + intruderLog + "/labels", "{\"labelIds\":[\"" + ids.get("label") + "\"]}"
            },
            new String[] {"POST", cards, "{\"title\":\"Mine\",\"pathIds\":[\"" + ids.get("path") + "\"]}"},
            new String[] {"POST", cards, "{\"title\":\"Mine\",\"labelIds\":[\"" + ids.get("label") + "\"]}"},
            new String[] {"POST", cards, "{\"title\":\"Mine\",\"statusId\":\"" + ids.get("status") + "\"}"},
            new String[] {
              "POST",
              cards + "/" + intruderCard + "/move",
              "{\"statusId\":\"" + ids.get("status") + "\",\"position\":0}"
            },
            new String[] {
              "POST", cards + "/" + intruderCard + "/transfer", "{\"boardId\":\"" + ids.get("board") + "\"}"
            },
            new String[] {
              "PUT",
              "/api/v1/calendar/days/2026-09-02",
              "{\"labels\":[{\"labelId\":\"" + ids.get("calendarLabel") + "\"}]}"
            },
            new String[] {
              "PUT",
              "/api/v1/calendar/days/range",
              "{\"startDate\":\"2026-09-03\",\"endDate\":\"2026-09-04\",\"labels\":[{\"labelId\":\""
                  + ids.get("calendarLabel") + "\"}]}"
            });
    List<String> before = ownerViews();
    List<String> failures = new ArrayList<>();
    for (String[] attempt : attempts) {
      ApiClient.Reply reply = api.send(attempt[0], attempt[1], intruder, attempt[2]);
      if (!refused(reply.status()))
        failures.add(attempt[0] + " " + attempt[1] + " " + attempt[2] + " -> " + reply.status() + " " + reply.body());
    }
    assertTrue(failures.isEmpty(), "Foreign reference accepted:\n" + String.join("\n", failures));
    assertEquals(before, ownerViews(), "Owner data changed after refused attempts");
    String board = api.get("/api/v1/boards/" + ids.get("board") + "/cards", owner).body();
    assertTrue(!board.contains(intruderCard), "Intruder card landed on the owner's board");
  }

  // TH-08
  @Test
  void listsAndSearchNeverLeakOtherUsersRows() {
    List<String> reads =
        List.of(
            "/api/v1/paths",
            "/api/v1/notes",
            "/api/v1/notes?q=" + marker,
            "/api/v1/notes?archived=true",
            "/api/v1/notes/labels",
            "/api/v1/logs",
            "/api/v1/labels",
            "/api/v1/labels?scope=BOARD",
            "/api/v1/boards",
            "/api/v1/boards?archived=true",
            "/api/v1/boards/all/columns",
            "/api/v1/boards/all/gantt?from=2026-08-01&to=2026-10-31",
            "/api/v1/time-entries",
            "/api/v1/timers/current",
            "/api/v1/timers/draft",
            "/api/v1/statistics",
            "/api/v1/calendar/labels",
            "/api/v1/calendar/days?startDate=2026-08-01&endDate=2026-10-31",
            "/api/v1/search?q=" + marker,
            "/api/v1/activities",
            "/api/v1/reports?period=MONTH&anchor=2026-09-01",
            "/api/v1/reports?period=MONTH&anchor=2026-09-01&pathId=" + ids.get("path"),
            "/api/v1/imports/knowledge-base/export",
            "/api/v1/imports/knowledge-base/batches",
            "/api/v1/imports/clockify/batches",
            "/api/v1/preferences");
    List<String> failures = new ArrayList<>();
    for (String read : reads) {
      ApiClient.Reply reply = api.get(read, intruder);
      if (reply.status() >= 500) failures.add(read + " -> " + reply.status());
      if (reply.body().contains(marker)) failures.add(read + " leaked the owner's text");
      for (var id : ids.entrySet())
        if (reply.body().contains(id.getValue()))
          failures.add(read + " leaked the owner's " + id.getKey() + " id");
    }
    assertTrue(failures.isEmpty(), String.join("\n", failures));
    // The owner does see their own rows through the same reads.
    JsonNode search = api.get("/api/v1/search?q=" + marker, owner).json();
    assertTrue(search.get("groups").size() > 0, "Owner search should find their own rows");
  }
}
