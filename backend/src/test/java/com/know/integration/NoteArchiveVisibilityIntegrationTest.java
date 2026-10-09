package com.know.integration;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.web.server.LocalServerPort;

/** Deleting a note archives it and changes active, archived, and detail reads. */
class NoteArchiveVisibilityIntegrationTest extends IntegrationTestSupport {
  @LocalServerPort int port;
  ApiClient api;

  @BeforeEach
  void setUp() {
    api = new ApiClient(port);
  }

  @Test
  void deleteArchivesNoteAndRemovesItFromActiveAndDetailReads() {
    String token = api.register();
    JsonNode note =
        api.created(
            "POST", "/api/v1/notes", token, "{\"title\":\"Archive me\",\"content\":\"body\"}");
    String id = note.get("id").asText();

    assertEquals(204, api.delete("/api/v1/notes/" + id, token).status());
    JsonNode active = api.get("/api/v1/notes", token).json();
    assertTrue(active.isArray());
    assertFalse(active.toString().contains(id));
    assertEquals(404, api.get("/api/v1/notes/" + id, token).status());

    JsonNode archived = api.get("/api/v1/notes?archived=true&page=0&size=20", token).json();
    assertEquals(1, archived.get("totalItems").asLong());
    assertEquals(id, archived.get("items").get(0).get("id").asText());
    assertFalse(archived.get("items").get(0).get("deletedAt").isNull());
  }
}
