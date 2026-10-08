package com.know.integration;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.web.server.LocalServerPort;

/** Note and card responses carry a per-line edit time that survives saves of untouched lines. */
class LineEditsIntegrationTest extends IntegrationTestSupport {
  @LocalServerPort int port;
  ApiClient api;

  @BeforeEach
  void setUp() {
    api = new ApiClient(port);
  }

  private static String doc(String... paragraphs) {
    StringBuilder json = new StringBuilder("{\\\"type\\\":\\\"doc\\\",\\\"content\\\":[");
    for (int i = 0; i < paragraphs.length; i++) {
      if (i > 0) json.append(',');
      json.append("{\\\"type\\\":\\\"paragraph\\\",\\\"content\\\":[{\\\"type\\\":\\\"text\\\",\\\"text\\\":\\\"")
          .append(paragraphs[i])
          .append("\\\"}]}");
    }
    return json.append("]}").toString();
  }

  @Test
  void noteSavesRestampOnlyEditedLines() throws Exception {
    String token = api.register();
    JsonNode created =
        api.created("POST", "/api/v1/notes", token, "{\"title\":\"Plan\",\"content\":\"" + doc("One", "Two", "Three") + "\"}");
    String id = created.get("id").asText();
    JsonNode before = api.get("/api/v1/notes/" + id, token).json();
    assertEquals(3, before.get("lineEdits").size());

    Thread.sleep(5);
    JsonNode renamed =
        api.put("/api/v1/notes/" + id, token, "{\"title\":\"Renamed\",\"content\":\"" + doc("One", "Two", "Three") + "\",\"version\":" + before.get("version") + "}").json();
    assertEquals(before.get("lineEdits"), renamed.get("lineEdits"));

    Thread.sleep(5);
    JsonNode edited =
        api.put("/api/v1/notes/" + id, token, "{\"title\":\"Renamed\",\"content\":\"" + doc("One", "Two!", "Three") + "\",\"version\":" + api.get("/api/v1/notes/" + id, token).json().get("version") + "}").json();
    JsonNode times = edited.get("lineEdits");
    assertEquals(before.get("lineEdits").get(0), times.get(0));
    assertNotEquals(before.get("lineEdits").get(1), times.get(1));
    assertEquals(before.get("lineEdits").get(2), times.get(2));
    assertEquals(times, api.get("/api/v1/notes/" + id, token).json().get("lineEdits"));
  }

  @Test
  void cardSavesRestampOnlyEditedLines() throws Exception {
    String token = api.register();
    String boardId = api.created("POST", "/api/v1/boards", token, "{\"name\":\"Lines\"}").get("id").asText();
    JsonNode card =
        api.created("POST", "/api/v1/boards/" + boardId + "/cards", token, "{\"title\":\"Card\",\"body\":\"" + doc("A", "B") + "\"}");
    assertEquals(2, card.get("lineEdits").size());

    Thread.sleep(5);
    JsonNode edited =
        api.put("/api/v1/boards/" + boardId + "/cards/" + card.get("id").asText(), token, "{\"title\":\"Card\",\"body\":\"" + doc("A", "B", "C") + "\"}").json();
    JsonNode times = edited.get("lineEdits");
    assertEquals(card.get("lineEdits").get(0), times.get(0));
    assertEquals(card.get("lineEdits").get(1), times.get(1));
    assertNotEquals(card.get("lineEdits").get(1), times.get(2));
  }
}
