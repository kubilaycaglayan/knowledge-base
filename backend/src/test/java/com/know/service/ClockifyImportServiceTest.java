package com.know.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.know.domain.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.web.server.ResponseStatusException;

class ClockifyImportServiceTest {
  @Test
  void importCreatesMissingPathAndUsesClockifyIdForDuplicateProtection() {
    PathRepository paths = mock(PathRepository.class);
    TimeEntryRepository entries = mock(TimeEntryRepository.class);
    ActivityRepository activities = mock(ActivityRepository.class);
    ImportBatchRepository batches = mock(ImportBatchRepository.class);
    UserRepository users = mock(UserRepository.class);
    UUID user = UUID.randomUUID();
    Path created = new Path(user, "Java", "Imported from Clockify");
    when(batches.save(any(ImportBatch.class))).thenAnswer(invocation -> invocation.getArgument(0));
    when(paths.findByUserIdAndNameIgnoreCase(user, "Java")).thenReturn(List.of());
    when(paths.save(any(Path.class))).thenAnswer(invocation -> invocation.getArgument(0));
    when(entries.existsImportIdentityIncludingDeleted(user, "IMPORT", "clockify-1"))
        .thenReturn(false, true);
    when(users.findForUpdateById(user)).thenReturn(Optional.empty());
    var entry =
        new ClockifyImportService.ClockifyEntry(
            "clockify-1",
            "Chapter 1",
            new ClockifyImportService.ClockifyInterval(
                Instant.parse("2026-08-25T10:00:00Z"), Instant.parse("2026-08-25T10:30:00Z"), null),
            "Java");
    var service = new ClockifyImportService(paths, entries, activities, batches, users);

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
    UserRepository users = mock(UserRepository.class);
    UUID user = UUID.randomUUID();
    ImportBatch batch = new ImportBatch(user, TimeSource.IMPORT);
    when(batches.findByIdAndUserId(batch.getId(), user)).thenReturn(Optional.of(batch));
    when(entries.deleteByUserIdAndImportBatchId(user, batch.getId())).thenReturn(3L);
    when(activities.deleteByUserIdAndImportBatchId(user, batch.getId())).thenReturn(3L);
    var service = new ClockifyImportService(paths, entries, activities, batches, users);

    var result = service.undoBatch(user, batch.getId());
    var second = service.undoBatch(user, batch.getId());

    assertEquals(batch.getId(), result.batchId());
    assertEquals(3, result.deletedEntries());
    assertEquals(0, second.deletedEntries());
    verify(activities, times(1)).deleteByUserIdAndImportBatchId(user, batch.getId());
    verify(entries, times(1)).deleteByUserIdAndImportBatchId(user, batch.getId());
  }

  @Test
  void rejectsNullOversizedAndMalformedImportRequestsBeforeCreatingABatch() {
    PathRepository paths = mock(PathRepository.class);
    TimeEntryRepository entries = mock(TimeEntryRepository.class);
    ActivityRepository activities = mock(ActivityRepository.class);
    ImportBatchRepository batches = mock(ImportBatchRepository.class);
    UserRepository users = mock(UserRepository.class);
    UUID user = UUID.randomUUID();
    var service = new ClockifyImportService(paths, entries, activities, batches, users);

    assertThrows(ResponseStatusException.class, () -> service.importEntries(user, null));
    assertThrows(
        ResponseStatusException.class,
        () -> service.importEntries(user, new ClockifyImportService.ClockifyImportRequest(null)));
    assertThrows(
        ResponseStatusException.class,
        () ->
            service.importEntries(
                user,
                new ClockifyImportService.ClockifyImportRequest(Collections.nCopies(2001, null))));
    assertThrows(
        ResponseStatusException.class,
        () ->
            service.importEntries(
                user,
                new ClockifyImportService.ClockifyImportRequest(
                    Arrays.asList((ClockifyImportService.ClockifyEntry) null))));
    verifyNoInteractions(paths, entries, activities);
    verify(batches).save(any(ImportBatch.class));
    verify(users, times(4)).findForUpdateById(user);
  }

  @Test
  void derivesDurationEndTrimsAndTruncatesDescriptionsAndCachesBlankProjectNames() {
    PathRepository paths = mock(PathRepository.class);
    TimeEntryRepository entries = mock(TimeEntryRepository.class);
    ActivityRepository activities = mock(ActivityRepository.class);
    ImportBatchRepository batches = mock(ImportBatchRepository.class);
    UserRepository users = mock(UserRepository.class);
    UUID user = UUID.randomUUID();
    String externalId = "  " + UUID.randomUUID() + "  ";
    when(batches.save(any(ImportBatch.class))).thenAnswer(invocation -> invocation.getArgument(0));
    when(entries.save(any(TimeEntry.class))).thenAnswer(invocation -> invocation.getArgument(0));
    when(entries.existsImportIdentityIncludingDeleted(eq(user), eq("IMPORT"), anyString()))
        .thenReturn(false);
    var source =
        new ClockifyImportService.ClockifyEntry(
            externalId,
            "  " + "x".repeat(600) + "  ",
            new ClockifyImportService.ClockifyInterval(
                Instant.parse("2026-08-25T10:00:00Z"), null, 90L),
            "   ");

    var result =
        new ClockifyImportService(paths, entries, activities, batches, users)
            .importEntries(user, new ClockifyImportService.ClockifyImportRequest(List.of(source)));

    assertEquals(1, result.imported());
    ArgumentCaptor<TimeEntry> captured = ArgumentCaptor.forClass(TimeEntry.class);
    verify(entries).save(captured.capture());
    assertEquals(externalId.trim(), captured.getValue().getExternalId());
    assertEquals(500, captured.getValue().getDescription().length());
    assertEquals(90, captured.getValue().getDurationSeconds());
    assertNull(captured.getValue().getPathId());
    verifyNoInteractions(paths);
  }

  @Test
  void rejectsAProjectNameBeyondTheDatabaseLimitWithoutSavingAnEntry() {
    PathRepository paths = mock(PathRepository.class);
    TimeEntryRepository entries = mock(TimeEntryRepository.class);
    ActivityRepository activities = mock(ActivityRepository.class);
    ImportBatchRepository batches = mock(ImportBatchRepository.class);
    UserRepository users = mock(UserRepository.class);
    UUID user = UUID.randomUUID();
    when(batches.save(any(ImportBatch.class))).thenAnswer(invocation -> invocation.getArgument(0));
    when(paths.findByUserIdAndNameIgnoreCase(user, "x".repeat(161))).thenReturn(List.of());
    var source =
        new ClockifyImportService.ClockifyEntry(
            "id",
            null,
            new ClockifyImportService.ClockifyInterval(
                Instant.parse("2026-08-25T10:00:00Z"), Instant.parse("2026-08-25T10:01:00Z"), null),
            "x".repeat(161));

    assertThrows(
        ResponseStatusException.class,
        () ->
            new ClockifyImportService(paths, entries, activities, batches, users)
                .importEntries(
                    user, new ClockifyImportService.ClockifyImportRequest(List.of(source))));
    verify(entries, never()).save(any());
  }
}
