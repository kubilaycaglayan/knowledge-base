package com.know.integration;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
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

  @Test
  void postgresEnforcesDomainBoardCalendarAndLogChecksOnDirectWrites() throws Exception {
    Assumptions.assumeTrue(
        System.getenv("KB_TEST_POSTGRES_URL") != null,
        "Database-level constraints require the PostgreSQL integration profile");
    String token = api.register();
    UUID userId = subject(token);
    String pathId =
        api.created("POST", "/api/v1/paths", token, "{\"name\":\"Direct checks\"}")
            .get("id")
            .asText();
    String entryId =
        api.created(
                "POST",
                "/api/v1/time-entries",
                token,
                "{\"pathId\":\""
                    + pathId
                    + "\",\"labelIds\":[],\"startedAt\":\"2026-05-04T10:00:00Z\",\"endedAt\":\"2026-05-04T10:01:00Z\"}")
            .get("id")
            .asText();

    assertThrows(
        DataIntegrityViolationException.class,
        () ->
            jdbc.update(
                "insert into path (id, user_id, name, status) values (?, ?, ?, ?)",
                UUID.randomUUID(),
                userId,
                "Invalid status",
                "UNKNOWN"));
    assertThrows(
        DataIntegrityViolationException.class,
        () ->
            jdbc.update(
                "insert into note (id, user_id, path_id, time_entry_id, title, content) values (?, ?, ?, ?, ?, ?)",
                UUID.randomUUID(),
                userId,
                UUID.fromString(pathId),
                UUID.fromString(entryId),
                "Invalid target",
                "{}"));
    UUID dailyRecordId = UUID.randomUUID();
    assertThrows(
        DataIntegrityViolationException.class,
        () ->
            jdbc.update(
                "insert into daily_record (id, user_id, record_date, note) values (?, ?, ?, ?)",
                dailyRecordId,
                userId,
                java.sql.Date.valueOf("2026-05-04"),
                "   "));
    jdbc.update(
        "insert into daily_record (id, user_id, record_date) values (?, ?, ?)",
        dailyRecordId,
        userId,
        java.sql.Date.valueOf("2026-05-04"));
    UUID dailyLabelId = UUID.randomUUID();
    jdbc.update(
        "insert into labels (id, user_id, name) values (?, ?, ?)",
        dailyLabelId,
        userId,
        "Direct constraint label");
    assertThrows(
        DataIntegrityViolationException.class,
        () ->
            jdbc.update(
                "insert into daily_record_label (daily_record_id, label_id, portion) values (?, ?, ?)",
                dailyRecordId,
                dailyLabelId,
                new java.math.BigDecimal("0.10")));

    JsonNode board =
        api.created("POST", "/api/v1/boards", token, "{\"name\":\"Direct board checks\"}");
    UUID boardId = UUID.fromString(board.get("id").asText());
    UUID statusId =
        jdbc.queryForObject(
            "select id from board_statuses where board_id = ? order by position limit 1",
            UUID.class,
            boardId);
    assertThrows(
        DataIntegrityViolationException.class,
        () ->
            jdbc.update(
                "insert into board_cards (id, board_id, status_id, title, priority) values (?, ?, ?, ?, ?)",
                UUID.randomUUID(),
                boardId,
                statusId,
                "Invalid priority",
                "BLOCKER"));
    assertThrows(
        DataIntegrityViolationException.class,
        () ->
            jdbc.update(
                "insert into board_cards (id, board_id, status_id, title, start_date, due_date) values (?, ?, ?, ?, ?, ?)",
                UUID.randomUUID(),
                boardId,
                statusId,
                "Invalid date order",
                java.sql.Date.valueOf("2026-05-05"),
                java.sql.Date.valueOf("2026-05-04")));
    assertThrows(
        DataIntegrityViolationException.class,
        () ->
            jdbc.update(
                "insert into logs (id, user_id, body, occurred_at) values (?, ?, ?, ?)",
                UUID.randomUUID(),
                userId,
                "   ",
                Timestamp.from(Instant.parse("2026-05-04T12:00:00Z"))));
    assertEquals(1L, jdbc.queryForObject("select count(*) from path where id = ?", Long.class, UUID.fromString(pathId)));
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
