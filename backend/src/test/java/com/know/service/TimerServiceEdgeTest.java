package com.know.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.know.domain.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Pageable;
import org.springframework.web.server.ResponseStatusException;

class TimerServiceEdgeTest {
  private final TimeEntryRepository entries = mock(TimeEntryRepository.class);
  private final PathRepository paths = mock(PathRepository.class);
  private final DailyLabelRepository labels = mock(DailyLabelRepository.class);
  private final TimeEntryLabelRepository entryLabels = mock(TimeEntryLabelRepository.class);

  private TimerService service() {
    return new TimerService(entries, paths, labels, entryLabels);
  }

  @Test
  void startDefaultsNullSourceAndDeduplicatesNullableLabelTargets() {
    UUID user = UUID.randomUUID();
    UUID label = UUID.randomUUID();
    when(entries.findByUserIdAndEndedAtIsNull(user)).thenReturn(Optional.empty());
    when(labels.findByIdAndUserId(label, user)).thenReturn(Optional.of(new DailyLabel(user, "Read", null)));
    when(entries.save(any(TimeEntry.class))).thenAnswer(invocation -> invocation.getArgument(0));
    when(entryLabels.findAllByIdTimeEntryId(any()))
        .thenAnswer(invocation -> List.of(new TimeEntryLabel(invocation.getArgument(0), label)));

    TimerService.TimeView view =
        service().start(user, null, Arrays.asList(label, label, null), "Reading", null);

    assertEquals(TimeSource.WEB, view.source());
    assertEquals(List.of(label), view.labelIds());
    verify(entryLabels).deleteAllByIdTimeEntryId(view.id());
    verify(entryLabels).save(argThat(saved -> saved.getLabelId().equals(label)));
    verify(entryLabels, times(1)).save(any(TimeEntryLabel.class));
  }

  @Test
  void manualAndRunningConfigurationRejectInvalidTimeWindowsBeforeMutation() {
    UUID user = UUID.randomUUID();
    Instant now = Instant.now();
    TimerService service = service();

    assertThrows(
        ResponseStatusException.class,
        () -> service.manual(user, null, List.of(), null, now, "bad"));
    assertThrows(
        ResponseStatusException.class,
        () -> service.manual(user, null, List.of(), now, now.minusSeconds(1), "bad"));
    assertThrows(
        ResponseStatusException.class,
        () -> service.configure(user, UUID.randomUUID(), null, List.of(), now.plusSeconds(1), null, "future"));
    assertThrows(
        ResponseStatusException.class,
        () -> service.configure(user, UUID.randomUUID(), null, List.of(), now, now.plusSeconds(1), "future end"));
    verifyNoInteractions(entries, paths, labels, entryLabels);
  }

  @Test
  void stoppingAnAlreadyStoppedEntryIsIdempotentButForeignEntriesAreHidden() {
    UUID user = UUID.randomUUID();
    UUID id = UUID.randomUUID();
    TimeEntry stopped = new TimeEntry(user, null, Instant.now().minusSeconds(20), "done", TimeSource.MANUAL);
    stopped.stop(stopped.getStartedAt().plusSeconds(10));
    when(entries.findById(id)).thenReturn(Optional.of(stopped));
    when(entryLabels.findAllByIdTimeEntryId(stopped.getId())).thenReturn(List.of());

    TimerService.TimeView view = service().stop(user, id);

    assertFalse(view.running());
    verify(entries, never()).save(any());
    when(entries.findById(id)).thenReturn(Optional.of(new TimeEntry(UUID.randomUUID(), null, Instant.now(), "foreign", TimeSource.WEB)));
    assertThrows(ResponseStatusException.class, () -> service().stop(user, id));
  }

  @Test
  void historyPageClampsNegativePagesAndOversizedPageSizes() {
    UUID user = UUID.randomUUID();
    when(entries.countByUserId(user)).thenReturn(101L);
    when(entries.findAllByUserIdOrderByCompletionTimeDesc(eq(user), any(Pageable.class)))
        .thenReturn(List.of());

    TimerService.HistoryPage page = service().historyPage(user, -4, 500);

    assertEquals(0, page.page());
    assertEquals(50, page.pageSize());
    assertEquals(101, page.totalSessions());
    assertEquals(3, page.totalPages());
    verify(entries).findAllByUserIdOrderByCompletionTimeDesc(eq(user), argThat(p -> p.getPageNumber() == 0 && p.getPageSize() == 50));
  }

  @Test
  void editingOrRemovingRunningEntriesIsRejectedWithoutSaving() {
    UUID user = UUID.randomUUID();
    UUID id = UUID.randomUUID();
    TimeEntry running = new TimeEntry(user, null, Instant.now().minusSeconds(20), "live", TimeSource.WEB);
    when(entries.findByIdAndUserId(id, user)).thenReturn(Optional.of(running));

    assertThrows(
        ResponseStatusException.class,
        () -> service().edit(user, id, null, List.of(), running.getStartedAt(), Instant.now(), "edit", null));
    assertThrows(ResponseStatusException.class, () -> service().remove(user, id));
    verify(entries, never()).save(any());
  }
}
