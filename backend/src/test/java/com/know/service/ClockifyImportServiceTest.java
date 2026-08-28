package com.know.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.know.domain.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class ClockifyImportServiceTest {
  @Test
  void importCreatesMissingPathAndUsesClockifyIdForDuplicateProtection() {
    PathRepository paths = mock(PathRepository.class);
    TimeEntryRepository entries = mock(TimeEntryRepository.class);
    ActivityRepository activities = mock(ActivityRepository.class);
    ImportBatchRepository batches = mock(ImportBatchRepository.class);
    UUID user = UUID.randomUUID();
    Path created = new Path(user, "Java", "Imported from Clockify");
    when(batches.save(any(ImportBatch.class))).thenAnswer(invocation -> invocation.getArgument(0));
    when(paths.findByUserIdAndNameIgnoreCase(user, "Java")).thenReturn(List.of());
    when(paths.save(any(Path.class))).thenAnswer(invocation -> invocation.getArgument(0));
    when(entries.findByUserIdAndSourceAndExternalId(user, TimeSource.IMPORT, "clockify-1"))
        .thenReturn(
            Optional.empty(),
            Optional.of(
                new TimeEntry(
                    user,
                    created.getId(),
                    null,
                    Instant.now(),
                    "Chapter 1",
                    TimeSource.IMPORT,
                    "clockify-1")));
    when(entries.save(any(TimeEntry.class))).thenAnswer(invocation -> invocation.getArgument(0));
    var entry =
        new ClockifyImportService.ClockifyEntry(
            "clockify-1",
            "Chapter 1",
            new ClockifyImportService.ClockifyInterval(
                Instant.parse("2026-08-25T10:00:00Z"), Instant.parse("2026-08-25T10:30:00Z"), null),
            "Java");
    var service = new ClockifyImportService(paths, entries, activities, batches);

    var result =
        service.importEntries(
            user, new ClockifyImportService.ClockifyImportRequest(List.of(entry)));

    assertEquals(1, result.imported());
    assertEquals(1, result.createdPaths());
    assertNotNull(result.batchId());
    verify(entries)
        .save(
            argThat(
                saved ->
                    saved.getSource() == TimeSource.IMPORT
                        && saved.getExternalId().equals("clockify-1")
                        && saved.getDurationSeconds() == 1800
                        && result.batchId().equals(saved.getImportBatchId())));
    verify(activities, never()).save(any());
    var duplicate =
        service.importEntries(
            user, new ClockifyImportService.ClockifyImportRequest(List.of(entry)));
    assertEquals(0, duplicate.imported());
    assertEquals(1, duplicate.skipped());
    assertEquals(0, duplicate.createdPaths());
    verify(entries, times(1)).save(any(TimeEntry.class));
  }

  @Test
  void undoBatchDeletesOnlyOwnedImportedEntriesAndActivitiesOnce() {
    PathRepository paths = mock(PathRepository.class);
    TimeEntryRepository entries = mock(TimeEntryRepository.class);
    ActivityRepository activities = mock(ActivityRepository.class);
    ImportBatchRepository batches = mock(ImportBatchRepository.class);
    UUID user = UUID.randomUUID();
    ImportBatch batch = new ImportBatch(user, TimeSource.IMPORT);
    when(batches.findByIdAndUserId(batch.getId(), user)).thenReturn(Optional.of(batch));
    when(entries.deleteByUserIdAndImportBatchId(user, batch.getId())).thenReturn(3L);
    when(activities.deleteByUserIdAndImportBatchId(user, batch.getId())).thenReturn(3L);
    var service = new ClockifyImportService(paths, entries, activities, batches);

    var result = service.undoBatch(user, batch.getId());
    var second = service.undoBatch(user, batch.getId());

    assertEquals(batch.getId(), result.batchId());
    assertEquals(3, result.deletedEntries());
    assertEquals(0, second.deletedEntries());
    verify(activities, times(1)).deleteByUserIdAndImportBatchId(user, batch.getId());
    verify(entries, times(1)).deleteByUserIdAndImportBatchId(user, batch.getId());
  }
}
