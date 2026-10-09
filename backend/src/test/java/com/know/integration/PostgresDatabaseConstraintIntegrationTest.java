package com.know.integration;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
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

  @Test
  void postgresEnforcesCoreProgressLabelImportAndPreferenceChecksOnDirectWrites() throws Exception {
    Assumptions.assumeTrue(
        System.getenv("KB_TEST_POSTGRES_URL") != null,
        "Database-level constraints require the PostgreSQL integration profile");
    UUID userId = subject(api.register());

    assertThrows(
        DataIntegrityViolationException.class,
        () ->
            jdbc.update(
                "insert into import_batch (id, user_id, source) values (?, ?, ?)",
                UUID.randomUUID(),
                userId,
                "UNSUPPORTED"));
    assertThrows(
        DataIntegrityViolationException.class,
        () ->
            jdbc.update(
                "insert into user_preferences (user_id, theme) values (?, ?)",
                userId,
                "unsupported"));
    assertThrows(
        DataIntegrityViolationException.class,
        () ->
            jdbc.update(
                "insert into labels (id, user_id, name, color) values (?, ?, ?, ?)",
                UUID.randomUUID(),
                userId,
                "Invalid label color",
                "red"));
  }

  @Test
  void postgresPathMergeRollsBackEarlierSessionMovesWhenBoardMoveFails() throws Exception {
    Assumptions.assumeTrue(
        System.getenv("KB_TEST_POSTGRES_URL") != null,
        "Transaction rollback contract requires PostgreSQL");
    String token = api.register();
    String sourcePathId =
        api.created("POST", "/api/v1/paths", token, "{\"name\":\"Merge source\"}")
            .get("id")
            .asText();
    String targetPathId =
        api.created("POST", "/api/v1/paths", token, "{\"name\":\"Merge target\"}")
            .get("id")
            .asText();
    String entryId =
        api.created(
                "POST",
                "/api/v1/time-entries",
                token,
                "{\"pathId\":\""
                    + sourcePathId
                    + "\",\"labelIds\":[],\"startedAt\":\"2026-05-05T10:00:00Z\",\"endedAt\":\"2026-05-05T10:01:00Z\"}")
            .get("id")
            .asText();
    JsonNode boardViews = api.get("/api/v1/boards?includeHidden=true", token).json();
    String sourceBoardId = null;
    for (JsonNode board : boardViews) {
      if (sourcePathId.equals(board.path("pathId").asText()))
        sourceBoardId = board.get("id").asText();
    }
    assertNotNull(sourceBoardId);
    api.created(
        "POST",
        "/api/v1/boards/" + sourceBoardId + "/cards",
        token,
        "{\"title\":\"Rollback card\"}");

    String suffix = UUID.randomUUID().toString().replace("-", "");
    String functionName = "fail_merge_" + suffix;
    String triggerName = "fail_merge_" + suffix;
    jdbc.execute(
        "create function "
            + functionName
            + "() returns trigger language plpgsql as $$ begin raise exception 'forced merge failure'; end $$");
    jdbc.execute(
        "create trigger "
            + triggerName
            + " before update on board_cards for each row execute function "
            + functionName
            + "()");
    try {
      ApiClient.Reply failed =
          api.post(
              "/api/v1/paths/" + sourcePathId + "/merge",
              token,
              "{\"targetPathId\":\"" + targetPathId + "\"}");
      assertEquals(500, failed.status(), failed.toString());
    } finally {
      jdbc.execute("drop trigger if exists " + triggerName + " on board_cards");
      jdbc.execute("drop function if exists " + functionName + "()");
    }

    assertEquals(
        UUID.fromString(sourcePathId),
        jdbc.queryForObject(
            "select path_id from time_entry where id = ?", UUID.class, UUID.fromString(entryId)));
    assertNull(
        jdbc.queryForObject(
            "select deleted_at from path where id = ?",
            Timestamp.class,
            UUID.fromString(sourcePathId)));
    assertEquals(
        UUID.fromString(sourceBoardId),
        jdbc.queryForObject(
            "select board_id from board_cards where title = ?", UUID.class, "Rollback card"));
  }

  @Test
  void postgresPathCreateRollsBackWhenDefaultBoardStatusSeedingFails() throws Exception {
    Assumptions.assumeTrue(
        System.getenv("KB_TEST_POSTGRES_URL") != null,
        "Transaction rollback contract requires PostgreSQL");
    String token = api.register();
    UUID userId = subject(token);
    String trigger = failOnInsertTrigger("board_statuses");
    try {
      ApiClient.Reply failed =
          api.post("/api/v1/paths", token, "{\"name\":\"Rollback seeded path\"}");
      assertEquals(500, failed.status(), failed.body());
    } finally {
      dropInsertTrigger("board_statuses", trigger);
    }

    assertEquals(
        0L,
        jdbc.queryForObject(
            "select count(*) from path where user_id = ? and name = ?",
            Long.class,
            userId,
            "Rollback seeded path"));
  }

  @Test
  void postgresStatusArchiveRollsBackEarlierCardMovesWhenALaterMoveFails() throws Exception {
    Assumptions.assumeTrue(
        System.getenv("KB_TEST_POSTGRES_URL") != null,
        "Transaction rollback contract requires PostgreSQL");
    String token = api.register();
    JsonNode board =
        api.created("POST", "/api/v1/boards", token, "{\"name\":\"Archive rollback board\"}");
    UUID boardId = UUID.fromString(board.get("id").asText());
    List<UUID> statusIds =
        jdbc.query(
            "select id from board_statuses where board_id = ? order by position",
            (rs, row) -> rs.getObject(1, UUID.class),
            boardId);
    UUID sourceStatusId = statusIds.get(0);
    for (String title : List.of("First rollback card", "Second rollback card"))
      api.created(
          "POST",
          "/api/v1/boards/" + boardId + "/cards",
          token,
          "{\"title\":\"" + title + "\",\"statusId\":\"" + sourceStatusId + "\"}");

    String suffix = UUID.randomUUID().toString().replace("-", "");
    String sequenceName = "fail_archive_count_" + suffix;
    String functionName = "fail_archive_move_" + suffix;
    String triggerName = "fail_archive_move_" + suffix;
    jdbc.execute("create sequence " + sequenceName);
    jdbc.execute(
        "create function "
            + functionName
            + "() returns trigger language plpgsql as $$ begin if nextval('"
            + sequenceName
            + "') >= 2 then raise exception 'forced second card move failure'; end if; return new; end $$");
    jdbc.execute(
        "create trigger "
            + triggerName
            + " before update on board_cards for each row execute function "
            + functionName
            + "()");
    try {
      ApiClient.Reply failed =
          api.post(
              "/api/v1/boards/" + boardId + "/statuses/" + sourceStatusId + "/archive",
              token,
              "{}");
      assertEquals(500, failed.status(), failed.body());
    } finally {
      jdbc.execute("drop trigger if exists " + triggerName + " on board_cards");
      jdbc.execute("drop function if exists " + functionName + "()");
      jdbc.execute("drop sequence if exists " + sequenceName);
    }

    assertNull(
        jdbc.queryForObject(
            "select archived_at from board_statuses where id = ?",
            Timestamp.class,
            sourceStatusId));
    assertEquals(
        2L,
        jdbc.queryForObject(
            "select count(*) from board_cards where board_id = ? and status_id = ? and archived_at is null",
            Long.class,
            boardId,
            sourceStatusId));
    assertEquals(
        0L,
        jdbc.queryForObject(
            "select count(*) from board_cards where board_id = ? and status_id = ?",
            Long.class,
            boardId,
            statusIds.get(1)));
  }

  @Test
  void postgresCreateOperationsRollBackParentsWhenAssociationWritesFail() throws Exception {
    Assumptions.assumeTrue(
        System.getenv("KB_TEST_POSTGRES_URL") != null,
        "Association transaction rollback contract requires PostgreSQL");
    String token = api.register();
    UUID userId = subject(token);

    String noteTrigger = failOnInsertTrigger("note_label");
    try {
      ApiClient.Reply failed =
          api.post(
              "/api/v1/notes",
              token,
              "{\"title\":\"Rollback note\",\"content\":\"body\",\"tags\":[\"Rollback tag\"]}");
      assertEquals(500, failed.status(), failed.body());
    } finally {
      dropInsertTrigger("note_label", noteTrigger);
    }
    assertEquals(
        0L,
        jdbc.queryForObject(
            "select count(*) from note where user_id = ? and title = ?",
            Long.class,
            userId,
            "Rollback note"));
    assertEquals(
        0L,
        jdbc.queryForObject(
            "select count(*) from labels where user_id = ? and name = ?",
            Long.class,
            userId,
            "Rollback tag"));

    JsonNode board =
        api.created("POST", "/api/v1/boards", token, "{\"name\":\"Rollback card board\"}");
    String boardId = board.get("id").asText();
    String boardLabelId =
        api.created(
                "POST",
                "/api/v1/labels",
                token,
                "{\"name\":\"Rollback board label\",\"scopes\":[\"BOARD\"]}")
            .get("id")
            .asText();
    String cardTrigger = failOnInsertTrigger("board_card_labels");
    try {
      ApiClient.Reply failed =
          api.post(
              "/api/v1/boards/" + boardId + "/cards",
              token,
              "{\"title\":\"Rollback card\",\"labelIds\":[\"" + boardLabelId + "\"]}");
      assertEquals(500, failed.status(), failed.body());
    } finally {
      dropInsertTrigger("board_card_labels", cardTrigger);
    }
    assertEquals(
        0L,
        jdbc.queryForObject(
            "select count(*) from board_cards where board_id = ? and title = ?",
            Long.class,
            UUID.fromString(boardId),
            "Rollback card"));

    String timeLabelId =
        api.created(
                "POST",
                "/api/v1/labels",
                token,
                "{\"name\":\"Rollback timer label\",\"scopes\":[\"TIME_ENTRY\"]}")
            .get("id")
            .asText();
    String timeTrigger = failOnInsertTrigger("time_entry_label");
    try {
      ApiClient.Reply failed =
          api.post(
              "/api/v1/time-entries",
              token,
              "{\"labelIds\":[\""
                  + timeLabelId
                  + "\"],\"startedAt\":\"2026-05-06T10:00:00Z\",\"endedAt\":\"2026-05-06T10:01:00Z\"}");
      assertEquals(500, failed.status(), failed.body());
    } finally {
      dropInsertTrigger("time_entry_label", timeTrigger);
    }
    assertEquals(
        0L,
        jdbc.queryForObject(
            "select count(*) from time_entry where user_id = ? and description is null and started_at = ?",
            Long.class,
            userId,
            Timestamp.from(Instant.parse("2026-05-06T10:00:00Z"))));

    String scopeTrigger = failOnInsertTrigger("label_scope");
    try {
      ApiClient.Reply failed =
          api.post(
              "/api/v1/labels",
              token,
              "{\"name\":\"Rollback scope label\",\"scopes\":[\"NOTE\"]}");
      assertEquals(500, failed.status(), failed.body());
    } finally {
      dropInsertTrigger("label_scope", scopeTrigger);
    }
    assertEquals(
        0L,
        jdbc.queryForObject(
            "select count(*) from labels where user_id = ? and name = ?",
            Long.class,
            userId,
            "Rollback scope label"));
  }

  @Test
  void postgresLabelDeleteRollsBackEarlierAssignmentDeletesWhenALaterJoinFails() throws Exception {
    Assumptions.assumeTrue(
        System.getenv("KB_TEST_POSTGRES_URL") != null,
        "Assignment cleanup rollback contract requires PostgreSQL");
    String token = api.register();
    UUID userId = subject(token);
    String labelId =
        api.created(
                "POST",
                "/api/v1/labels",
                token,
                "{\"name\":\"Rollback delete label\",\"scopes\":[\"NOTE\",\"CALENDAR\",\"TIME_ENTRY\",\"LOG\"]}")
            .get("id")
            .asText();
    api.put(
        "/api/v1/calendar/days/2026-05-25",
        token,
        "{\"labels\":[{\"labelId\":\"" + labelId + "\",\"portion\":0.25}]}");
    api.created(
        "POST",
        "/api/v1/time-entries",
        token,
        "{\"labelIds\":[\""
            + labelId
            + "\"],\"startedAt\":\"2026-05-25T10:00:00Z\",\"endedAt\":\"2026-05-25T10:01:00Z\"}");
    api.created(
        "POST",
        "/api/v1/notes",
        token,
        "{\"title\":\"Delete rollback note\",\"content\":\"body\",\"tags\":[\"Rollback delete label\"]}");
    String logId =
        api.created(
                "POST",
                "/api/v1/logs",
                token,
                "{\"body\":\"Delete rollback log\",\"occurredAt\":\"2026-05-25T10:00:00Z\"}")
            .get("id")
            .asText();
    assertEquals(
        200,
        api.put(
                "/api/v1/logs/" + logId + "/labels",
                token,
                "{\"labelIds\":[\"" + labelId + "\"]}")
            .status());

    String trigger = failOnDeleteTrigger("note_label");
    try {
      ApiClient.Reply failed = api.delete("/api/v1/labels/" + labelId + "?removeAssignments=true", token);
      assertEquals(500, failed.status(), failed.body());
    } finally {
      dropInsertTrigger("note_label", trigger);
    }
    UUID labelUuid = UUID.fromString(labelId);
    assertEquals(
        1L,
        jdbc.queryForObject(
            "select count(*) from labels where id = ? and user_id = ?",
            Long.class,
            labelUuid,
            userId));
    assertEquals(
        1L,
        jdbc.queryForObject(
            "select count(*) from daily_record_label where label_id = ?", Long.class, labelUuid));
    assertEquals(
        1L,
        jdbc.queryForObject(
            "select count(*) from time_entry_label where label_id = ?", Long.class, labelUuid));
    assertEquals(
        1L,
        jdbc.queryForObject(
            "select count(*) from note_label where label_id = ?", Long.class, labelUuid));
    assertEquals(
        1L,
        jdbc.queryForObject("select count(*) from log_label where label_id = ?", Long.class, labelUuid));
  }

  @Test
  void postgresNoteUpdateRollsBackContentAndOldTagsWhenReplacementTagWriteFails()
      throws Exception {
    Assumptions.assumeTrue(
        System.getenv("KB_TEST_POSTGRES_URL") != null,
        "Transaction rollback contract requires PostgreSQL");
    String token = api.register();
    UUID userId = subject(token);
    JsonNode note =
        api.created(
            "POST",
            "/api/v1/notes",
            token,
            "{\"title\":\"Original note\",\"content\":\"Original body\",\"tags\":[\"Original rollback tag\"]}");
    UUID noteId = UUID.fromString(note.get("id").asText());
    UUID originalLabelId =
        jdbc.queryForObject(
            "select label_id from note_label where note_id = ?",
            UUID.class,
            noteId);
    String trigger = failOnInsertTrigger("note_label");
    try {
      ApiClient.Reply failed =
          api.put(
              "/api/v1/notes/" + noteId,
              token,
              "{\"title\":\"Changed note\",\"content\":\"Changed body\",\"tags\":[\"Replacement rollback tag\"]}");
      assertEquals(500, failed.status(), failed.body());
    } finally {
      dropInsertTrigger("note_label", trigger);
    }

    assertEquals(
        "Original body",
        jdbc.queryForObject("select content from note where id = ?", String.class, noteId));
    assertEquals(
        "Original note",
        jdbc.queryForObject("select title from note where id = ?", String.class, noteId));
    assertEquals(
        1L,
        jdbc.queryForObject(
            "select count(*) from note_label where note_id = ? and label_id = ?",
            Long.class,
            noteId,
            originalLabelId));
    assertEquals(
        0L,
        jdbc.queryForObject(
            "select count(*) from labels where user_id = ? and name = ?",
            Long.class,
            userId,
            "Replacement rollback tag"));
  }

  private String failOnInsertTrigger(String tableName) {
    String suffix = UUID.randomUUID().toString().replace("-", "");
    String functionName = "fail_insert_" + suffix;
    jdbc.execute(
        "create function "
            + functionName
            + "() returns trigger language plpgsql as $$ begin raise exception 'forced association failure'; end $$");
    jdbc.execute(
        "create trigger "
            + functionName
            + " before insert on "
            + tableName
            + " for each row execute function "
            + functionName
            + "()");
    return functionName;
  }

  private void dropInsertTrigger(String tableName, String name) {
    jdbc.execute("drop trigger if exists " + name + " on " + tableName);
    jdbc.execute("drop function if exists " + name + "()");
  }

  private String failOnDeleteTrigger(String tableName) {
    String suffix = UUID.randomUUID().toString().replace("-", "");
    String functionName = "fail_delete_" + suffix;
    jdbc.execute(
        "create function "
            + functionName
            + "() returns trigger language plpgsql as $$ begin raise exception 'forced association delete failure'; end $$");
    jdbc.execute(
        "create trigger "
            + functionName
            + " before delete on "
            + tableName
            + " for each row execute function "
            + functionName
            + "()");
    return functionName;
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
