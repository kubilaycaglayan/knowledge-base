package com.know.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.know.domain.*;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;

class ReportServiceTest {
  @Test
  void reportUsesTheRequestedOwnerForPathsLabelsAndCalendarData() {
    TimeEntryRepository entries = mock(TimeEntryRepository.class);
    PathRepository paths = mock(PathRepository.class);
    LabelRepository labels = mock(LabelRepository.class);
    TimeEntryLabelRepository entryLabels = mock(TimeEntryLabelRepository.class);
    CalendarService calendar = mock(CalendarService.class);
    UUID owner = UUID.randomUUID();
    UUID foreignOwner = UUID.randomUUID();
    Path ownedPath = new Path(owner, "Owned path", null, "#2878D5");
    Path foreignPath = new Path(foreignOwner, "Foreign path", null, "#E05D44");
    Label ownedLabel = new Label(owner, "Owned label", "#2878D5");
    Label foreignLabel = new Label(foreignOwner, "Foreign label", "#E05D44");
    TimeEntry entry =
        new TimeEntry(
            owner,
            ownedPath.getId(),
            Instant.parse("2026-09-10T10:00:00Z"),
            "owned",
            TimeSource.WEB);
    entry.stop(Instant.parse("2026-09-10T11:00:00Z"));
    LocalDate date = LocalDate.of(2026, 9, 10);

    when(entries.findOverlappingByUserId(eq(owner), any(), any())).thenReturn(List.of(entry));
    when(paths.findByUserIdAndIdIn(owner, Set.of(ownedPath.getId())))
        .thenReturn(List.of(ownedPath));
    when(entryLabels.findAllByIdTimeEntryIdIn(List.of(entry.getId())))
        .thenReturn(
            List.of(
                new TimeEntryLabel(entry.getId(), ownedLabel.getId()),
                new TimeEntryLabel(entry.getId(), foreignLabel.getId())));
    when(labels.findAllByUserIdAndIdIn(owner, Set.of(ownedLabel.getId(), foreignLabel.getId())))
        .thenReturn(List.of(ownedLabel));
    when(calendar.days(owner, date, date))
        .thenReturn(
            List.of(
                new CalendarService.DayView(
                    date,
                    "Owned calendar note",
                    List.of(
                        new CalendarService.LabelAssignmentView(
                            UUID.randomUUID(), "Owned calendar", "#2878D5", null)))));

    ReportService.Report report =
        new ReportService(entries, paths, labels, entryLabels, calendar).report(owner, date, date);

    assertEquals(3600, report.totalSeconds());
    assertEquals(
        List.of("Owned path"), report.paths().stream().map(ReportService.Category::label).toList());
    assertTrue(
        report.sessionLabels().stream().noneMatch(value -> value.label().equals("Foreign label")));
    assertTrue(
        report.sankey().nodes().stream().allMatch(value -> value.label().contains("Owned path")));
    assertEquals("Owned calendar note", report.days().getFirst().calendarNote());
    assertEquals("Owned calendar", report.calendarLabels().getFirst().label());
    assertFalse(report.toString().contains(foreignPath.getName()));
    assertFalse(report.toString().contains(foreignLabel.getName()));
    verify(entries).findOverlappingByUserId(eq(owner), any(), any());
    verify(paths).findByUserIdAndIdIn(owner, Set.of(ownedPath.getId()));
    verify(labels).findAllByUserIdAndIdIn(owner, Set.of(ownedLabel.getId(), foreignLabel.getId()));
    verify(calendar).days(owner, date, date);
  }

  @Test
  void sankeyCarriesRemainingTimeIntoAPathInTheNextBucket() {
    TimeEntryRepository entries = mock(TimeEntryRepository.class);
    PathRepository paths = mock(PathRepository.class);
    UUID user = UUID.randomUUID();
    Path sourcePath = new Path(user, "Research", null, "#123456");
    Path targetPath = new Path(user, "Writing", null, "#654321");
    TimeEntry source =
        new TimeEntry(
            user,
            sourcePath.getId(),
            Instant.parse("2025-09-01T10:00:00Z"),
            "research",
            TimeSource.IMPORT);
    source.stop(Instant.parse("2025-09-01T10:01:40Z"));
    TimeEntry target =
        new TimeEntry(
            user,
            targetPath.getId(),
            Instant.parse("2025-09-02T10:00:00Z"),
            "writing",
            TimeSource.IMPORT);
    target.stop(Instant.parse("2025-09-02T10:01:00Z"));
    when(entries.findOverlappingByUserId(eq(user), any(), any()))
        .thenReturn(List.of(source, target));
    when(paths.findByUserIdAndIdIn(user, Set.of(sourcePath.getId(), targetPath.getId())))
        .thenReturn(List.of(sourcePath, targetPath));

    ReportService.Report report =
        new ReportService(entries, paths, mock(LabelRepository.class))
            .report(user, ReportService.Period.WEEK, LocalDate.of(2025, 9, 3));

    assertEquals(2, report.sankey().nodes().size());
    assertEquals(100, report.sankey().nodes().getFirst().value());
    assertEquals(60, report.sankey().nodes().getLast().value());
    assertEquals(1, report.sankey().links().size());
    assertEquals(60, report.sankey().links().getFirst().value());
    assertTrue(report.sankey().links().getFirst().sourceLabel().contains("Research"));
    assertTrue(report.sankey().links().getFirst().targetLabel().contains("Writing"));
  }

  @Test
  void monthlyReportShowsDailyPathAndLabelBreakdownsWithClippedIntervals() {
    TimeEntryRepository entries = mock(TimeEntryRepository.class);
    PathRepository paths = mock(PathRepository.class);
    LabelRepository labels = mock(LabelRepository.class);
    TimeEntryLabelRepository entryLabels = mock(TimeEntryLabelRepository.class);
    UUID user = UUID.randomUUID();
    Path path = new Path(user, "Wander", null, "#123456");
    Label label = new Label(user, "Walking", "#2878D5");
    Instant monthStart = LocalDate.of(2026, 7, 1).atStartOfDay(ZoneOffset.UTC).toInstant();
    TimeEntry crossing =
        new TimeEntry(
            user, path.getId(), monthStart.minusSeconds(30), "crossing", TimeSource.IMPORT);
    crossing.stop(monthStart.plusSeconds(30));
    TimeEntry later =
        new TimeEntry(
            user, path.getId(), Instant.parse("2026-07-12T10:00:00Z"), "later", TimeSource.IMPORT);
    later.stop(Instant.parse("2026-07-12T10:10:00Z"));
    when(entries.findOverlappingByUserId(eq(user), any(), any()))
        .thenReturn(List.of(later, crossing));
    when(paths.findByUserIdAndIdIn(user, Set.of(path.getId()))).thenReturn(List.of(path));
    when(entryLabels.findAllByIdTimeEntryIdIn(any()))
        .thenAnswer(
            invocation ->
                ((Collection<UUID>) invocation.getArgument(0))
                    .stream().map(id -> new TimeEntryLabel(id, label.getId())).toList());
    when(labels.findAllByUserIdAndIdIn(user, Set.of(label.getId()))).thenReturn(List.of(label));

    ReportService.Report report =
        new ReportService(entries, paths, labels, entryLabels, null)
            .report(user, ReportService.Period.MONTH, LocalDate.of(2026, 7, 20));

    assertEquals(LocalDate.of(2026, 7, 1), report.from());
    assertEquals(LocalDate.of(2026, 7, 31), report.to());
    assertEquals(630, report.totalSeconds());
    assertEquals(31, report.days().size());
    assertEquals(30, report.days().getFirst().totalSeconds());
    assertEquals("Wander", report.days().getFirst().paths().getFirst().label());
    assertEquals("#123456", report.days().getFirst().paths().getFirst().color());
    assertEquals(600, report.days().get(11).totalSeconds());
    assertEquals(630, report.paths().getFirst().seconds());
    assertEquals("Walking", report.sessionLabels().getFirst().label());
    assertEquals("#2878D5", report.sessionLabels().getFirst().color());
    assertEquals("WEEK", report.sankey().granularity());
    assertEquals(2, report.sankey().nodes().size());
    assertEquals(1, report.sankey().links().size());
    assertEquals(0, report.sankey().nodes().getFirst().depth());
    assertEquals(1, report.sankey().nodes().getLast().depth());
    assertTrue(report.sankey().nodes().stream().allMatch(node -> node.label().contains("Wander")));
    assertTrue(report.sankey().links().stream().anyMatch(link -> link.value() == 30));
    assertTrue(
        report.sankey().links().stream().allMatch(link -> !link.source().equals(link.target())));
    verify(entryLabels, times(1)).findAllByIdTimeEntryIdIn(any());
    verify(entryLabels, never()).findAllByIdTimeEntryId(any());
  }

  @Test
  void labelFilterCombinesWithPathFilterAndKeepsOnlyMatchingEntries() {
    TimeEntryRepository entries = mock(TimeEntryRepository.class);
    PathRepository paths = mock(PathRepository.class);
    LabelRepository labels = mock(LabelRepository.class);
    TimeEntryLabelRepository entryLabels = mock(TimeEntryLabelRepository.class);
    UUID user = UUID.randomUUID();
    UUID selectedPath = UUID.randomUUID();
    Path path = new Path(user, "Writing", null, "#123456");
    Label ownedLabel = new Label(user, "Focus", "#2878D5");
    TimeEntry matching =
        new TimeEntry(
            user, selectedPath, Instant.parse("2026-08-25T10:00:00Z"), "matching", TimeSource.WEB);
    matching.stop(Instant.parse("2026-08-25T11:00:00Z"));
    TimeEntry wrongLabel =
        new TimeEntry(
            user,
            selectedPath,
            Instant.parse("2026-08-25T12:00:00Z"),
            "wrong label",
            TimeSource.WEB);
    wrongLabel.stop(Instant.parse("2026-08-25T13:00:00Z"));
    when(entries.findOverlappingByUserIdAndPathIdIn(
            eq(user), eq(Set.of(selectedPath)), any(), any()))
        .thenReturn(List.of(wrongLabel, matching));
    when(entryLabels.findAllByIdTimeEntryIdIn(any()))
        .thenReturn(List.of(new TimeEntryLabel(matching.getId(), ownedLabel.getId())));
    when(labels.findAllByUserIdAndIdIn(user, Set.of(ownedLabel.getId())))
        .thenReturn(List.of(ownedLabel));
    when(paths.findByUserIdAndIdIn(user, Set.of(selectedPath))).thenReturn(List.of(path));

    ReportService.Report report =
        new ReportService(entries, paths, labels, entryLabels, null)
            .report(
                user,
                LocalDate.of(2026, 8, 25),
                LocalDate.of(2026, 8, 25),
                ReportService.Aggregation.DAY,
                Set.of(selectedPath),
                Set.of(ownedLabel.getId()));

    assertEquals(3600, report.totalSeconds());
    assertEquals(1, report.paths().size());
    assertEquals(3600, report.sessionLabels().getFirst().seconds());
    verify(entries)
        .findOverlappingByUserIdAndPathIdIn(eq(user), eq(Set.of(selectedPath)), any(), any());
  }

  @Test
  void yearReportContainsEveryUtcDay() {
    TimeEntryRepository entries = mock(TimeEntryRepository.class);
    when(entries.findOverlappingByUserId(any(), any(), any())).thenReturn(List.of());
    ReportService.Report report =
        new ReportService(entries, mock(PathRepository.class), mock(LabelRepository.class))
            .report(UUID.randomUUID(), ReportService.Period.YEAR, LocalDate.of(2024, 6, 3));

    assertEquals(366, report.days().size());
    assertEquals(LocalDate.of(2024, 1, 1), report.from());
    assertEquals(LocalDate.of(2024, 12, 31), report.to());
    assertEquals("MONTH", report.sankey().granularity());
    assertTrue(report.sankey().nodes().isEmpty());
    assertTrue(report.sankey().links().isEmpty());
  }

  @Test
  void customReportUsesTheInclusiveRequestedRange() {
    TimeEntryRepository entries = mock(TimeEntryRepository.class);
    when(entries.findOverlappingByUserId(any(), any(), any())).thenReturn(List.of());

    ReportService.Report report =
        new ReportService(entries, mock(PathRepository.class), mock(LabelRepository.class))
            .report(UUID.randomUUID(), LocalDate.of(2026, 8, 24), LocalDate.of(2026, 8, 30));

    assertEquals("CUSTOM", report.period());
    assertEquals(7, report.days().size());
    assertEquals(LocalDate.of(2026, 8, 24), report.from());
    assertEquals(LocalDate.of(2026, 8, 30), report.to());
    assertEquals("DAY", report.sankey().granularity());
    assertTrue(report.sankey().nodes().isEmpty());
  }

  @Test
  void customReportUsesTheRequestedQuarterlyAggregation() {
    TimeEntryRepository entries = mock(TimeEntryRepository.class);
    PathRepository paths = mock(PathRepository.class);
    UUID user = UUID.randomUUID();
    Path path = new Path(user, "Writing", null, "#123456");
    TimeEntry january =
        new TimeEntry(
            user,
            path.getId(),
            Instant.parse("2026-01-02T10:00:00Z"),
            "January",
            TimeSource.IMPORT);
    january.stop(Instant.parse("2026-01-02T11:00:00Z"));
    TimeEntry april =
        new TimeEntry(
            user, path.getId(), Instant.parse("2026-04-02T10:00:00Z"), "April", TimeSource.IMPORT);
    april.stop(Instant.parse("2026-04-02T11:00:00Z"));
    when(entries.findOverlappingByUserId(eq(user), any(), any()))
        .thenReturn(List.of(january, april));
    when(paths.findByUserIdAndIdIn(user, Set.of(path.getId()))).thenReturn(List.of(path));

    ReportService.Report report =
        new ReportService(entries, paths, mock(LabelRepository.class))
            .report(
                user,
                LocalDate.of(2026, 1, 1),
                LocalDate.of(2026, 6, 30),
                ReportService.Aggregation.QUARTER);

    assertEquals("QUARTER", report.sankey().granularity());
    assertEquals(
        List.of("Q1 2026", "Q2 2026"),
        report.sankey().nodes().stream().map(ReportService.SankeyNode::bucketLabel).toList());
  }

  @Test
  void runningUnassignedTimeIsClippedAtNowAndReportedUnderFallbackCategories() {
    TimeEntryRepository entries = mock(TimeEntryRepository.class);
    UUID user = UUID.randomUUID();
    TimeEntry running =
        new TimeEntry(user, null, Instant.now().minusSeconds(5), "unassigned", TimeSource.WEB);
    when(entries.findOverlappingByUserId(eq(user), any(), any())).thenReturn(List.of(running));

    ReportService.Report report =
        new ReportService(entries, mock(PathRepository.class), mock(LabelRepository.class))
            .report(user, ReportService.Period.WEEK, LocalDate.now(ZoneOffset.UTC));

    assertTrue(report.totalSeconds() >= 3);
    assertEquals("Unassigned path", report.paths().getFirst().label());
    assertEquals(report.totalSeconds(), report.paths().getFirst().seconds());
    assertTrue(report.sessionLabels().isEmpty());
  }

  @Test
  void calendarLabelsAreIncludedInDayDetailsAndTotalsWithMarkerCounts() {
    TimeEntryRepository entries = mock(TimeEntryRepository.class);
    CalendarService calendar = mock(CalendarService.class);
    UUID user = UUID.randomUUID();
    UUID labelId = UUID.randomUUID();
    LocalDate date = LocalDate.of(2026, 8, 25);
    when(entries.findOverlappingByUserId(eq(user), any(), any())).thenReturn(List.of());
    when(calendar.days(user, date, date))
        .thenReturn(
            List.of(
                new CalendarService.DayView(
                    date,
                    "Annual leave",
                    List.of(
                        new CalendarService.LabelAssignmentView(
                            labelId, "Vacation", "#009688", null),
                        new CalendarService.LabelAssignmentView(
                            UUID.randomUUID(), "Half day", "#2878D5", new BigDecimal("0.50"))))));

    ReportService.Report report =
        new ReportService(
                entries,
                mock(PathRepository.class),
                mock(LabelRepository.class),
                mock(TimeEntryLabelRepository.class),
                calendar)
            .report(user, date, date);

    assertEquals("Annual leave", report.days().getFirst().calendarNote());
    assertEquals(2, report.days().getFirst().calendarLabels().size());
    assertEquals(2, report.calendarLabels().size());
    var vacation =
        report.calendarLabels().stream()
            .filter(label -> label.label().equals("Vacation"))
            .findFirst()
            .orElseThrow();
    var halfDay =
        report.calendarLabels().stream()
            .filter(label -> label.label().equals("Half day"))
            .findFirst()
            .orElseThrow();
    assertEquals(BigDecimal.ZERO, vacation.days());
    assertEquals(1, vacation.markers());
    assertEquals(new BigDecimal("0.50"), halfDay.days());
    assertEquals(0, halfDay.markers());
  }

  @Test
  void sameDayCustomReportsStillContainOneDayWhenThereIsNoTrackedTime() {
    TimeEntryRepository entries = mock(TimeEntryRepository.class);
    when(entries.findOverlappingByUserId(any(), any(), any())).thenReturn(List.of());

    ReportService.Report report =
        new ReportService(entries, mock(PathRepository.class), mock(LabelRepository.class))
            .report(UUID.randomUUID(), LocalDate.of(2026, 8, 25), LocalDate.of(2026, 8, 25));

    assertEquals(1, report.days().size());
    assertEquals(0, report.totalSeconds());
    assertEquals(LocalDate.of(2026, 8, 25), report.days().getFirst().date());
  }
}
