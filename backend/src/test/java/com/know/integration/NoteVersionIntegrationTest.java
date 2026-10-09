package com.know.integration;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.web.server.LocalServerPort;

/** A note update answers with the version the next update must send. */
class NoteVersionIntegrationTest extends IntegrationTestSupport {
  @LocalServerPort int port;
  ApiClient api;

  @BeforeEach
  void setUp() {
    api = new ApiClient(port);
  }

  @Test
  void consecutiveSavesPersistDocumentFieldsAndRejectAStaleVersion() throws Exception {
    String token = api.register();
    JsonNode created =
        api.created(
            "POST",
            "/api/v1/notes",
            token,
            "{\"title\":\"Draft\",\"content\":\"one\",\"contentText\":\"one\"}");
    String id = created.get("id").asText();

    String document =
        "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Updated body\"}]}]}";
    ApiClient.Reply first =
        api.put(
            "/api/v1/notes/" + id,
            token,
            "{\"title\":\"Updated title\",\"content\":"
                + ApiClient.MAPPER.writeValueAsString(document)
                + ",\"contentText\":\"stale projection\",\"tags\":[\"Updated tag\"],\"version\":"
                + created.get("version")
                + "}");
    assertEquals(200, first.status(), first.toString());
    assertEquals("Updated title", first.json().get("title").asText());
    assertEquals(document, first.json().get("content").asText());
    assertEquals("Updated body", first.json().get("contentText").asText());
    assertEquals("Updated tag", first.json().get("tags").get(0).asText());
    assertEquals(created.get("version").asLong() + 1, first.json().get("version").asLong());
    JsonNode persisted = api.get("/api/v1/notes/" + id, token).json();
    assertEquals(first.json().get("title"), persisted.get("title"));
    assertEquals(first.json().get("content"), persisted.get("content"));
    assertEquals(first.json().get("contentText"), persisted.get("contentText"));
    assertEquals(first.json().get("tags"), persisted.get("tags"));
    assertEquals(first.json().get("version"), persisted.get("version"));

    ApiClient.Reply second =
        api.put(
            "/api/v1/notes/" + id,
            token,
            "{\"title\":\"Final title\",\"content\":\"three\",\"version\":"
                + first.json().get("version")
                + "}");
    assertEquals(200, second.status(), second.toString());
    ApiClient.Reply stale =
        api.put(
            "/api/v1/notes/" + id,
            token,
            "{\"title\":\"Stale title\",\"content\":\"stale body\",\"version\":"
                + created.get("version")
                + "}");
    assertEquals(409, stale.status(), stale.toString());
    JsonNode afterStale = api.get("/api/v1/notes/" + id, token).json();
    assertEquals("Final title", afterStale.get("title").asText());
    assertEquals("three", afterStale.get("content").asText());
    assertEquals(second.json().get("version"), afterStale.get("version"));
  }

  @Test
  void createAndPinAnswerWithTheCurrentVersion() {
    String token = api.register();
    JsonNode created =
        api.created("POST", "/api/v1/notes", token, "{\"title\":\"Draft\",\"content\":\"one\",\"contentText\":\"one\"}");
    String id = created.get("id").asText();
    assertEquals(api.get("/api/v1/notes/" + id, token).json().get("version"), created.get("version"));

    JsonNode pinned = api.created("POST", "/api/v1/notes/" + id + "/pin", token, "{\"pinned\":true}");
    assertEquals(api.get("/api/v1/notes/" + id, token).json().get("version"), pinned.get("version"));
    ApiClient.Reply saved = api.put("/api/v1/notes/" + id, token, "{\"title\":\"Draft\",\"content\":\"two\",\"version\":" + pinned.get("version") + "}");
    assertEquals(200, saved.status(), saved.toString());
  }

  @Test
  void postgresConcurrentNoteWritesKeepTheWinnerAndRejectTheStaleVersion() throws Exception {
    Assumptions.assumeTrue(
        System.getenv("KB_TEST_POSTGRES_URL") != null,
        "This optimistic-write race is PostgreSQL-specific");
    String token = api.register();
    JsonNode created = api.created("POST", "/api/v1/notes", token,
        "{\"title\":\"Concurrent note\",\"content\":\"initial\",\"contentText\":\"initial\",\"tags\":[\"Concurrent tag\"]}");
    String id = created.get("id").asText();
    long version = created.get("version").asLong();
    CountDownLatch ready = new CountDownLatch(2);
    CountDownLatch release = new CountDownLatch(1);
    try (ExecutorService requests = Executors.newFixedThreadPool(2)) {
      Future<ApiClient.Reply> first = requests.submit(() -> updateAtSameVersion(id, token, version, "winner A", ready, release));
      Future<ApiClient.Reply> second = requests.submit(() -> updateAtSameVersion(id, token, version, "winner B", ready, release));
      assertTrue(ready.await(5, TimeUnit.SECONDS));
      release.countDown();
      List<ApiClient.Reply> responses = List.of(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS));
      assertEquals(1, responses.stream().filter(reply -> reply.status() == 200).count(), responses.toString());
      assertEquals(1, responses.stream().filter(reply -> reply.status() == 409).count(), responses.toString());
      JsonNode persisted = api.get("/api/v1/notes/" + id, token).json();
      assertTrue(List.of("winner A", "winner B").contains(persisted.get("contentText").asText()));
      assertEquals(version + 1, persisted.get("version").asLong());
      assertEquals(1, persisted.get("tags").size());
      assertEquals("Concurrent tag", persisted.get("tags").get(0).asText());
    }
  }

  private ApiClient.Reply updateAtSameVersion(
      String id, String token, long version, String value, CountDownLatch ready, CountDownLatch release)
      throws Exception {
    ready.countDown();
    if (!release.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("Concurrent update gate timed out");
    return api.put("/api/v1/notes/" + id, token,
        "{\"title\":\"Concurrent note\",\"content\":" + ApiClient.MAPPER.writeValueAsString(value)
            + ",\"contentText\":" + ApiClient.MAPPER.writeValueAsString(value)
            + ",\"tags\":[\"Concurrent tag\"],\"version\":" + version + "}");
  }
}
