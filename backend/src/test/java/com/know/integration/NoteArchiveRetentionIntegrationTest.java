package com.know.integration;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.ScheduledAnnotationBeanPostProcessor;
import org.springframework.scheduling.config.ScheduledTask;

/** Archived notes are kept indefinitely: no background job ever deletes them. */
class NoteArchiveRetentionIntegrationTest extends IntegrationTestSupport {
  @LocalServerPort int port;
  @Autowired JdbcTemplate jdbc;
  @Autowired ScheduledAnnotationBeanPostProcessor scheduling;
  ApiClient api;

  @BeforeEach
  void setUp() {
    api = new ApiClient(port);
  }

  @Test
  void scheduledJobsKeepNotesArchivedLongAgo() {
    String token = api.register();
    String noteId =
        api.created("POST", "/api/v1/notes", token, "{\"title\":\"Old idea\",\"content\":\"body\"}")
            .get("id")
            .asText();
    assertEquals(204, api.delete("/api/v1/notes/" + noteId, token).status());
    jdbc.update(
        "update note set deleted_at = ? where id = ?",
        Timestamp.from(Instant.now().minus(Duration.ofDays(365))),
        UUID.fromString(noteId));

    for (ScheduledTask task : scheduling.getScheduledTasks()) task.getTask().getRunnable().run();

    JsonNode archived = api.get("/api/v1/notes?archived=true&page=0&size=50", token).json();
    assertTrue(archived.toString().contains(noteId), "archived note was deleted: " + archived);
    assertEquals(200, api.post("/api/v1/notes/" + noteId + "/restore", token, null).status());
    assertEquals(200, api.get("/api/v1/notes/" + noteId, token).status());
  }
}
