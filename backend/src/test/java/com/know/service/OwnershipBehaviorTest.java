package com.know.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.know.domain.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class OwnershipBehaviorTest {
  @Test
  void trackedDurationIsFormattedForHumanReading() {
    assertEquals("0 seconds", TimerService.formatTrackedDuration(0L));
    assertEquals("1 second", TimerService.formatTrackedDuration(1L));
    assertEquals("59 seconds", TimerService.formatTrackedDuration(59L));
    assertEquals("1 minute", TimerService.formatTrackedDuration(60L));
    assertEquals("23 minutes", TimerService.formatTrackedDuration(23 * 60L));
    assertEquals("1h", TimerService.formatTrackedDuration(60 * 60L));
    assertEquals("1h 23 minutes", TimerService.formatTrackedDuration(83 * 60L));
    assertEquals("2h 1 minute", TimerService.formatTrackedDuration(121 * 60L + 59));
    assertEquals("24h", TimerService.formatTrackedDuration(24 * 60 * 60L + 60));
    assertEquals("25h", TimerService.formatTrackedDuration(25 * 60 * 60L + 23 * 60));
  }

  @Test
  void listingItemsLoadsPathAndTagRelationshipsInBulk() {
    ItemRepository items = mock(ItemRepository.class);
    PathRepository paths = mock(PathRepository.class);
    PathItemRepository pathItems = mock(PathItemRepository.class);
    TagRepository tags = mock(TagRepository.class);
    ItemTagRepository itemTags = mock(ItemTagRepository.class);
    ActivityRepository activities = mock(ActivityRepository.class);
    ProgressEntryRepository progress = mock(ProgressEntryRepository.class);
    NoteRepository notes = mock(NoteRepository.class);
    Item first = new Item(UUID.randomUUID(), "First", ItemType.CUSTOM, null),
        second = new Item(UUID.randomUUID(), "Second", ItemType.CUSTOM, null);
    PathItemRepository.ItemPathProjection pathRow =
        mock(PathItemRepository.ItemPathProjection.class);
    when(pathRow.getItemId()).thenReturn(first.getId());
    when(pathRow.getPathId()).thenReturn(UUID.randomUUID());
    ItemTagRepository.ItemTagProjection tagRow = mock(ItemTagRepository.ItemTagProjection.class);
    when(tagRow.getItemId()).thenReturn(second.getId());
    when(tagRow.getName()).thenReturn("java");
    when(items.findAllByUserIdOrderByUpdatedAtDesc(any(), any()))
        .thenReturn(List.of(first, second));
    when(pathItems.findRelationships(any())).thenReturn(List.of(pathRow));
    when(itemTags.findRelationships(any())).thenReturn(List.of(tagRow));
    KnowledgeService service =
        new KnowledgeService(items, paths, pathItems, tags, itemTags, activities, progress, notes);
    List<KnowledgeService.ItemView> result = service.listItems(UUID.randomUUID());
    assertEquals(2, result.size());
    assertEquals(1, result.get(0).pathIds().size());
    assertEquals(List.of("java"), result.get(1).tags());
    verify(pathItems, never()).findPathIds(any());
    verify(itemTags, never()).findTags(any());
    verify(items)
        .findAllByUserIdOrderByUpdatedAtDesc(any(), argThat(page -> page.getPageSize() == 100));
  }

  @Test
  void itemCannotBeAttachedToAnotherUsersPath() {
    ItemRepository items = mock(ItemRepository.class);
    PathRepository paths = mock(PathRepository.class);
    PathItemRepository pathItems = mock(PathItemRepository.class);
    TagRepository tags = mock(TagRepository.class);
    ItemTagRepository itemTags = mock(ItemTagRepository.class);
    ActivityRepository activities = mock(ActivityRepository.class);
    ProgressEntryRepository progress = mock(ProgressEntryRepository.class);
    NoteRepository notes = mock(NoteRepository.class);
    UUID user = UUID.randomUUID(), foreignPath = UUID.randomUUID();
    when(items.save(any(Item.class))).thenAnswer(invocation -> invocation.getArgument(0));
    when(paths.findByIdAndUserId(foreignPath, user)).thenReturn(Optional.empty());
    KnowledgeService service =
        new KnowledgeService(items, paths, pathItems, tags, itemTags, activities, progress, notes);
    assertThrows(
        ResponseStatusException.class,
        () ->
            service.createItem(
                user,
                "Private item",
                ItemType.CUSTOM,
                null,
                null,
                List.of(foreignPath),
                List.of()));
    verify(pathItems, never()).save(any());
  }

  @Test
  void itemCannotBeAttachedToArchivedPath() {
    ItemRepository items = mock(ItemRepository.class);
    PathRepository paths = mock(PathRepository.class);
    PathItemRepository pathItems = mock(PathItemRepository.class);
    TagRepository tags = mock(TagRepository.class);
    ItemTagRepository itemTags = mock(ItemTagRepository.class);
    ActivityRepository activities = mock(ActivityRepository.class);
    ProgressEntryRepository progress = mock(ProgressEntryRepository.class);
    NoteRepository notes = mock(NoteRepository.class);
    UUID user = UUID.randomUUID(), archivedId = UUID.randomUUID();
    Path archived = new Path(user, "Archived", null);
    archived.archive();
    when(items.save(any(Item.class))).thenAnswer(invocation -> invocation.getArgument(0));
    when(paths.findByIdAndUserId(archivedId, user)).thenReturn(Optional.of(archived));
    KnowledgeService service =
        new KnowledgeService(items, paths, pathItems, tags, itemTags, activities, progress, notes);
    assertThrows(
        ResponseStatusException.class,
        () ->
            service.createItem(
                user, "New item", ItemType.CUSTOM, null, null, List.of(archivedId), List.of()));
    verify(pathItems, never()).save(any());
  }

  @Test
  void editingItemCanRetainExistingArchivedPathMembership() {
    ItemRepository items = mock(ItemRepository.class);
    PathRepository paths = mock(PathRepository.class);
    PathItemRepository pathItems = mock(PathItemRepository.class);
    TagRepository tags = mock(TagRepository.class);
    ItemTagRepository itemTags = mock(ItemTagRepository.class);
    ActivityRepository activities = mock(ActivityRepository.class);
    ProgressEntryRepository progress = mock(ProgressEntryRepository.class);
    NoteRepository notes = mock(NoteRepository.class);
    UUID user = UUID.randomUUID(), archivedId = UUID.randomUUID();
    Item item = new Item(user, "Existing item", ItemType.CUSTOM, null);
    Path archived = new Path(user, "Archived", null);
    archived.archive();
    when(items.findByIdAndUserId(item.getId(), user)).thenReturn(Optional.of(item));
    when(items.save(any(Item.class))).thenAnswer(invocation -> invocation.getArgument(0));
    when(pathItems.findPathIds(item.getId())).thenReturn(List.of(archivedId));
    when(paths.findByIdAndUserId(archivedId, user)).thenReturn(Optional.of(archived));
    KnowledgeService service =
        new KnowledgeService(items, paths, pathItems, tags, itemTags, activities, progress, notes);
    assertDoesNotThrow(
        () ->
            service.updateItem(
                user,
                item.getId(),
                item.getTitle(),
                item.getType(),
                item.getDescription(),
                item.getSource(),
                item.getStatus(),
                List.of(archivedId),
                List.of()));
    verify(pathItems).deleteAllByIdItemId(item.getId());
    verify(pathItems).save(any(PathItem.class));
  }

  @Test
  void timerRejectsSecondRunningTimerForSameUser() {
    TimeEntryRepository entries = mock(TimeEntryRepository.class);
    PathRepository paths = mock(PathRepository.class);
    ItemRepository items = mock(ItemRepository.class);
    ActivityRepository activities = mock(ActivityRepository.class);
    UUID user = UUID.randomUUID();
    TimeEntry running =
        new TimeEntry(user, null, null, java.time.Instant.now(), null, TimeSource.WEB);
    when(entries.findByUserIdAndEndedAtIsNull(user)).thenReturn(Optional.of(running));
    TimerService service =
        new TimerService(
            entries,
            paths,
            items,
            mock(PathItemRepository.class),
            mock(ProgressEntryRepository.class),
            activities);
    assertThrows(
        ResponseStatusException.class,
        () -> service.start(user, null, null, "duplicate", TimeSource.WEB));
    verify(entries, never()).save(any());
  }

  @Test
  void timerPreservesClientSource() {
    TimeEntryRepository entries = mock(TimeEntryRepository.class);
    PathRepository paths = mock(PathRepository.class);
    ItemRepository items = mock(ItemRepository.class);
    ActivityRepository activities = mock(ActivityRepository.class);
    UUID user = UUID.randomUUID();
    when(entries.findByUserIdAndEndedAtIsNull(user)).thenReturn(Optional.empty());
    when(entries.save(any(TimeEntry.class))).thenAnswer(invocation -> invocation.getArgument(0));
    TimerService.TimeView result =
        new TimerService(
                entries,
                paths,
                items,
                mock(PathItemRepository.class),
                mock(ProgressEntryRepository.class),
                activities)
            .start(user, null, null, "iOS", TimeSource.IOS);
    assertEquals(TimeSource.IOS, result.source());
    verify(entries).save(argThat(entry -> entry.getSource() == TimeSource.IOS));
  }

  @Test
  void editingSessionUpdatesItsCanonicalSessionRecord() {
    TimeEntryRepository entries = mock(TimeEntryRepository.class);
    PathRepository paths = mock(PathRepository.class);
    ItemRepository items = mock(ItemRepository.class);
    ActivityRepository activities = mock(ActivityRepository.class);
    UUID user = UUID.randomUUID();
    TimeEntry entry =
        new TimeEntry(user, null, null, Instant.parse("2026-08-28T10:00:00Z"), "Old", TimeSource.MANUAL);
    entry.stop(Instant.parse("2026-08-28T11:00:00Z"));
    when(entries.findByIdAndUserId(entry.getId(), user)).thenReturn(Optional.of(entry));
    when(entries.save(any(TimeEntry.class))).thenAnswer(invocation -> invocation.getArgument(0));

    new TimerService(
            entries,
            paths,
            items,
            mock(PathItemRepository.class),
            mock(ProgressEntryRepository.class),
            activities)
        .edit(
            user,
            entry.getId(),
            null,
            null,
            Instant.parse("2026-08-28T12:00:00Z"),
            Instant.parse("2026-08-28T12:30:00Z"),
            "Updated");

    assertEquals("Updated", entry.getDescription());
    assertEquals(1800, entry.getDurationSeconds());
    verify(activities, never()).save(any());
  }

  @Test
  void timerHistoryUsesABoundedPage() {
    TimeEntryRepository entries = mock(TimeEntryRepository.class);
    PathRepository paths = mock(PathRepository.class);
    ItemRepository items = mock(ItemRepository.class);
    UUID user = UUID.randomUUID();
    when(entries.findAllByUserIdOrderByStartedAtDesc(eq(user), any())).thenReturn(List.of());
    new TimerService(
            entries,
            paths,
            items,
            mock(PathItemRepository.class),
            mock(ProgressEntryRepository.class),
            mock(ActivityRepository.class))
        .history(user);
    verify(entries)
        .findAllByUserIdOrderByStartedAtDesc(eq(user), argThat(page -> page.getPageSize() == 100));
  }

  @Test
  void timerAcceptsAnOwnedItemThatIsNotAttachedToTheSelectedPath() {
    TimeEntryRepository entries = mock(TimeEntryRepository.class);
    PathRepository paths = mock(PathRepository.class);
    ItemRepository items = mock(ItemRepository.class);
    PathItemRepository pathItems = mock(PathItemRepository.class);
    ActivityRepository activities = mock(ActivityRepository.class);
    UUID user = UUID.randomUUID(), pathId = UUID.randomUUID(), itemId = UUID.randomUUID();
    when(entries.findByUserIdAndEndedAtIsNull(user)).thenReturn(Optional.empty());
    when(paths.findByIdAndUserId(pathId, user))
        .thenReturn(Optional.of(new Path(user, "Algorithms", null)));
    when(items.findByIdAndUserId(itemId, user))
        .thenReturn(Optional.of(new Item(user, "Writing", ItemType.CUSTOM, null)));
    when(entries.save(any(TimeEntry.class))).thenAnswer(invocation -> invocation.getArgument(0));
    TimerService service =
        new TimerService(
            entries, paths, items, pathItems, mock(ProgressEntryRepository.class), activities);
    assertDoesNotThrow(() -> service.start(user, pathId, itemId, "cross-path focus", TimeSource.WEB));
    verify(entries).save(any(TimeEntry.class));
  }

  @Test
  void runningTimerCanBeReconfiguredWithoutHidingOwnershipChecks() {
    TimeEntryRepository entries = mock(TimeEntryRepository.class);
    PathRepository paths = mock(PathRepository.class);
    ItemRepository items = mock(ItemRepository.class);
    PathItemRepository pathItems = mock(PathItemRepository.class);
    ActivityRepository activities = mock(ActivityRepository.class);
    UUID user = UUID.randomUUID(), timerId = UUID.randomUUID(), pathId = UUID.randomUUID();
    TimeEntry running =
        new TimeEntry(
            user, null, null, java.time.Instant.now().minusSeconds(30), "old", TimeSource.WEB);
    when(entries.findByIdAndUserId(timerId, user)).thenReturn(Optional.of(running));
    when(entries.save(running)).thenReturn(running);
    when(paths.findByIdAndUserId(pathId, user))
        .thenReturn(Optional.of(new Path(user, "Algorithms", null)));
    TimerService.TimeView result =
        new TimerService(
                entries, paths, items, pathItems, mock(ProgressEntryRepository.class), activities)
            .configureRunning(
                user,
                timerId,
                pathId,
                null,
                java.time.Instant.now().minusSeconds(60),
                null,
                "new");
    assertEquals(pathId, result.pathId());
    assertEquals("new", result.description());
    assertTrue(result.running());
    verify(entries).save(running);
  }

  @Test
  void runningTimerCanBeEndedAtAnEditedTime() {
    TimeEntryRepository entries = mock(TimeEntryRepository.class);
    PathRepository paths = mock(PathRepository.class);
    ItemRepository items = mock(ItemRepository.class);
    ActivityRepository activities = mock(ActivityRepository.class);
    UUID user = UUID.randomUUID(), timerId = UUID.randomUUID();
    Instant start = Instant.now().minusSeconds(120);
    Instant end = Instant.now().minusSeconds(60);
    TimeEntry running = new TimeEntry(user, null, null, start, "focus", TimeSource.WEB);
    when(entries.findByIdAndUserId(timerId, user)).thenReturn(Optional.of(running));
    when(entries.save(running)).thenReturn(running);

    TimerService.TimeView result =
        new TimerService(
                entries,
                paths,
                items,
                mock(PathItemRepository.class),
                mock(ProgressEntryRepository.class),
                activities)
            .configureRunning(user, timerId, null, null, start, end, "focus");

    assertFalse(result.running());
    assertEquals(end, result.endedAt());
    assertEquals(60, result.durationSeconds());
    verify(activities, never()).save(any());
  }

  @Test
  void timerCancellationDeletesOnlyTheUsersRunningTimer() {
    TimeEntryRepository entries = mock(TimeEntryRepository.class);
    PathRepository paths = mock(PathRepository.class);
    ItemRepository items = mock(ItemRepository.class);
    ActivityRepository activities = mock(ActivityRepository.class);
    UUID user = UUID.randomUUID(), timerId = UUID.randomUUID();
    TimeEntry running =
        new TimeEntry(user, null, null, java.time.Instant.now(), "cancel", TimeSource.WEB);
    when(entries.findById(timerId)).thenReturn(Optional.of(running));
    TimerService service =
        new TimerService(
            entries,
            paths,
            items,
            mock(PathItemRepository.class),
            mock(ProgressEntryRepository.class),
            activities);
    service.cancel(user, timerId);
    verify(entries).delete(running);
    verifyNoInteractions(activities);
  }

  @Test
  void noteCannotReferenceAnotherUsersActivity() {
    ItemRepository items = mock(ItemRepository.class);
    PathRepository paths = mock(PathRepository.class);
    PathItemRepository pathItems = mock(PathItemRepository.class);
    TagRepository tags = mock(TagRepository.class);
    ItemTagRepository itemTags = mock(ItemTagRepository.class);
    ActivityRepository activities = mock(ActivityRepository.class);
    ProgressEntryRepository progress = mock(ProgressEntryRepository.class);
    NoteRepository notes = mock(NoteRepository.class);
    UUID user = UUID.randomUUID(), foreignActivity = UUID.randomUUID();
    when(activities.findByIdAndUserId(foreignActivity, user)).thenReturn(Optional.empty());
    KnowledgeService service =
        new KnowledgeService(items, paths, pathItems, tags, itemTags, activities, progress, notes);
    assertThrows(
        ResponseStatusException.class,
        () -> service.createNote(user, null, null, foreignActivity, "Leak", "should reject"));
    verify(notes, never()).save(any());
  }

  @Test
  void ownerCanEditNoteAndForeignUserCannot() {
    NoteRepository notes = mock(NoteRepository.class);
    ItemRepository items = mock(ItemRepository.class);
    PathRepository paths = mock(PathRepository.class);
    PathItemRepository pathItems = mock(PathItemRepository.class);
    TagRepository tags = mock(TagRepository.class);
    ItemTagRepository itemTags = mock(ItemTagRepository.class);
    ActivityRepository activities = mock(ActivityRepository.class);
    ProgressEntryRepository progress = mock(ProgressEntryRepository.class);
    UUID owner = UUID.randomUUID(), foreign = UUID.randomUUID();
    Note note = new Note(owner, null, null, null, "Old", "Content");
    when(notes.findByIdAndUserId(note.getId(), owner)).thenReturn(Optional.of(note));
    when(notes.findByIdAndUserId(note.getId(), foreign)).thenReturn(Optional.empty());
    when(notes.save(any(Note.class))).thenAnswer(invocation -> invocation.getArgument(0));
    KnowledgeService service =
        new KnowledgeService(items, paths, pathItems, tags, itemTags, activities, progress, notes);
    assertEquals("Updated", service.updateNote(owner, note.getId(), "Updated", "Revised").title());
    assertEquals("Revised", note.getContent());
    assertThrows(
        ResponseStatusException.class,
        () -> service.updateNote(foreign, note.getId(), "Leak", "No"));
  }

  @Test
  void completingAnItemCreatesACompletionActivity() {
    ItemRepository items = mock(ItemRepository.class);
    PathRepository paths = mock(PathRepository.class);
    PathItemRepository pathItems = mock(PathItemRepository.class);
    TagRepository tags = mock(TagRepository.class);
    ItemTagRepository itemTags = mock(ItemTagRepository.class);
    ActivityRepository activities = mock(ActivityRepository.class);
    ProgressEntryRepository progress = mock(ProgressEntryRepository.class);
    NoteRepository notes = mock(NoteRepository.class);
    UUID user = UUID.randomUUID(), itemId = UUID.randomUUID();
    Item item = new Item(user, "Finish me", ItemType.PROJECT, null);
    when(items.findByIdAndUserId(itemId, user)).thenReturn(Optional.of(item));
    when(items.save(any(Item.class))).thenAnswer(invocation -> invocation.getArgument(0));
    when(itemTags.findAllByIdItemId(itemId)).thenReturn(List.of());
    KnowledgeService service =
        new KnowledgeService(items, paths, pathItems, tags, itemTags, activities, progress, notes);
    service.updateItem(
        user,
        itemId,
        item.getTitle(),
        item.getType(),
        item.getDescription(),
        item.getSource(),
        ItemStatus.COMPLETED,
        null,
        null);
    verify(activities).save(argThat(event -> event.getType() == ActivityType.ITEM_COMPLETED));
    verify(progress)
        .save(argThat(entry -> entry.getPreviousProgress() == 0 && entry.getNewProgress() == 100));
  }

  @Test
  void statisticsIncludesCompletionCountsAndRecentProgress() {
    TimeEntryRepository entries = mock(TimeEntryRepository.class);
    PathRepository paths = mock(PathRepository.class);
    ItemRepository items = mock(ItemRepository.class);
    ProgressEntryRepository progress = mock(ProgressEntryRepository.class);
    ActivityRepository activities = mock(ActivityRepository.class);
    UUID user = UUID.randomUUID(), itemId = UUID.randomUUID();
    when(entries.findOverlappingByUserId(eq(user), any(), any())).thenReturn(List.of());
    when(items.countByUserIdAndStatus(user, ItemStatus.COMPLETED)).thenReturn(3L);
    when(items.countByUserIdAndStatus(user, ItemStatus.ACTIVE)).thenReturn(2L);
    when(progress.findTop10ByUserIdOrderByChangedAtDesc(user))
        .thenReturn(List.of(new ProgressEntry(user, itemId, (short) 20, (short) 40)));
    TimerService.Statistics result =
        new TimerService(
                entries, paths, items, mock(PathItemRepository.class), progress, activities)
            .statistics(user);
    assertEquals(3, result.completedItems());
    assertEquals(2, result.activeItems());
    assertEquals(itemId, result.recentProgressChanges().getFirst().itemId());
    verify(entries, times(1)).findOverlappingByUserId(eq(user), any(), any());
  }

  @Test
  void statisticsBreakdownsIncludeElapsedRunningTime() {
    TimeEntryRepository entries = mock(TimeEntryRepository.class);
    PathRepository paths = mock(PathRepository.class);
    ItemRepository items = mock(ItemRepository.class);
    ProgressEntryRepository progress = mock(ProgressEntryRepository.class);
    ActivityRepository activities = mock(ActivityRepository.class);
    UUID user = UUID.randomUUID(), pathId = UUID.randomUUID(), itemId = UUID.randomUUID();
    TimeEntry running =
        new TimeEntry(
            user, pathId, itemId, java.time.Instant.now().minusSeconds(5), "live", TimeSource.WEB);
    when(entries.findOverlappingByUserId(eq(user), any(), any())).thenReturn(List.of(running));
    when(items.countByUserIdAndStatus(any(), any())).thenReturn(0L);
    when(progress.findTop10ByUserIdOrderByChangedAtDesc(user)).thenReturn(List.of());
    TimerService.Statistics result =
        new TimerService(
                entries, paths, items, mock(PathItemRepository.class), progress, activities)
            .statistics(user);
    assertTrue(result.todayByPath().get(pathId) >= 4);
    assertTrue(result.todayByItem().get(itemId) >= 4);
    assertTrue(result.weekByPath().get(pathId) >= 4);
    assertTrue(result.weekByItem().get(itemId) >= 4);
  }

  @Test
  void statisticsClipEntriesThatCrossTheUtcDayBoundary() {
    TimeEntryRepository entries = mock(TimeEntryRepository.class);
    PathRepository paths = mock(PathRepository.class);
    ItemRepository items = mock(ItemRepository.class);
    ProgressEntryRepository progress = mock(ProgressEntryRepository.class);
    ActivityRepository activities = mock(ActivityRepository.class);
    UUID user = UUID.randomUUID();
    var dayStart =
        java.time.LocalDate.now(java.time.ZoneOffset.UTC)
            .atStartOfDay(java.time.ZoneOffset.UTC)
            .toInstant();
    TimeEntry crossing =
        new TimeEntry(user, null, null, dayStart.minusSeconds(60), "crossing", TimeSource.MANUAL);
    crossing.stop(dayStart.plusSeconds(60));
    when(entries.findOverlappingByUserId(eq(user), any(), any())).thenReturn(List.of(crossing));
    when(items.countByUserIdAndStatus(any(), any())).thenReturn(0L);
    when(progress.findTop10ByUserIdOrderByChangedAtDesc(user)).thenReturn(List.of());

    TimerService.Statistics result =
        new TimerService(
                entries, paths, items, mock(PathItemRepository.class), progress, activities)
            .statistics(user);

    assertEquals(60, result.todaySeconds());
    assertEquals(120, result.weekSeconds());
    assertEquals(120, result.monthSeconds());
  }

  @Test
  void statisticsQueryCoversTheEntireCurrentMonthWhenItExceedsTheWeekWindow() {
    TimeEntryRepository entries = mock(TimeEntryRepository.class);
    PathRepository paths = mock(PathRepository.class);
    ItemRepository items = mock(ItemRepository.class);
    ProgressEntryRepository progress = mock(ProgressEntryRepository.class);
    ActivityRepository activities = mock(ActivityRepository.class);
    UUID user = UUID.randomUUID();
    when(entries.findOverlappingByUserId(eq(user), any(), any())).thenReturn(List.of());
    when(progress.findTop10ByUserIdOrderByChangedAtDesc(user)).thenReturn(List.of());
    TimerService service =
        new TimerService(
            entries, paths, items, mock(PathItemRepository.class), progress, activities);
    service.statistics(user);

    var from = org.mockito.ArgumentCaptor.forClass(java.time.Instant.class);
    verify(entries).findOverlappingByUserId(eq(user), from.capture(), any());
    var today = java.time.LocalDate.now(java.time.ZoneOffset.UTC);
    var weekStart = today.minusDays(6).atStartOfDay(java.time.ZoneOffset.UTC).toInstant();
    var monthStart = today.withDayOfMonth(1).atStartOfDay(java.time.ZoneOffset.UTC).toInstant();
    assertEquals(monthStart.isBefore(weekStart) ? monthStart : weekStart, from.getValue());
  }

  @Test
  void statisticsKeepWeekTotalsNarrowerThanMonthTotals() {
    TimeEntryRepository entries = mock(TimeEntryRepository.class);
    PathRepository paths = mock(PathRepository.class);
    ItemRepository items = mock(ItemRepository.class);
    ProgressEntryRepository progress = mock(ProgressEntryRepository.class);
    ActivityRepository activities = mock(ActivityRepository.class);
    UUID user = UUID.randomUUID();
    var today = java.time.LocalDate.now(java.time.ZoneOffset.UTC);
    var monthStart = today.withDayOfMonth(1).atStartOfDay(java.time.ZoneOffset.UTC).toInstant();
    var weekStart = today.minusDays(6).atStartOfDay(java.time.ZoneOffset.UTC).toInstant();
    TimeEntry older =
        new TimeEntry(user, null, null, monthStart.plusSeconds(3600), "older", TimeSource.MANUAL);
    older.stop(older.getStartedAt().plusSeconds(60));
    TimeEntry recent =
        new TimeEntry(user, null, null, weekStart.plusSeconds(3600), "recent", TimeSource.MANUAL);
    recent.stop(recent.getStartedAt().plusSeconds(120));
    when(entries.findOverlappingByUserId(eq(user), any(), any()))
        .thenReturn(List.of(recent, older));
    when(progress.findTop10ByUserIdOrderByChangedAtDesc(user)).thenReturn(List.of());
    TimerService.Statistics result =
        new TimerService(
                entries, paths, items, mock(PathItemRepository.class), progress, activities)
            .statistics(user);
    assertEquals(120, result.weekSeconds());
    assertEquals(180, result.monthSeconds());
  }

  @Test
  void filteredActivityQueriesUseBoundedRecentActivities() {
    ActivityRepository activities = mock(ActivityRepository.class);
    UUID user = UUID.randomUUID();
    UUID matchingPath = UUID.randomUUID(),
        matchingItem = UUID.randomUUID(),
        otherItem = UUID.randomUUID();
    java.time.Instant from = java.time.Instant.parse("2026-08-26T09:00:00Z");
    java.time.Instant to = java.time.Instant.parse("2026-08-26T11:00:00Z");
    Activity match =
        new Activity(
            user,
            matchingPath,
            matchingItem,
            ActivityType.PROGRESS_CHANGED,
            "Progress",
            null,
            java.time.Instant.parse("2026-08-26T10:00:00Z"));
    Activity wrongItem =
        new Activity(
            user,
            matchingPath,
            otherItem,
            ActivityType.PROGRESS_CHANGED,
            "Other item",
            null,
            java.time.Instant.parse("2026-08-26T10:00:00Z"));
    Activity tooOld =
        new Activity(
            user,
            matchingPath,
            matchingItem,
            ActivityType.PROGRESS_CHANGED,
            "Old",
            null,
            java.time.Instant.parse("2026-08-26T08:59:59Z"));
    when(activities.findTop100ByUserIdOrderByOccurredAtDesc(user))
        .thenReturn(List.of(match, wrongItem, tooOld));
    KnowledgeService service =
        new KnowledgeService(
            mock(ItemRepository.class),
            mock(PathRepository.class),
            mock(PathItemRepository.class),
            mock(TagRepository.class),
            mock(ItemTagRepository.class),
            activities,
            mock(ProgressEntryRepository.class),
            mock(NoteRepository.class));

    List<Activity> result =
        service.filteredActivities(
            user, from, to, matchingPath, matchingItem, ActivityType.PROGRESS_CHANGED);

    assertEquals(List.of(match), result);
    verify(activities).findTop100ByUserIdOrderByOccurredAtDesc(user);
  }
}
