package com.know.service;

import com.know.domain.*;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Instant;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ClockifyImportServiceTest {
    @Test void importCreatesMissingPathAndUsesClockifyIdForDuplicateProtection() {
        PathRepository paths=mock(PathRepository.class); TimeEntryRepository entries=mock(TimeEntryRepository.class); ActivityRepository activities=mock(ActivityRepository.class);
        UUID user=UUID.randomUUID(); Path created=new Path(user,"Java","Imported from Clockify");
        when(paths.findByUserIdAndNameIgnoreCase(user,"Java")).thenReturn(List.of());
        when(paths.save(any(Path.class))).thenReturn(created);
        when(entries.findByUserIdAndSourceAndExternalId(user,TimeSource.IMPORT,"clockify-1")).thenReturn(Optional.empty(),Optional.of(new TimeEntry(user,created.getId(),null,Instant.now(),"Chapter 1",TimeSource.IMPORT,"clockify-1")));
        when(entries.save(any(TimeEntry.class))).thenAnswer(invocation -> invocation.getArgument(0));
        var entry=new ClockifyImportService.ClockifyEntry("clockify-1","Chapter 1",new ClockifyImportService.ClockifyInterval(Instant.parse("2026-08-25T10:00:00Z"),Instant.parse("2026-08-25T10:30:00Z"),null),"Java");
        var service=new ClockifyImportService(paths,entries,activities);

        var result=service.importEntries(user,new ClockifyImportService.ClockifyImportRequest(List.of(entry)));

        assertEquals(1,result.imported()); assertEquals(1,result.createdPaths());
        verify(entries).save(argThat(saved -> saved.getSource()==TimeSource.IMPORT && saved.getExternalId().equals("clockify-1") && saved.getDurationSeconds()==1800));
        var activity = ArgumentCaptor.forClass(Activity.class);
        verify(activities).save(activity.capture());
        assertEquals(entry.timeInterval().start(), activity.getValue().getOccurredAt());
        assertTrue(activity.getValue().getDetail().contains("2026-08-25T10:00:00Z"));
        assertTrue(activity.getValue().getDetail().contains("2026-08-25T10:30:00Z"));
        var duplicate=service.importEntries(user,new ClockifyImportService.ClockifyImportRequest(List.of(entry)));
        assertEquals(0,duplicate.imported()); assertEquals(1,duplicate.skipped()); assertEquals(0,duplicate.createdPaths()); verify(entries,times(1)).save(any(TimeEntry.class));
    }
}
