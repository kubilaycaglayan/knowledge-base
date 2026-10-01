package com.know.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.web.server.LocalServerPort;

/** Bad input answers 400, never 500 (docs/test-hardening-plan.md, TH-09 and TH-10). */
class InputValidationIntegrationTest extends IntegrationTestSupport {
  @LocalServerPort int port;
  ApiClient api;
  String token;

  @BeforeEach
  void setUp() {
    api = new ApiClient(port);
    token = api.register();
  }

  List<String> notBadRequest(List<String[]> requests) {
    List<String> failures = new ArrayList<>();
    for (String[] request : requests) {
      ApiClient.Reply reply = api.send(request[0], request[1], token, request[2]);
      if (reply.status() != 400)
        failures.add(request[0] + " " + request[1] + " -> " + reply.status() + " " + reply.body());
    }
    return failures;
  }

  // TH-09
  @Test
  void malformedRequestsAnswerBadRequest() {
    String board = api.created("POST", "/api/v1/boards", token, "{\"name\":\"Board\"}").get("id").asText();
    List<String> failures =
        notBadRequest(
            List.of(
                new String[] {"POST", "/api/v1/paths", "{"},
                new String[] {"POST", "/api/v1/paths", "[]"},
                new String[] {"POST", "/api/v1/paths", "{\"name\":{\"nested\":true}}"},
                new String[] {"POST", "/api/v1/logs", "{\"body\":\"Text\",\"occurredAt\":\"yesterday\"}"},
                new String[] {"GET", "/api/v1/paths/not-a-uuid", null},
                new String[] {"GET", "/api/v1/logs/not-a-uuid", null},
                new String[] {"DELETE", "/api/v1/notes/not-a-uuid", null},
                new String[] {"GET", "/api/v1/boards/" + board + "/cards/not-a-uuid", null},
                new String[] {"GET", "/api/v1/labels?scope=NOPE", null},
                new String[] {"GET", "/api/v1/activities?type=NOPE", null},
                new String[] {"GET", "/api/v1/activities?from=yesterday", null},
                new String[] {"PUT", "/api/v1/calendar/days/2026-02-30", "{\"labels\":[]}"},
                new String[] {"GET", "/api/v1/calendar/days?startDate=x&endDate=y", null},
                new String[] {"GET", "/api/v1/calendar/days", null},
                new String[] {"GET", "/api/v1/boards/all/gantt", null},
                new String[] {
                  "POST", "/api/v1/boards/" + board + "/cards", "{\"title\":\"Card\",\"priority\":\"NOPE\"}"
                },
                new String[] {"PUT", "/api/v1/preferences", "{\"theme\":\"sepia\"}"},
                new String[] {"POST", "/api/v1/paths", "{\"name\":\"Path\",\"color\":\"red\"}"},
                new String[] {
                  "POST",
                  "/api/v1/time-entries",
                  "{\"labelIds\":[],\"startedAt\":\"2026-09-01T10:00:00Z\",\"endedAt\":\"2026-09-01T09:00:00Z\"}"
                },
                new String[] {"POST", "/api/v1/time-entries", "{\"startedAt\":\"2026-09-01T10:00:00Z\"}"}));
    assertTrue(failures.isEmpty(), "Expected 400:\n" + String.join("\n", failures));

    ApiClient.Reply wrongType =
        api.send("POST", "/api/v1/imports/knowledge-base", token, "{\"not\":\"csv\"}");
    assertEquals(415, wrongType.status(), wrongType.body());
  }

  // TH-10
  @Test
  void oversizedTextIsRejected() {
    List<String> failures =
        notBadRequest(
            List.of(
                new String[] {
                  "POST",
                  "/api/v1/logs",
                  "{\"body\":\"" + "x".repeat(20001) + "\",\"occurredAt\":\"2026-09-01T09:00:00Z\"}"
                },
                new String[] {"POST", "/api/v1/paths", "{\"name\":\"" + "p".repeat(161) + "\"}"},
                new String[] {"POST", "/api/v1/boards", "{\"name\":\"" + "b".repeat(121) + "\"}"},
                new String[] {"POST", "/api/v1/labels", "{\"name\":\"" + "l".repeat(81) + "\"}"},
                new String[] {"POST", "/api/v1/notes", "{\"content\":\"" + "n".repeat(200001) + "\"}"},
                new String[] {"GET", "/api/v1/search?q=" + "q".repeat(2001), null},
                new String[] {
                  "POST",
                  "/api/v1/timers",
                  "{\"labelIds\":[],\"description\":\"" + "d".repeat(5001) + "\"}"
                }));
    assertTrue(failures.isEmpty(), "Expected 400:\n" + String.join("\n", failures));
    assertEquals(
        201,
        api.send(
                "POST",
                "/api/v1/logs",
                token,
                "{\"body\":\"" + "x".repeat(20000) + "\",\"occurredAt\":\"2026-09-01T09:00:00Z\"}")
            .status(),
        "The limit itself is accepted");
    String current = api.get("/api/v1/timers/current", token).body();
    assertTrue(current.isBlank() || current.equals("null"), "A rejected start left a timer: " + current);
  }
}
