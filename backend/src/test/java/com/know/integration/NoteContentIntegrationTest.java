package com.know.integration;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;
import java.util.Map;
import java.util.Random;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;

/** Document notes store Tiptap JSON and derive their searchable plain-text copy on the server. */
class NoteContentIntegrationTest extends IntegrationTestSupport {
  @LocalServerPort int port;
  @Autowired JdbcTemplate jdbc;
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

  @Test
  void noteBodyOfTwentyThousandCharactersPersistsAndUpdates() throws Exception {
    String token = api.register();
    String text = "n".repeat(20_000);
    String content =
        "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":"
            + ApiClient.MAPPER.writeValueAsString(text)
            + "}]}]}";
    String body =
        "{\"title\":\"Long note\",\"content\":"
            + ApiClient.MAPPER.writeValueAsString(content)
            + ",\"contentText\":"
            + ApiClient.MAPPER.writeValueAsString(text)
            + "}";

    JsonNode created = api.created("POST", "/api/v1/notes", token, body);
    String id = created.get("id").asText();
    assertEquals(content, created.get("content").asText());
    assertEquals(text, created.get("contentText").asText());

    JsonNode persisted = api.get("/api/v1/notes/" + id, token).json();
    assertEquals(content, persisted.get("content").asText());
    assertEquals(text, persisted.get("contentText").asText());

    String updatedText = "u".repeat(20_000);
    String updatedContent =
        "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":"
            + ApiClient.MAPPER.writeValueAsString(updatedText)
            + "}]}]}";
    String update =
        "{\"title\":\"Long note\",\"content\":"
            + ApiClient.MAPPER.writeValueAsString(updatedContent)
            + ",\"contentText\":"
            + ApiClient.MAPPER.writeValueAsString(updatedText)
            + ",\"version\":"
            + persisted.get("version").asLong()
            + "}";

    JsonNode saved = api.put("/api/v1/notes/" + id, token, update).json();
    assertEquals(updatedContent, saved.get("content").asText());
    assertEquals(updatedText, saved.get("contentText").asText());
    JsonNode reloaded = api.get("/api/v1/notes/" + id, token).json();
    assertEquals(updatedContent, reloaded.get("content").asText());
    assertEquals(updatedText, reloaded.get("contentText").asText());
  }

  @Test
  @EnabledIfEnvironmentVariable(named = "KB_TEST_POSTGRES_URL", matches = ".+")
  void postgresPersistsAnIncompressibleTwentyThousandCharacterNoteUpdate() throws Exception {
    String token = api.register();
    JsonNode created = api.created("POST", "/api/v1/notes", token,
        "{\"title\":\"Long note\",\"content\":\"Initial body\"}");
    String id = created.get("id").asText();
    String alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    Random random = new Random(42);
    StringBuilder text = new StringBuilder(20_000);
    while (text.length() < 20_000) text.append(alphabet.charAt(random.nextInt(alphabet.length())));
    String body = text.toString();
    String document = ApiClient.MAPPER.writeValueAsString(Map.of(
        "type", "doc",
        "content", java.util.List.of(Map.of("type", "paragraph", "content",
            java.util.List.of(Map.of("type", "text", "text", body))))));
    String request = ApiClient.MAPPER.writeValueAsString(Map.of(
        "title", "Long note", "content", document, "contentText", body,
        "version", created.get("version").asLong()));

    ApiClient.Reply saved = api.put("/api/v1/notes/" + id, token, request);
    assertEquals(200, saved.status(), "PostgreSQL must accept a 20,000-character note update");
    assertEquals(body, saved.json().get("contentText").asText());
    assertEquals(body, api.get("/api/v1/notes/" + id, token).json().get("contentText").asText());
  }

  @Test
  @EnabledIfEnvironmentVariable(named = "KB_TEST_POSTGRES_URL", matches = ".+")
  void postgresLongUnicodeNotesRemainSearchableAndPrivate() throws Exception {
    String token = api.register();
    String otherToken = api.register();
    String marker = "quokkanotemark";
    Random random = new Random(184);
    StringBuilder text = new StringBuilder(marker);
    while (text.length() < 20_000) text.append((char) (0x4e00 + random.nextInt(20_000)));
    String body = text.toString();
    String document = ApiClient.MAPPER.writeValueAsString(Map.of(
        "type", "doc", "content", List.of(Map.of("type", "paragraph", "content",
            List.of(Map.of("type", "text", "text", body))))));
    String request = ApiClient.MAPPER.writeValueAsString(Map.of(
        "title", "Unicode note", "content", document, "contentText", body));

    JsonNode created = api.created("POST", "/api/v1/notes", token, request);
    String id = created.get("id").asText();
    assertEquals(body, api.get("/api/v1/notes/" + id, token).json().get("contentText").asText());
    assertEquals(404, api.get("/api/v1/notes/" + id, otherToken).status());

    String query = "/api/v1/notes?page=0&size=20&q=" + marker;
    ApiClient.Reply ownerNotes = api.get(query, token);
    assertEquals(200, ownerNotes.status());
    assertEquals(id, ownerNotes.json().get("items").get(0).get("id").asText());
    assertEquals(0, api.get(query, otherToken).json().get("items").size());
    String globalQuery = "/api/v1/search?q=" + marker + "&types=NOTE&fuzzy=false";
    JsonNode groups = api.get(globalQuery, token).json().get("groups");
    assertEquals(id, groups.get(0).get("results").get(0).get("id").asText());
    assertEquals(0, api.get(globalQuery, otherToken).json().get("groups").size());

    assertEquals(204, api.delete("/api/v1/notes/" + id, token).status());
    assertEquals(0, api.get(query, token).json().get("items").size());
    assertEquals(id, api.get(query + "&archived=true", token).json()
        .get("items").get(0).get("id").asText());
    assertEquals(0, api.get(query + "&archived=true", otherToken).json().get("items").size());
    assertEquals(204, api.post("/api/v1/notes/" + id + "/restore", token, null).status());

    assertEquals(0, jdbc.queryForObject(
        "select count(*) from pg_indexes where schemaname = current_schema() "
            + "and indexname = 'note_user_content_text_idx'", Integer.class));
    Boolean usesTrigramIndex = jdbc.execute((ConnectionCallback<Boolean>) connection -> {
      try (var statement = connection.createStatement()) {
        statement.execute("set enable_seqscan = off");
        try (var plan = statement.executeQuery(
            "explain select id from note where lower(coalesce(content_text, '')) "
                + "like '%quokkanotemark%'")) {
          while (plan.next()) {
            if (plan.getString(1).contains("note_content_text_search_trgm_idx")) return true;
          }
          return false;
        } finally {
          statement.execute("reset enable_seqscan");
        }
      }
    });
    assertEquals(Boolean.TRUE, usesTrigramIndex);
  }
}
