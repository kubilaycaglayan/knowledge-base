package com.know.integration;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.web.server.LocalServerPort;

/** Document notes store Tiptap JSON and derive their searchable plain-text copy on the server. */
class NoteContentIntegrationTest extends IntegrationTestSupport {
  @LocalServerPort int port;
  ApiClient api;

  @BeforeEach
  void setUp() {
    api = new ApiClient(port);
  }

  @Test
  void richTextCreationPersistsDocumentAndDerivesContentTextFromIt() throws Exception {
    String token = api.register();
    String content =
        "{\"type\":\"doc\",\"content\":["
            + "{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"First paragraph\"}]},"
            + "{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Second paragraph\"}]}]}";
    String body =
        "{\"title\":\"Rich document\",\"content\":"
            + ApiClient.MAPPER.writeValueAsString(content)
            + ",\"contentText\":\"client supplied stale copy\"}";

    JsonNode created = api.created("POST", "/api/v1/notes", token, body);
    String id = created.get("id").asText();
    assertEquals(content, created.get("content").asText());
    assertEquals("First paragraph\nSecond paragraph", created.get("contentText").asText());
    assertNotEquals("client supplied stale copy", created.get("contentText").asText());
    assertEquals(2, created.get("lineEdits").size());

    JsonNode persisted = api.get("/api/v1/notes/" + id, token).json();
    assertEquals(content, persisted.get("content").asText());
    assertEquals("First paragraph\nSecond paragraph", persisted.get("contentText").asText());
  }
}
