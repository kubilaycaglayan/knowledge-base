package com.know.integration;

import static org.junit.jupiter.api.Assertions.*;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

/** Direct PostgreSQL constraint and referential-action contracts, separate from API validation. */
class PostgresDatabaseConstraintIntegrationTest extends IntegrationTestSupport {
  @LocalServerPort int port;
  @Autowired JdbcTemplate jdbc;
  ApiClient api;

  @BeforeEach
  void setUp() {
    api = new ApiClient(port);
  }

  @Test
  void postgresEnforcesTimeEntryChecksAndPathReferentialActions() throws Exception {
    Assumptions.assumeTrue(
        System.getenv("KB_TEST_POSTGRES_URL") != null,
        "Database-level constraints require the PostgreSQL integration profile");
    UUID userId = subject(api.register());
    Instant start = Instant.parse("2024-02-29T12:00:00Z");

    assertThrows(
        DataIntegrityViolationException.class,
        () -> insertEntry(UUID.randomUUID(), userId, null, start, start.plusSeconds(1), -1L));
    assertThrows(
        DataIntegrityViolationException.class,
        () -> insertEntry(UUID.randomUUID(), userId, null, start, start.minusSeconds(1), 0L));

    UUID runningId = UUID.randomUUID();
    insertEntry(runningId, userId, null, start, null, null);
    assertThrows(
        DataIntegrityViolationException.class,
        () -> insertEntry(UUID.randomUUID(), userId, null, start.plusSeconds(1), null, null));
    assertEquals(
        1L,
        jdbc.queryForObject(
            "select count(*) from time_entry where user_id = ? and ended_at is null",
            Long.class,
            userId));

    String token = api.register();
    String pathId = api.created("POST", "/api/v1/paths", token, "{\"name\":\"Cascade contract\"}")
        .get("id").asText();
    String noteId = api.created("POST", "/api/v1/notes", token,
        "{\"title\":\"Path child\",\"content\":\"body\",\"pathId\":\"" + pathId + "\"}")
        .get("id").asText();
    String entryId = api.created("POST", "/api/v1/time-entries", token,
        "{\"pathId\":\"" + pathId + "\",\"labelIds\":[],\"startedAt\":\""
            + start + "\",\"endedAt\":\"" + start.plusSeconds(5) + "\"}")
        .get("id").asText();

    jdbc.update("delete from path where id = ?", UUID.fromString(pathId));

    assertEquals(0L, jdbc.queryForObject("select count(*) from note where id = ?", Long.class, UUID.fromString(noteId)));
    assertEquals(1L, jdbc.queryForObject("select count(*) from time_entry where id = ?", Long.class, UUID.fromString(entryId)));
    assertNull(jdbc.queryForObject("select path_id from time_entry where id = ?", UUID.class, UUID.fromString(entryId)));
  }

  private void insertEntry(
      UUID id, UUID userId, UUID pathId, Instant startedAt, Instant endedAt, Long durationSeconds) {
    jdbc.update(
        "insert into time_entry (id, user_id, path_id, started_at, ended_at, duration_seconds, source) "
            + "values (?, ?, ?, ?, ?, ?, 'MANUAL')",
        id,
        userId,
        pathId,
        Timestamp.from(startedAt),
        endedAt == null ? null : Timestamp.from(endedAt),
        durationSeconds);
  }

  private static UUID subject(String token) throws Exception {
    String payload = token.split("\\.")[1];
    return UUID.fromString(ApiClient.MAPPER.readTree(Base64.getUrlDecoder().decode(payload)).get("sub").asText());
  }
}
