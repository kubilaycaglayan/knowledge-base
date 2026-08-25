package com.know.domain;

import org.junit.jupiter.api.Test;
import java.time.*;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

class DomainBehaviorTest {
    @Test void progressPromotesPlannedItemAndRecordsCompletionState() {
        Item item = new Item(UUID.randomUUID(), "Course", ItemType.COURSE, null);
        assertEquals(0, item.getProgress());
        assertEquals(0, item.setProgress((short) 42));
        assertEquals(ItemStatus.ACTIVE, item.getStatus());
        assertEquals(42, item.getProgress());
        item.setProgress((short) 100);
        assertEquals(ItemStatus.COMPLETED, item.getStatus());
    }

    @Test void stoppedTimeEntryStoresDurationAndCannotRemainRunning() {
        Instant start = Instant.parse("2026-08-25T10:00:00Z");
        TimeEntry entry = new TimeEntry(UUID.randomUUID(), null, null, start, "Reading", TimeSource.MANUAL);
        assertTrue(entry.running());
        entry.stop(start.plusSeconds(3300));
        assertFalse(entry.running());
        assertEquals(3300, entry.getDurationSeconds());
    }
}
