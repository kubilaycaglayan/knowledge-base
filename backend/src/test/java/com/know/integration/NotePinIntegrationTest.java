package com.know.integration;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.web.server.LocalServerPort;

/** Pin and unpin transitions persist state, increment the note version, and maintain ordering. */
class NotePinIntegrationTest extends IntegrationTestSupport {
  @LocalServerPort int port;
  ApiClient api;

  @BeforeEach
  void setUp() {
    api = new ApiClient(port);
  }

  private JsonNode pin(String token, String id, boolean pinned) {
    return api.created(
        "POST",
        "/api/v1/notes/" + id + "/pin",
        token,
        "{\"pinned\":" + pinned + "}");
  }

  private List<String> pinnedTitles(String token) {
    List<String> titles = new ArrayList<>();
    api.get("/api/v1/notes", token)
        .json()
        .forEach(note -> {
          if (note.get("pinned").asBoolean()) titles.add(note.get("title").asText());
        });
    return titles;
  }

  @Test
  void pinAndUnpinPersistStateIncrementVersionAndPlaceRepinnedNoteAtTheEnd() {
    String token = api.register();
    JsonNode a = api.created("POST", "/api/v1/notes", token, "{\"title\":\"A\",\"content\":\"a\"}");
    JsonNode b = api.created("POST", "/api/v1/notes", token, "{\"title\":\"B\",\"content\":\"b\"}");
    String aId = a.get("id").asText();
    String bId = b.get("id").asText();

    JsonNode pinnedA = pin(token, aId, true);
    assertTrue(pinnedA.get("pinned").asBoolean());
    assertEquals(a.get("version").asLong() + 1, pinnedA.get("version").asLong());
    assertTrue(api.get("/api/v1/notes/" + aId, token).json().get("pinned").asBoolean());

    JsonNode pinnedB = pin(token, bId, true);
    assertTrue(pinnedB.get("pinned").asBoolean());
    assertEquals(List.of("A", "B"), pinnedTitles(token));

    JsonNode unpinnedA = pin(token, aId, false);
    assertFalse(unpinnedA.get("pinned").asBoolean());
    assertEquals(pinnedA.get("version").asLong() + 1, unpinnedA.get("version").asLong());
    JsonNode persistedUnpinned = api.get("/api/v1/notes/" + aId, token).json();
    assertFalse(persistedUnpinned.get("pinned").asBoolean());
    assertEquals(unpinnedA.get("version"), persistedUnpinned.get("version"));
    assertEquals(List.of("B"), pinnedTitles(token));

    JsonNode repinnedA = pin(token, aId, true);
    assertTrue(repinnedA.get("pinned").asBoolean());
    assertEquals(unpinnedA.get("version").asLong() + 1, repinnedA.get("version").asLong());
    assertEquals(List.of("B", "A"), pinnedTitles(token));
  }
}
