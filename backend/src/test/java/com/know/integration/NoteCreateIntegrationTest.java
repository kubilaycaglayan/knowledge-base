package com.know.integration;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.web.server.LocalServerPort;

/** Note creation supports standalone notes and one owned context reference at a time. */
class NoteCreateIntegrationTest extends IntegrationTestSupport {
  @LocalServerPort int port;
  ApiClient api;

  @BeforeEach
  void setUp() {
    api = new ApiClient(port);
  }

  private JsonNode create(String token, String title, String association) {
    return api.created(
        "POST",
        "/api/v1/notes",
        token,
        "{\"title\":\"" + title + "\",\"content\":\"Body\"" + association + "}");
  }

  @Test
  void createSupportsStandalonePathActivityAndTimeEntryAssociations() {
    String token = api.register();
    JsonNode standalone = create(token, "Standalone", "");
    assertTrue(standalone.get("pathId").isNull());
    assertTrue(standalone.get("activityId").isNull());
    assertTrue(standalone.get("timeEntryId").isNull());

    String pathId = api.created("POST", "/api/v1/paths", token, "{\"name\":\"Note path\"}").get("id").asText();
    JsonNode pathNote = create(token, "Path note", ",\"pathId\":\"" + pathId + "\"");
    assertEquals(pathId, pathNote.get("pathId").asText());

    JsonNode activity = api.get("/api/v1/activities?pathId=" + pathId, token).json().get(0);
    JsonNode activityNote = create(token, "Activity note", ",\"activityId\":\"" + activity.get("id").asText() + "\"");
    assertEquals(activity.get("id").asText(), activityNote.get("activityId").asText());

    JsonNode entry =
        api.created(
            "POST",
            "/api/v1/time-entries",
            token,
            "{\"startedAt\":\"2026-09-01T09:00:00Z\",\"endedAt\":\"2026-09-01T10:00:00Z\",\"labelIds\":[],\"description\":\"For note\"}");
    JsonNode entryNote = create(token, "Entry note", ",\"timeEntryId\":\"" + entry.get("id").asText() + "\"");
    assertEquals(entry.get("id").asText(), entryNote.get("timeEntryId").asText());

    for (JsonNode note : new JsonNode[] {standalone, pathNote, activityNote, entryNote}) {
      JsonNode persisted = api.get("/api/v1/notes/" + note.get("id").asText(), token).json();
      assertEquals(note.get("pathId"), persisted.get("pathId"));
      assertEquals(note.get("activityId"), persisted.get("activityId"));
      assertEquals(note.get("timeEntryId"), persisted.get("timeEntryId"));
    }
  }
}
