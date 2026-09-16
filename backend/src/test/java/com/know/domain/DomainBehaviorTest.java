package com.know.domain;

import static org.junit.jupiter.api.Assertions.*;

import java.time.*;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class DomainBehaviorTest {
  @Test
  void stoppedTimeEntryStoresDurationAndCannotRemainRunning() {
    Instant start = Instant.parse("2026-08-25T10:00:00Z");
    TimeEntry entry = new TimeEntry(UUID.randomUUID(), null, start, "Reading", TimeSource.MANUAL);
    assertTrue(entry.running());
    entry.stop(start.plusSeconds(3300));
    assertFalse(entry.running());
    assertEquals(3300, entry.getDurationSeconds());
  }

  @Test
  void timeEntryClampsAnEndBeforeItsStartToZeroDuration() {
    Instant start = Instant.parse("2026-08-25T10:00:00Z");
    TimeEntry entry = new TimeEntry(UUID.randomUUID(), null, start, null, TimeSource.MANUAL);

    entry.stop(start.minusSeconds(30));

    assertFalse(entry.running());
    assertEquals(0, entry.getDurationSeconds());
  }

  @Test
  void runningTimerCanBeReconfiguredAndStoppedAtAnEditedEndTime() {
    Instant original = Instant.parse("2026-08-25T10:00:00Z");
    Instant revised = Instant.parse("2026-08-25T11:00:00Z");
    UUID path = UUID.randomUUID();
    TimeEntry entry = new TimeEntry(UUID.randomUUID(), null, original, "old", TimeSource.IOS);

    entry.reconfigureRunning(path, revised, "new");
    entry.stop(revised.plusSeconds(90));

    assertEquals(path, entry.getPathId());
    assertEquals("new", entry.getDescription());
    assertEquals(90, entry.getDurationSeconds());
  }

  @Test
  void editingWithNullSourcePreservesTheOriginalSource() {
    Instant start = Instant.parse("2026-08-25T10:00:00Z");
    TimeEntry entry = new TimeEntry(UUID.randomUUID(), null, start, "old", TimeSource.IMPORT);
    entry.stop(start.plusSeconds(60));

    entry.edit(null, start.plusSeconds(10), start.plusSeconds(70), "edited", null);

    assertEquals(TimeSource.IMPORT, entry.getSource());
    assertEquals(60, entry.getDurationSeconds());
    assertEquals("edited", entry.getDescription());
  }

  @Test
  void pathDefaultsColorAndBlankUpdatesDoNotEraseIt() {
    Path path = new Path(UUID.randomUUID(), "Learning", null, null);
    assertEquals("#E8754E", path.getColor());

    path.update("Learning 2", "updated", "  ");

    assertEquals("#E8754E", path.getColor());
    assertEquals("Learning 2", path.getName());
    assertEquals("updated", path.getDescription());
  }

  @Test
  void sessionActivityCarriesTimeEntryIdentityAndMetadata() {
    UUID user = UUID.randomUUID();
    UUID path = UUID.randomUUID();
    UUID timeEntry = UUID.randomUUID();
    Instant occurredAt = Instant.parse("2026-08-25T10:00:00Z");

    Activity activity = Activity.session(user, path, timeEntry, "Session", "Reading", occurredAt);

    assertEquals(ActivityType.TIME_TRACKED, activity.getType());
    assertEquals(timeEntry, activity.getTimeEntryId());
    assertEquals(occurredAt, activity.getOccurredAt());
    assertEquals("Reading", activity.getDetail());
  }
}
