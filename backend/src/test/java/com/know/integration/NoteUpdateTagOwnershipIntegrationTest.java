package com.know.integration;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.web.server.LocalServerPort;

/** Note updates resolve free-text tags inside the authenticated user's label catalog. */
class NoteUpdateTagOwnershipIntegrationTest extends IntegrationTestSupport {
  @LocalServerPort int port;
  ApiClient api;

  @BeforeEach
  void setUp() {
    api = new ApiClient(port);
  }

  @Test
  void sameNameForeignLabelIsNotReusedByNoteUpdate() {
    String owner = api.register();
    String other = api.register();
    JsonNode foreignLabel =
        api.created(
            "POST",
            "/api/v1/labels",
            other,
            "{\"name\":\"Private label\",\"scopes\":[\"NOTE\"]}");
    JsonNode note =
        api.created(
            "POST", "/api/v1/notes", owner, "{\"title\":\"Draft\",\"content\":\"body\"}");

    ApiClient.Reply updated =
        api.put(
            "/api/v1/notes/" + note.get("id").asText(),
            owner,
            "{\"title\":\"Draft\",\"content\":\"updated body\",\"tags\":[\"Private label\"],\"version\":"
                + note.get("version")
                + "}");
    assertEquals(200, updated.status(), updated.toString());
    assertEquals("Private label", updated.json().get("tags").get(0).asText());

    JsonNode ownerCatalog = api.get("/api/v1/notes/labels", owner).json();
    assertEquals(1, ownerCatalog.size());
    assertEquals("Private label", ownerCatalog.get(0).get("name").asText());
    assertNotEquals(foreignLabel.get("id").asText(), ownerCatalog.get(0).get("id").asText());
    assertEquals(
        foreignLabel.get("id").asText(),
        api.get("/api/v1/notes/labels", other).json().get(0).get("id").asText());
    JsonNode persisted = api.get("/api/v1/notes/" + note.get("id").asText(), owner).json();
    assertEquals(updated.json().get("tags"), persisted.get("tags"));
    assertEquals(updated.json().get("version"), persisted.get("version"));
  }
}
