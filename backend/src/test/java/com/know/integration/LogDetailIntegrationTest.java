package com.know.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.web.server.LocalServerPort;

/** Direct log detail reads enforce ownership and hide missing records. */
class LogDetailIntegrationTest extends IntegrationTestSupport {
  @LocalServerPort int port;
  ApiClient api;

  @BeforeEach
  void setUp() {
    api = new ApiClient(port);
  }

  @Test
  void logDetailReturnsOwnedLogAndHidesMissingAndForeignIds() {
    String owner = api.register();
    String other = api.register();
    JsonNode created =
        api.created(
            "POST",
            "/api/v1/logs",
            owner,
            "{\"body\":\"Owned detail\",\"occurredAt\":\"2026-09-11T10:15:00Z\"}");
    String id = created.get("id").asText();

    ApiClient.Reply read = api.get("/api/v1/logs/" + id, owner);
    assertEquals(200, read.status(), read.body());
    assertEquals(id, read.json().get("id").asText());
    assertEquals("Owned detail", read.json().get("body").asText());
    assertEquals("2026-09-11T10:15:00Z", read.json().get("occurredAt").asText());
    assertEquals(404, api.get("/api/v1/logs/" + id, other).status());
    assertEquals(404, api.get("/api/v1/logs/" + UUID.randomUUID(), owner).status());
  }
}
