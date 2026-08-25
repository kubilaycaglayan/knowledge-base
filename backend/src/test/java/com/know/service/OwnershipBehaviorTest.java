package com.know.service;

import com.know.domain.*;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class OwnershipBehaviorTest {
    @Test void listingItemsLoadsPathAndTagRelationshipsInBulk() {
        ItemRepository items=mock(ItemRepository.class); PathRepository paths=mock(PathRepository.class); PathItemRepository pathItems=mock(PathItemRepository.class); TagRepository tags=mock(TagRepository.class); ItemTagRepository itemTags=mock(ItemTagRepository.class); ActivityRepository activities=mock(ActivityRepository.class); ProgressEntryRepository progress=mock(ProgressEntryRepository.class); NoteRepository notes=mock(NoteRepository.class);
        Item first=new Item(UUID.randomUUID(),"First",ItemType.CUSTOM,null), second=new Item(UUID.randomUUID(),"Second",ItemType.CUSTOM,null);
        PathItemRepository.ItemPathProjection pathRow=mock(PathItemRepository.ItemPathProjection.class); when(pathRow.getItemId()).thenReturn(first.getId()); when(pathRow.getPathId()).thenReturn(UUID.randomUUID());
        ItemTagRepository.ItemTagProjection tagRow=mock(ItemTagRepository.ItemTagProjection.class); when(tagRow.getItemId()).thenReturn(second.getId()); when(tagRow.getName()).thenReturn("java");
        when(items.findAllByUserIdOrderByUpdatedAtDesc(any(),any())).thenReturn(List.of(first,second)); when(pathItems.findRelationships(any())).thenReturn(List.of(pathRow)); when(itemTags.findRelationships(any())).thenReturn(List.of(tagRow));
        KnowledgeService service=new KnowledgeService(items,paths,pathItems,tags,itemTags,activities,progress,notes);
        List<KnowledgeService.ItemView> result=service.listItems(UUID.randomUUID());
        assertEquals(2,result.size()); assertEquals(1,result.get(0).pathIds().size()); assertEquals(List.of("java"),result.get(1).tags()); verify(pathItems,never()).findPathIds(any()); verify(itemTags,never()).findTags(any());
        verify(items).findAllByUserIdOrderByUpdatedAtDesc(any(),argThat(page->page.getPageSize()==100));
    }

    @Test void itemCannotBeAttachedToAnotherUsersPath() {
        ItemRepository items=mock(ItemRepository.class); PathRepository paths=mock(PathRepository.class);
        PathItemRepository pathItems=mock(PathItemRepository.class); TagRepository tags=mock(TagRepository.class);
        ItemTagRepository itemTags=mock(ItemTagRepository.class); ActivityRepository activities=mock(ActivityRepository.class);
        ProgressEntryRepository progress=mock(ProgressEntryRepository.class); NoteRepository notes=mock(NoteRepository.class);
        UUID user=UUID.randomUUID(), foreignPath=UUID.randomUUID();
        when(items.save(any(Item.class))).thenAnswer(invocation->invocation.getArgument(0));
        when(paths.findByIdAndUserId(foreignPath,user)).thenReturn(Optional.empty());
        KnowledgeService service=new KnowledgeService(items,paths,pathItems,tags,itemTags,activities,progress,notes);
        assertThrows(ResponseStatusException.class,()->service.createItem(user,"Private item",ItemType.CUSTOM,null,List.of(foreignPath),List.of()));
        verify(pathItems,never()).save(any());
    }

    @Test void itemCannotBeAttachedToArchivedPath() {
        ItemRepository items=mock(ItemRepository.class); PathRepository paths=mock(PathRepository.class); PathItemRepository pathItems=mock(PathItemRepository.class); TagRepository tags=mock(TagRepository.class); ItemTagRepository itemTags=mock(ItemTagRepository.class); ActivityRepository activities=mock(ActivityRepository.class); ProgressEntryRepository progress=mock(ProgressEntryRepository.class); NoteRepository notes=mock(NoteRepository.class);
        UUID user=UUID.randomUUID(), archivedId=UUID.randomUUID(); Path archived=new Path(user,"Archived",null); archived.archive();
        when(items.save(any(Item.class))).thenAnswer(invocation->invocation.getArgument(0)); when(paths.findByIdAndUserId(archivedId,user)).thenReturn(Optional.of(archived));
        KnowledgeService service=new KnowledgeService(items,paths,pathItems,tags,itemTags,activities,progress,notes);
        assertThrows(ResponseStatusException.class,()->service.createItem(user,"New item",ItemType.CUSTOM,null,List.of(archivedId),List.of()));
        verify(pathItems,never()).save(any());
    }

    @Test void editingItemCanRetainExistingArchivedPathMembership() {
        ItemRepository items=mock(ItemRepository.class); PathRepository paths=mock(PathRepository.class); PathItemRepository pathItems=mock(PathItemRepository.class); TagRepository tags=mock(TagRepository.class); ItemTagRepository itemTags=mock(ItemTagRepository.class); ActivityRepository activities=mock(ActivityRepository.class); ProgressEntryRepository progress=mock(ProgressEntryRepository.class); NoteRepository notes=mock(NoteRepository.class);
        UUID user=UUID.randomUUID(), archivedId=UUID.randomUUID(); Item item=new Item(user,"Existing item",ItemType.CUSTOM,null); Path archived=new Path(user,"Archived",null); archived.archive();
        when(items.findByIdAndUserId(item.getId(),user)).thenReturn(Optional.of(item)); when(items.save(any(Item.class))).thenAnswer(invocation->invocation.getArgument(0)); when(pathItems.findPathIds(item.getId())).thenReturn(List.of(archivedId)); when(paths.findByIdAndUserId(archivedId,user)).thenReturn(Optional.of(archived));
        KnowledgeService service=new KnowledgeService(items,paths,pathItems,tags,itemTags,activities,progress,notes);
        assertDoesNotThrow(()->service.updateItem(user,item.getId(),item.getTitle(),item.getType(),item.getDescription(),item.getStatus(),List.of(archivedId),List.of()));
        verify(pathItems).deleteAllByIdItemId(item.getId());
        verify(pathItems).save(any(PathItem.class));
    }

    @Test void timerRejectsSecondRunningTimerForSameUser() {
        TimeEntryRepository entries=mock(TimeEntryRepository.class); PathRepository paths=mock(PathRepository.class); ItemRepository items=mock(ItemRepository.class); ActivityRepository activities=mock(ActivityRepository.class);
        UUID user=UUID.randomUUID(); TimeEntry running=new TimeEntry(user,null,null,java.time.Instant.now(),null,TimeSource.WEB);
        when(entries.findByUserIdAndEndedAtIsNull(user)).thenReturn(Optional.of(running));
        TimerService service=new TimerService(entries,paths,items,mock(PathItemRepository.class),mock(ProgressEntryRepository.class),activities);
        assertThrows(ResponseStatusException.class,()->service.start(user,null,null,"duplicate",TimeSource.WEB));
        verify(entries,never()).save(any());
    }

    @Test void timerPreservesClientSource() {
        TimeEntryRepository entries=mock(TimeEntryRepository.class); PathRepository paths=mock(PathRepository.class); ItemRepository items=mock(ItemRepository.class); ActivityRepository activities=mock(ActivityRepository.class);
        UUID user=UUID.randomUUID(); when(entries.findByUserIdAndEndedAtIsNull(user)).thenReturn(Optional.empty()); when(entries.save(any(TimeEntry.class))).thenAnswer(invocation->invocation.getArgument(0));
        TimerService.TimeView result=new TimerService(entries,paths,items,mock(PathItemRepository.class),mock(ProgressEntryRepository.class),activities).start(user,null,null,"iOS",TimeSource.IOS);
        assertEquals(TimeSource.IOS,result.source()); verify(entries).save(argThat(entry->entry.getSource()==TimeSource.IOS));
    }

    @Test void timerHistoryUsesABoundedPage() {
        TimeEntryRepository entries=mock(TimeEntryRepository.class); PathRepository paths=mock(PathRepository.class); ItemRepository items=mock(ItemRepository.class); UUID user=UUID.randomUUID();
        when(entries.findAllByUserIdOrderByStartedAtDesc(eq(user),any())).thenReturn(List.of());
        new TimerService(entries,paths,items,mock(PathItemRepository.class),mock(ProgressEntryRepository.class),mock(ActivityRepository.class)).history(user);
        verify(entries).findAllByUserIdOrderByStartedAtDesc(eq(user),argThat(page->page.getPageSize()==100));
    }

    @Test void timerRejectsAnItemThatIsNotAttachedToTheSelectedPath() {
        TimeEntryRepository entries=mock(TimeEntryRepository.class); PathRepository paths=mock(PathRepository.class); ItemRepository items=mock(ItemRepository.class); PathItemRepository pathItems=mock(PathItemRepository.class); ActivityRepository activities=mock(ActivityRepository.class);
        UUID user=UUID.randomUUID(), pathId=UUID.randomUUID(), itemId=UUID.randomUUID();
        when(entries.findByUserIdAndEndedAtIsNull(user)).thenReturn(Optional.empty());
        when(paths.findByIdAndUserId(pathId,user)).thenReturn(Optional.of(new Path(user,"Algorithms",null)));
        when(items.findByIdAndUserId(itemId,user)).thenReturn(Optional.of(new Item(user,"Writing",ItemType.CUSTOM,null)));
        when(pathItems.existsByIdPathIdAndIdItemId(pathId,itemId)).thenReturn(false);
        TimerService service=new TimerService(entries,paths,items,pathItems,mock(ProgressEntryRepository.class),activities);
        assertThrows(ResponseStatusException.class,()->service.start(user,pathId,itemId,"wrong path",TimeSource.WEB));
        verify(entries,never()).save(any());
    }

    @Test void runningTimerCanBeReconfiguredWithoutHidingOwnershipChecks() {
        TimeEntryRepository entries=mock(TimeEntryRepository.class); PathRepository paths=mock(PathRepository.class); ItemRepository items=mock(ItemRepository.class); PathItemRepository pathItems=mock(PathItemRepository.class); ActivityRepository activities=mock(ActivityRepository.class);
        UUID user=UUID.randomUUID(), timerId=UUID.randomUUID(), pathId=UUID.randomUUID();
        TimeEntry running=new TimeEntry(user,null,null,java.time.Instant.now().minusSeconds(30),"old",TimeSource.WEB);
        when(entries.findByIdAndUserId(timerId,user)).thenReturn(Optional.of(running)); when(entries.save(running)).thenReturn(running); when(paths.findByIdAndUserId(pathId,user)).thenReturn(Optional.of(new Path(user,"Algorithms",null)));
        TimerService.TimeView result=new TimerService(entries,paths,items,pathItems,mock(ProgressEntryRepository.class),activities).configureRunning(user,timerId,pathId,null,java.time.Instant.now().minusSeconds(60),"new");
        assertEquals(pathId,result.pathId()); assertEquals("new",result.description()); assertTrue(result.running()); verify(entries).save(running);
    }

    @Test void timerCancellationDeletesOnlyTheUsersRunningTimer() {
        TimeEntryRepository entries=mock(TimeEntryRepository.class); PathRepository paths=mock(PathRepository.class); ItemRepository items=mock(ItemRepository.class); ActivityRepository activities=mock(ActivityRepository.class);
        UUID user=UUID.randomUUID(), timerId=UUID.randomUUID(); TimeEntry running=new TimeEntry(user,null,null,java.time.Instant.now(),"cancel",TimeSource.WEB);
        when(entries.findById(timerId)).thenReturn(Optional.of(running));
        TimerService service=new TimerService(entries,paths,items,mock(PathItemRepository.class),mock(ProgressEntryRepository.class),activities);
        service.cancel(user,timerId);
        verify(entries).delete(running);
        verifyNoInteractions(activities);
    }

    @Test void noteCannotReferenceAnotherUsersActivity() {
        ItemRepository items=mock(ItemRepository.class); PathRepository paths=mock(PathRepository.class); PathItemRepository pathItems=mock(PathItemRepository.class); TagRepository tags=mock(TagRepository.class); ItemTagRepository itemTags=mock(ItemTagRepository.class); ActivityRepository activities=mock(ActivityRepository.class); ProgressEntryRepository progress=mock(ProgressEntryRepository.class); NoteRepository notes=mock(NoteRepository.class);
        UUID user=UUID.randomUUID(), foreignActivity=UUID.randomUUID();
        when(activities.findByIdAndUserId(foreignActivity,user)).thenReturn(Optional.empty());
        KnowledgeService service=new KnowledgeService(items,paths,pathItems,tags,itemTags,activities,progress,notes);
        assertThrows(ResponseStatusException.class,()->service.createNote(user,null,null,foreignActivity,"Leak","should reject"));
        verify(notes,never()).save(any());
    }

    @Test void ownerCanEditNoteAndForeignUserCannot() {
        NoteRepository notes=mock(NoteRepository.class); ItemRepository items=mock(ItemRepository.class); PathRepository paths=mock(PathRepository.class); PathItemRepository pathItems=mock(PathItemRepository.class); TagRepository tags=mock(TagRepository.class); ItemTagRepository itemTags=mock(ItemTagRepository.class); ActivityRepository activities=mock(ActivityRepository.class); ProgressEntryRepository progress=mock(ProgressEntryRepository.class);
        UUID owner=UUID.randomUUID(), foreign=UUID.randomUUID(); Note note=new Note(owner,null,null,null,"Old","Content"); when(notes.findByIdAndUserId(note.getId(),owner)).thenReturn(Optional.of(note)); when(notes.findByIdAndUserId(note.getId(),foreign)).thenReturn(Optional.empty()); when(notes.save(any(Note.class))).thenAnswer(invocation->invocation.getArgument(0));
        KnowledgeService service=new KnowledgeService(items,paths,pathItems,tags,itemTags,activities,progress,notes);
        assertEquals("Updated",service.updateNote(owner,note.getId(),"Updated","Revised").title()); assertEquals("Revised",note.getContent()); assertThrows(ResponseStatusException.class,()->service.updateNote(foreign,note.getId(),"Leak","No"));
    }

    @Test void completingAnItemCreatesACompletionActivity() {
        ItemRepository items=mock(ItemRepository.class); PathRepository paths=mock(PathRepository.class); PathItemRepository pathItems=mock(PathItemRepository.class); TagRepository tags=mock(TagRepository.class); ItemTagRepository itemTags=mock(ItemTagRepository.class); ActivityRepository activities=mock(ActivityRepository.class); ProgressEntryRepository progress=mock(ProgressEntryRepository.class); NoteRepository notes=mock(NoteRepository.class);
        UUID user=UUID.randomUUID(), itemId=UUID.randomUUID(); Item item=new Item(user,"Finish me",ItemType.PROJECT,null);
        when(items.findByIdAndUserId(itemId,user)).thenReturn(Optional.of(item)); when(items.save(any(Item.class))).thenAnswer(invocation->invocation.getArgument(0)); when(itemTags.findAllByIdItemId(itemId)).thenReturn(List.of());
        KnowledgeService service=new KnowledgeService(items,paths,pathItems,tags,itemTags,activities,progress,notes);
        service.updateItem(user,itemId,item.getTitle(),item.getType(),item.getDescription(),ItemStatus.COMPLETED,null,null);
        verify(activities).save(argThat(event->event.getType()==ActivityType.ITEM_COMPLETED));
        verify(progress).save(argThat(entry->entry.getPreviousProgress()==0&&entry.getNewProgress()==100));
    }

    @Test void statisticsIncludesCompletionCountsAndRecentProgress() {
        TimeEntryRepository entries=mock(TimeEntryRepository.class); PathRepository paths=mock(PathRepository.class); ItemRepository items=mock(ItemRepository.class); ProgressEntryRepository progress=mock(ProgressEntryRepository.class); ActivityRepository activities=mock(ActivityRepository.class);
        UUID user=UUID.randomUUID(), itemId=UUID.randomUUID();
        when(entries.findAllByUserIdAndStartedAtBetweenOrderByStartedAtDesc(eq(user),any(),any())).thenReturn(List.of());
        when(items.countByUserIdAndStatus(user,ItemStatus.COMPLETED)).thenReturn(3L); when(items.countByUserIdAndStatus(user,ItemStatus.ACTIVE)).thenReturn(2L);
        when(progress.findTop10ByUserIdOrderByChangedAtDesc(user)).thenReturn(List.of(new ProgressEntry(user,itemId,(short)20,(short)40)));
        TimerService.Statistics result=new TimerService(entries,paths,items,mock(PathItemRepository.class),progress,activities).statistics(user);
        assertEquals(3,result.completedItems()); assertEquals(2,result.activeItems()); assertEquals(itemId,result.recentProgressChanges().getFirst().itemId()); verify(entries,times(1)).findAllByUserIdAndStartedAtBetweenOrderByStartedAtDesc(eq(user),any(),any());
    }

    @Test void statisticsBreakdownsIncludeElapsedRunningTime() {
        TimeEntryRepository entries=mock(TimeEntryRepository.class); PathRepository paths=mock(PathRepository.class); ItemRepository items=mock(ItemRepository.class); ProgressEntryRepository progress=mock(ProgressEntryRepository.class); ActivityRepository activities=mock(ActivityRepository.class);
        UUID user=UUID.randomUUID(), pathId=UUID.randomUUID(), itemId=UUID.randomUUID(); TimeEntry running=new TimeEntry(user,pathId,itemId,java.time.Instant.now().minusSeconds(5),"live",TimeSource.WEB);
        when(entries.findAllByUserIdAndStartedAtBetweenOrderByStartedAtDesc(eq(user),any(),any())).thenReturn(List.of(running)); when(items.countByUserIdAndStatus(any(),any())).thenReturn(0L); when(progress.findTop10ByUserIdOrderByChangedAtDesc(user)).thenReturn(List.of());
        TimerService.Statistics result=new TimerService(entries,paths,items,mock(PathItemRepository.class),progress,activities).statistics(user);
        assertTrue(result.todayByPath().get(pathId)>=4); assertTrue(result.todayByItem().get(itemId)>=4); assertTrue(result.weekByPath().get(pathId)>=4); assertTrue(result.weekByItem().get(itemId)>=4);
    }

    @Test void statisticsQueryCoversTheEntireCurrentMonthWhenItExceedsTheWeekWindow() {
        TimeEntryRepository entries=mock(TimeEntryRepository.class); PathRepository paths=mock(PathRepository.class); ItemRepository items=mock(ItemRepository.class); ProgressEntryRepository progress=mock(ProgressEntryRepository.class); ActivityRepository activities=mock(ActivityRepository.class);
        UUID user=UUID.randomUUID();
        when(entries.findAllByUserIdAndStartedAtBetweenOrderByStartedAtDesc(eq(user),any(),any())).thenReturn(List.of());
        when(progress.findTop10ByUserIdOrderByChangedAtDesc(user)).thenReturn(List.of());
        TimerService service=new TimerService(entries,paths,items,mock(PathItemRepository.class),progress,activities);
        service.statistics(user);

        var from=org.mockito.ArgumentCaptor.forClass(java.time.Instant.class);
        verify(entries).findAllByUserIdAndStartedAtBetweenOrderByStartedAtDesc(eq(user),from.capture(),any());
        var today=java.time.LocalDate.now(java.time.ZoneOffset.UTC);
        var weekStart=today.minusDays(6).atStartOfDay(java.time.ZoneOffset.UTC).toInstant();
        var monthStart=today.withDayOfMonth(1).atStartOfDay(java.time.ZoneOffset.UTC).toInstant();
        assertEquals(monthStart.isBefore(weekStart)?monthStart:weekStart,from.getValue());
    }

    @Test void statisticsKeepWeekTotalsNarrowerThanMonthTotals() {
        TimeEntryRepository entries=mock(TimeEntryRepository.class); PathRepository paths=mock(PathRepository.class); ItemRepository items=mock(ItemRepository.class); ProgressEntryRepository progress=mock(ProgressEntryRepository.class); ActivityRepository activities=mock(ActivityRepository.class);
        UUID user=UUID.randomUUID(); var today=java.time.LocalDate.now(java.time.ZoneOffset.UTC); var monthStart=today.withDayOfMonth(1).atStartOfDay(java.time.ZoneOffset.UTC).toInstant(); var weekStart=today.minusDays(6).atStartOfDay(java.time.ZoneOffset.UTC).toInstant();
        TimeEntry older=new TimeEntry(user,null,null,monthStart.plusSeconds(3600),"older",TimeSource.MANUAL); older.stop(older.getStartedAt().plusSeconds(60));
        TimeEntry recent=new TimeEntry(user,null,null,weekStart.plusSeconds(3600),"recent",TimeSource.MANUAL); recent.stop(recent.getStartedAt().plusSeconds(120));
        when(entries.findAllByUserIdAndStartedAtBetweenOrderByStartedAtDesc(eq(user),any(),any())).thenReturn(List.of(recent,older)); when(progress.findTop10ByUserIdOrderByChangedAtDesc(user)).thenReturn(List.of());
        TimerService.Statistics result=new TimerService(entries,paths,items,mock(PathItemRepository.class),progress,activities).statistics(user);
        assertEquals(120,result.weekSeconds()); assertEquals(180,result.monthSeconds());
    }

    @Test void filteredActivityQueriesUseAProviderBoundedPage() {
        ActivityRepository activities=mock(ActivityRepository.class); UUID user=UUID.randomUUID();
        when(activities.findFiltered(eq(user),any(),any(),any(),any(),any(),any())).thenReturn(List.of());
        KnowledgeService service=new KnowledgeService(mock(ItemRepository.class),mock(PathRepository.class),mock(PathItemRepository.class),mock(TagRepository.class),mock(ItemTagRepository.class),activities,mock(ProgressEntryRepository.class),mock(NoteRepository.class));

        service.filteredActivities(user,null,null,null,null,null);

        verify(activities).findFiltered(eq(user),isNull(),isNull(),isNull(),isNull(),isNull(),argThat(page->page.getPageSize()==100));
    }
}
