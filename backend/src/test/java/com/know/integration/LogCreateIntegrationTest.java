package com.know.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.web.server.LocalServerPort;

/** Log creation returns and persists its body and occurrence time. */
class LogCreateIntegrationTest extends IntegrationTestSupport {
  @LocalServerPort int port;
  ApiClient api;

  @BeforeEach
  void setUp() {
    api = new ApiClient(port);
  }

  @Test
  void createReturnsCreatedLogAndDetailReadConfirmsPersistence() {
    String owner = api.register();
    ApiClient.Reply created =
        api.post(
            "/api/v1/logs",
            owner,
            "{\"body\":\"  Created thought  \",\"occurredAt\":\"2026-09-11T10:15:00Z\"}");
    assertEquals(201, created.status(), created.body());
    JsonNode response = created.json();
    assertEquals("Created thought", response.get("body").asText());
    assertEquals("2026-09-11T10:15:00Z", response.get("occurredAt").asText());

    ApiClient.Reply detail = api.get("/api/v1/logs/" + response.get("id").asText(), owner);
    assertEquals(200, detail.status(), detail.body());
    assertEquals(response.get("id").asText(), detail.json().get("id").asText());
    assertEquals("Created thought", detail.json().get("body").asText());
    assertEquals("2026-09-11T10:15:00Z", detail.json().get("occurredAt").asText());
  }
}
