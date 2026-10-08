package com.know.integration;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
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
  void consecutiveSavesWithTheReturnedVersionSucceed() {
    String token = api.register();
    JsonNode created = api.created("POST", "/api/v1/notes", token, "{\"title\":\"Draft\",\"content\":\"one\"}");
    String id = created.get("id").asText();

    ApiClient.Reply first = api.put("/api/v1/notes/" + id, token, "{\"title\":\"Draft\",\"content\":\"two\",\"version\":" + created.get("version") + "}");
    assertEquals(200, first.status(), first.toString());
    assertEquals(api.get("/api/v1/notes/" + id, token).json().get("version"), first.json().get("version"));

    ApiClient.Reply second = api.put("/api/v1/notes/" + id, token, "{\"title\":\"Draft\",\"content\":\"three\",\"version\":" + first.json().get("version") + "}");
    assertEquals(200, second.status(), second.toString());
  }
}
