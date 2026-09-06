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
  private final ItemRepository items = mock(ItemRepository.class);
  private final PathItemRepository pathItems = mock(PathItemRepository.class);
  private final ProgressEntryRepository progress = mock(ProgressEntryRepository.class);
  private final ActivityRepository activities = mock(ActivityRepository.class);
  private final TimeEntryItemRepository entryItems = mock(TimeEntryItemRepository.class);

  private TimerService service() {
    return new TimerService(entries, paths, items, pathItems, progress, activities, entryItems);
  }

  @Test
  void startDefaultsNullSourceAndDeduplicatesNullableItemTargets() {
    UUID user = UUID.randomUUID();
    UUID item = UUID.randomUUID();
    when(entries.findByUserIdAndEndedAtIsNull(user)).thenReturn(Optional.empty());
    when(items.findByIdAndUserId(item, user)).thenReturn(Optional.of(new Item(user, "Read", ItemType.BOOK, null)));
    when(entries.save(any(TimeEntry.class))).thenAnswer(invocation -> invocation.getArgument(0));
    when(entryItems.findAllByIdTimeEntryId(any())).thenReturn(List.of());

    TimerService.TimeView view =
        service().startWithItems(user, null, Arrays.asList(item, item, null), "Reading", null);

    assertEquals(TimeSource.WEB, view.source());
    assertEquals(item, view.itemId());
    verify(entryItems).deleteAllByIdTimeEntryId(view.id());
    verify(entryItems).save(argThat(saved -> saved.getItemId().equals(item)));
    verify(entryItems, times(1)).save(any(TimeEntryItem.class));
  }

  @Test
  void manualAndRunningConfigurationRejectInvalidTimeWindowsBeforeMutation() {
    UUID user = UUID.randomUUID();
    Instant now = Instant.now();
    TimerService service = service();

    assertThrows(
        ResponseStatusException.class,
        () -> service.manual(user, null, null, null, now, "bad"));
    assertThrows(
        ResponseStatusException.class,
        () -> service.manual(user, null, null, now, now.minusSeconds(1), "bad"));
    assertThrows(
        ResponseStatusException.class,
        () -> service.configureRunning(user, UUID.randomUUID(), null, null, now.plusSeconds(1), null, "future"));
    assertThrows(
        ResponseStatusException.class,
        () -> service.configureRunning(user, UUID.randomUUID(), null, null, now, now.plusSeconds(1), "future end"));
    verifyNoInteractions(entries, paths, items, entryItems);
  }

  @Test
  void stoppingAnAlreadyStoppedEntryIsIdempotentButForeignEntriesAreHidden() {
    UUID user = UUID.randomUUID();
    UUID id = UUID.randomUUID();
    TimeEntry stopped = new TimeEntry(user, null, null, Instant.now().minusSeconds(20), "done", TimeSource.MANUAL);
    stopped.stop(stopped.getStartedAt().plusSeconds(10));
    when(entries.findById(id)).thenReturn(Optional.of(stopped));
    when(entryItems.findAllByIdTimeEntryId(stopped.getId())).thenReturn(List.of());

    TimerService.TimeView view = service().stop(user, id);

    assertFalse(view.running());
    verify(entries, never()).save(any());
    when(entries.findById(id)).thenReturn(Optional.of(new TimeEntry(UUID.randomUUID(), null, null, Instant.now(), "foreign", TimeSource.WEB)));
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
    TimeEntry running = new TimeEntry(user, null, null, Instant.now().minusSeconds(20), "live", TimeSource.WEB);
    when(entries.findByIdAndUserId(id, user)).thenReturn(Optional.of(running));

    assertThrows(
        ResponseStatusException.class,
        () -> service().edit(user, id, null, null, running.getStartedAt(), Instant.now(), "edit"));
    assertThrows(ResponseStatusException.class, () -> service().remove(user, id));
    verify(entries, never()).save(any());
  }
}
