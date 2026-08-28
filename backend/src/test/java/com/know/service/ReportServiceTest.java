package com.know.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.know.domain.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;

class ReportServiceTest {
  @Test
  void monthlyReportShowsDailyPathAndItemBreakdownsWithClippedIntervals() {
    TimeEntryRepository entries = mock(TimeEntryRepository.class);
    PathRepository paths = mock(PathRepository.class);
    ItemRepository items = mock(ItemRepository.class);
    UUID user = UUID.randomUUID();
    Path path = new Path(user, "Wander", null);
    Item item = new Item(user, "Walking", ItemType.EXERCISE, null);
    Instant monthStart = LocalDate.of(2026, 7, 1).atStartOfDay(ZoneOffset.UTC).toInstant();
    TimeEntry crossing =
        new TimeEntry(
            user,
            path.getId(),
            item.getId(),
            monthStart.minusSeconds(30),
            "crossing",
            TimeSource.IMPORT);
    crossing.stop(monthStart.plusSeconds(30));
    TimeEntry later =
        new TimeEntry(
            user,
            path.getId(),
            item.getId(),
            Instant.parse("2026-07-12T10:00:00Z"),
            "later",
            TimeSource.IMPORT);
    later.stop(Instant.parse("2026-07-12T10:10:00Z"));
    when(entries.findOverlappingByUserId(eq(user), any(), any()))
        .thenReturn(List.of(later, crossing));
    when(paths.findByUserIdAndIdIn(user, Set.of(path.getId()))).thenReturn(List.of(path));
    when(items.findAllByUserIdAndIdIn(user, Set.of(item.getId()))).thenReturn(List.of(item));

    ReportService.Report report =
        new ReportService(entries, paths, items)
            .report(user, ReportService.Period.MONTH, LocalDate.of(2026, 7, 20));

    assertEquals(LocalDate.of(2026, 7, 1), report.from());
    assertEquals(LocalDate.of(2026, 7, 31), report.to());
    assertEquals(630, report.totalSeconds());
    assertEquals(31, report.days().size());
    assertEquals(30, report.days().getFirst().totalSeconds());
    assertEquals("Wander", report.days().getFirst().paths().getFirst().label());
    assertEquals(600, report.days().get(11).totalSeconds());
    assertEquals(630, report.paths().getFirst().seconds());
    assertEquals("Walking", report.items().getFirst().label());
  }

  @Test
  void yearReportContainsEveryUtcDay() {
    TimeEntryRepository entries = mock(TimeEntryRepository.class);
    when(entries.findOverlappingByUserId(any(), any(), any())).thenReturn(List.of());
    ReportService.Report report =
        new ReportService(entries, mock(PathRepository.class), mock(ItemRepository.class))
            .report(UUID.randomUUID(), ReportService.Period.YEAR, LocalDate.of(2024, 6, 3));

    assertEquals(366, report.days().size());
    assertEquals(LocalDate.of(2024, 1, 1), report.from());
    assertEquals(LocalDate.of(2024, 12, 31), report.to());
  }

  @Test
  void customReportUsesTheInclusiveRequestedRange() {
    TimeEntryRepository entries = mock(TimeEntryRepository.class);
    when(entries.findOverlappingByUserId(any(), any(), any())).thenReturn(List.of());

    ReportService.Report report =
        new ReportService(entries, mock(PathRepository.class), mock(ItemRepository.class))
            .report(UUID.randomUUID(), LocalDate.of(2026, 8, 24), LocalDate.of(2026, 8, 30));

    assertEquals("CUSTOM", report.period());
    assertEquals(7, report.days().size());
    assertEquals(LocalDate.of(2026, 8, 24), report.from());
    assertEquals(LocalDate.of(2026, 8, 30), report.to());
  }
}
