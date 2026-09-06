package com.know.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.know.domain.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class KnowledgeServiceEdgeTest {
  private final ItemRepository items = mock(ItemRepository.class);
  private final PathRepository paths = mock(PathRepository.class);
  private final PathItemRepository pathItems = mock(PathItemRepository.class);
  private final TagRepository tags = mock(TagRepository.class);
  private final ItemTagRepository itemTags = mock(ItemTagRepository.class);
  private final ActivityRepository activities = mock(ActivityRepository.class);
  private final ProgressEntryRepository progress = mock(ProgressEntryRepository.class);
  private final NoteRepository notes = mock(NoteRepository.class);
  private final TimeEntryRepository timeEntries = mock(TimeEntryRepository.class);
  private final TimeEntryItemRepository entryItems = mock(TimeEntryItemRepository.class);

  private KnowledgeService service() {
    return new KnowledgeService(
        items, paths, pathItems, tags, itemTags, activities, progress, notes, timeEntries, entryItems);
  }

  @Test
  void createItemNormalizesValidTagsAndIgnoresBlankOrOversizedTags() {
    UUID user = UUID.randomUUID();
    Tag tag = new Tag(user, "java");
    when(items.save(any(Item.class))).thenAnswer(invocation -> invocation.getArgument(0));
    when(tags.findByUserIdAndNameIgnoreCase(user, "java")).thenReturn(Optional.of(tag));
    when(pathItems.findPathIds(any())).thenReturn(List.of());
    when(itemTags.findTags(any())).thenReturn(List.of(tag));

    KnowledgeService.ItemView result =
        service()
            .createItem(
                user,
                "Algorithms",
                ItemType.COURSE,
                null,
                null,
                null,
                List.of("  Java  ", "", "x".repeat(81)));

    assertEquals(List.of("java"), result.tags());
    verify(tags).findByUserIdAndNameIgnoreCase(user, "java");
    verify(itemTags).save(any(ItemTag.class));
    verify(tags, never()).findByUserIdAndNameIgnoreCase(user, "");
    verify(activities).save(argThat(event -> event.getType() == ActivityType.ITEM_CREATED));
  }

  @Test
  void noteRejectsMultipleTargetsAndValidatesTimeEntryOwnership() {
    UUID user = UUID.randomUUID();
    UUID itemId = UUID.randomUUID();
    UUID timeEntryId = UUID.randomUUID();
    KnowledgeService service = service();

    assertThrows(
        ResponseStatusException.class,
        () -> service.createNote(user, null, itemId, null, timeEntryId, "Two targets", "reject"));
    verifyNoInteractions(notes, timeEntries);

    when(timeEntries.findByIdAndUserId(timeEntryId, user)).thenReturn(Optional.empty());
    assertThrows(
        ResponseStatusException.class,
        () -> service.createNote(user, null, null, null, timeEntryId, "Foreign", "reject"));
    verify(notes, never()).save(any());

    TimeEntry owned =
        new TimeEntry(
            user,
            null,
            null,
            Instant.parse("2026-08-25T10:00:00Z"),
            "session",
            TimeSource.WEB);
    when(timeEntries.findByIdAndUserId(timeEntryId, user)).thenReturn(Optional.of(owned));
    when(notes.save(any(Note.class))).thenAnswer(invocation -> invocation.getArgument(0));

    KnowledgeService.NoteView view =
        service.createNote(user, null, null, null, timeEntryId, "Session note", "Useful");

    assertEquals(timeEntryId, view.timeEntryId());
    verify(notes).save(any(Note.class));
  }

  @Test
  void timelineRemovesPersistedTimerEventsAndSynthesizesFilteredSessionActivities() {
    UUID user = UUID.randomUUID();
    UUID itemId = UUID.randomUUID();
    Instant started = Instant.parse("2026-08-25T10:00:00Z");
    Instant ended = started.plusSeconds(90);
    TimeEntry entry = new TimeEntry(user, null, null, started, "Reading", TimeSource.WEB);
    entry.stop(ended);
    Activity timerEvent =
        new Activity(user, null, null, ActivityType.TIMER_STARTED, "ignored", null, started);
    Activity progressEvent =
        new Activity(user, null, itemId, ActivityType.PROGRESS_CHANGED, "Progress", null, ended);
    when(activities.findTop100ByUserIdOrderByOccurredAtDesc(user))
        .thenReturn(List.of(timerEvent, progressEvent));
    when(timeEntries.findAllByUserIdOrderByStartedAtDesc(eq(user), any())).thenReturn(List.of(entry));
    when(entryItems.findAllByIdTimeEntryId(entry.getId()))
        .thenReturn(List.of(new TimeEntryItem(entry.getId(), itemId)));

    List<Activity> result = service().filteredActivities(user, null, null, null, itemId, null);

    assertEquals(2, result.size());
    assertTrue(result.stream().noneMatch(activity -> activity.getType() == ActivityType.TIMER_STARTED));
    Activity session = result.stream().filter(activity -> activity.getType() == ActivityType.TIME_TRACKED).findFirst().orElseThrow();
    assertEquals(entry.getId(), session.getTimeEntryId());
    assertEquals(itemId, session.getItemId());
    assertEquals("Tracked 90 seconds", session.getTitle());
  }
}
