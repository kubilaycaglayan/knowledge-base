package com.know.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;

/** Time-entry deletion records a soft-delete timestamp and hides the row from API reads. */
class TimeEntryDeleteIntegrationTest extends IntegrationTestSupport {
  @LocalServerPort int port;
  @Autowired JdbcTemplate jdbc;
  ApiClient api;

  @BeforeEach
  void setUp() {
    api = new ApiClient(port);
  }

  @Test
  void deleteSoftDeletesOwnedEntryAndHidesItFromDetailAndHistory() {
    String owner = api.register();
    String other = api.register();
    JsonNode created =
        api.created(
            "POST",
            "/api/v1/time-entries",
            owner,
            "{\"startedAt\":\"2026-09-01T08:00:00Z\",\"endedAt\":\"2026-09-01T09:00:00Z\",\"labelIds\":[],\"description\":\"Delete entry\"}");
    UUID id = UUID.fromString(created.get("id").asText());

    assertEquals(404, api.delete("/api/v1/time-entries/" + id, other).status());
    assertEquals(200, api.get("/api/v1/time-entries/" + id, owner).status());
    assertEquals(204, api.delete("/api/v1/time-entries/" + id, owner).status());
    assertEquals(404, api.get("/api/v1/time-entries/" + id, owner).status());
    assertEquals(0, api.get("/api/v1/time-entries", owner).json().size());

    java.sql.Timestamp deletedAt =
        jdbc.queryForObject("select deleted_at from time_entry where id = ?", java.sql.Timestamp.class, id);
    assertNotNull(deletedAt);
  }
}
