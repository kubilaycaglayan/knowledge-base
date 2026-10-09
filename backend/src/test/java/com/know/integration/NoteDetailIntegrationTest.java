package com.know.integration;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.web.server.LocalServerPort;

/** Direct note detail reads enforce ownership and expose the persisted note. */
class NoteDetailIntegrationTest extends IntegrationTestSupport {
  @LocalServerPort int port;
  ApiClient api;

  @BeforeEach
  void setUp() {
    api = new ApiClient(port);
  }

  @Test
  void noteDetailReturnsOwnedNoteAndHidesMissingForeignAndArchivedIds() {
    String owner = api.register();
    String other = api.register();
    JsonNode created =
        api.created(
            "POST",
            "/api/v1/notes",
            owner,
            "{\"title\":\"Owned detail\",\"content\":\"Persisted body\",\"contentText\":\"Persisted body\"}");
    String id = created.get("id").asText();

    ApiClient.Reply read = api.get("/api/v1/notes/" + id, owner);
    assertEquals(200, read.status(), read.body());
    assertEquals(id, read.json().get("id").asText());
    assertEquals("Owned detail", read.json().get("title").asText());
    assertEquals("Persisted body", read.json().get("content").asText());
    assertEquals("Persisted body", read.json().get("contentText").asText());
    assertEquals(created.get("version").asLong(), read.json().get("version").asLong());

    assertEquals(404, api.get("/api/v1/notes/" + id, other).status());
    assertEquals(404, api.get("/api/v1/notes/" + UUID.randomUUID(), owner).status());
    assertEquals(204, api.delete("/api/v1/notes/" + id, owner).status());
    assertEquals(404, api.get("/api/v1/notes/" + id, owner).status());
  }
}
