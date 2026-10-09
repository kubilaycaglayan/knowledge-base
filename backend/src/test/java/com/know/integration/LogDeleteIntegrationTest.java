package com.know.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.web.server.LocalServerPort;

/** Log deletion is permanent and remains owner-scoped. */
class LogDeleteIntegrationTest extends IntegrationTestSupport {
  @LocalServerPort int port;
  ApiClient api;

  @BeforeEach
  void setUp() {
    api = new ApiClient(port);
  }

  @Test
  void deleteRemovesOwnedLogAndForeignDeleteLeavesItReadable() {
    String owner = api.register();
    String other = api.register();
    JsonNode created =
        api.created(
            "POST",
            "/api/v1/logs",
            owner,
            "{\"body\":\"Delete me\",\"occurredAt\":\"2026-09-11T10:15:00Z\"}");
    String id = created.get("id").asText();

    assertEquals(404, api.delete("/api/v1/logs/" + id, other).status());
    assertEquals(200, api.get("/api/v1/logs/" + id, owner).status());
    assertEquals(204, api.delete("/api/v1/logs/" + id, owner).status());
    assertEquals(404, api.get("/api/v1/logs/" + id, owner).status());
    assertEquals(404, api.delete("/api/v1/logs/" + id, owner).status());
  }
}
