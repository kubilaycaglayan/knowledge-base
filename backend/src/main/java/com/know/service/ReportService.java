package com.know.service;

import com.know.domain.*;
import java.time.*;
import java.math.BigDecimal;
import java.time.temporal.TemporalAdjusters;
import java.util.*;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;

@Service
public class ReportService {
  private final TimeEntryRepository entries;
  private final PathRepository paths;
  private final LabelRepository sessionLabels;
  private final TimeEntryLabelRepository entryLabels;
  private final CalendarService calendar;

  public ReportService(TimeEntryRepository entries, PathRepository paths, LabelRepository sessionLabels) {
    this(entries, paths, sessionLabels, null, null);
  }

  @Autowired
  public ReportService(
      TimeEntryRepository entries,
      PathRepository paths,
      LabelRepository sessionLabels,
      TimeEntryLabelRepository entryLabels,
      CalendarService calendar) {
    this.entries = entries;
    this.paths = paths;
    this.sessionLabels = sessionLabels;
    this.entryLabels = entryLabels;
    this.calendar = calendar;
  }

  public record Category(UUID id, String label, long seconds, String color) {}

  public record CalendarLabel(UUID id, String label, String color, BigDecimal portion) {}
  public record CalendarLabelTotal(UUID id, String label, String color, BigDecimal days, long markers) {}
  public record Day(
      LocalDate date, long totalSeconds, List<Category> paths, List<Category> sessionLabels, String calendarNote, List<CalendarLabel> calendarLabels) {}

  public record Report(
      String period,
      LocalDate from,
      LocalDate to,
      long totalSeconds,
      List<Day> days,
      List<Category> paths,
      List<Category> sessionLabels,
      List<CalendarLabelTotal> calendarLabels) {}

  public Report report(UUID userId, Period period, LocalDate anchor) {
    LocalDate selected = anchor == null ? LocalDate.now(ZoneOffset.UTC) : anchor;
    LocalDate fromDate = period.start(selected);
    LocalDate toDateExclusive = period.next(fromDate);
    return report(userId, period.name(), fromDate, toDateExclusive);
  }

  public Report report(UUID userId, LocalDate fromDate, LocalDate toDate) {
    return report(userId, "CUSTOM", fromDate, toDate.plusDays(1));
  }

  private Report report(
      UUID userId, String period, LocalDate fromDate, LocalDate toDateExclusive) {
    Instant from = fromDate.atStartOfDay(ZoneOffset.UTC).toInstant();
    Instant reportEnd = toDateExclusive.atStartOfDay(ZoneOffset.UTC).toInstant();
    Instant now = Instant.now();
    Instant to = reportEnd.isBefore(now) ? reportEnd : now;
    List<TimeEntry> window =
        to.isAfter(from) ? entries.findOverlappingByUserId(userId, from, to) : List.of();
    Map<LocalDate, List<CalendarLabel>> calendarByDate = new HashMap<>();
    Map<LocalDate, String> calendarNotesByDate = new HashMap<>();
    Map<UUID, CalendarLabelTotalAccumulator> calendarTotals = new HashMap<>();
    if (calendar != null) {
      calendar.days(userId, fromDate, toDateExclusive.minusDays(1)).forEach(day -> {
        List<CalendarLabel> labels = day.labels().stream().map(label -> new CalendarLabel(label.labelId(), label.name(), label.color(), label.portion())).toList();
        calendarByDate.put(day.date(), labels);
        if (day.note() != null) calendarNotesByDate.put(day.date(), day.note());
        labels.forEach(label -> calendarTotals.computeIfAbsent(label.id(), ignored -> new CalendarLabelTotalAccumulator(label)).add(label.portion()));
      });
    }

    Set<UUID> pathIds =
        window.stream()
            .map(TimeEntry::getPathId)
            .filter(Objects::nonNull)
            .collect(Collectors.toSet());
    Set<UUID> labelIds =
        window.stream()
        .flatMap(entry -> labelIds(entry).stream())
            .collect(Collectors.toSet());
    List<Path> pathViews = pathIds.isEmpty() ? List.of() : paths.findByUserIdAndIdIn(userId, pathIds);
    Map<UUID, String> pathNames =
        pathViews.stream().collect(Collectors.toMap(Path::getId, Path::getName));
    Map<UUID, String> pathColors =
        pathViews.stream().collect(Collectors.toMap(Path::getId, Path::getColor));
    List<Label> labelViews =
        labelIds.isEmpty() ? List.of() : sessionLabels.findAllByUserIdAndIdIn(userId, labelIds);
    Map<UUID, String> labelNames =
        labelViews.stream().collect(Collectors.toMap(Label::getId, Label::getName));
    Map<UUID, String> labelColors =
        labelViews.stream()
            .filter(label -> label.getColor() != null)
            .collect(Collectors.toMap(Label::getId, Label::getColor));

    Map<UUID, Long> allPaths = new HashMap<>();
    Map<UUID, Long> allLabels = new HashMap<>();
    List<Day> days = new ArrayList<>();
    for (LocalDate date = fromDate; date.isBefore(toDateExclusive); date = date.plusDays(1)) {
      Instant dayFrom = date.atStartOfDay(ZoneOffset.UTC).toInstant();
      Instant dayTo = date.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant();
      long reportSeconds = 0;
      Map<UUID, Long> dayPaths = new HashMap<>();
      Map<UUID, Long> dayLabels = new HashMap<>();
      for (TimeEntry entry : window) {
        long seconds = secondsIn(entry, dayFrom, dayTo, now);
        if (seconds == 0) continue;
        reportSeconds += seconds;
        merge(dayPaths, entry.getPathId(), seconds);
        labelIds(entry).forEach(labelId -> merge(dayLabels, labelId, seconds));
        merge(allPaths, entry.getPathId(), seconds);
        labelIds(entry).forEach(labelId -> merge(allLabels, labelId, seconds));
      }
      days.add(
          new Day(
              date,
              reportSeconds,
              categories(dayPaths, pathNames, pathColors, "Unassigned path"),
              categories(dayLabels, labelNames, labelColors, "Unassigned label"),
              calendarNotesByDate.get(date),
              calendarByDate.getOrDefault(date, List.of())));
    }
    long total = days.stream().mapToLong(Day::totalSeconds).sum();
    return new Report(
        period,
        fromDate,
        toDateExclusive.minusDays(1),
        total,
        List.copyOf(days),
        categories(allPaths, pathNames, pathColors, "Unassigned path"),
        categories(allLabels, labelNames, labelColors, "Unassigned label"),
        calendarTotals.values().stream().map(CalendarLabelTotalAccumulator::view)
            .sorted(Comparator.comparing(CalendarLabelTotal::label)).toList());
  }

  private static class CalendarLabelTotalAccumulator {
    private final CalendarLabel label;
    private BigDecimal days = BigDecimal.ZERO;
    private long markers;
    CalendarLabelTotalAccumulator(CalendarLabel label) { this.label = label; }
    void add(BigDecimal portion) { if (portion == null) markers++; else days = days.add(portion); }
    CalendarLabelTotal view() { return new CalendarLabelTotal(label.id(), label.label(), label.color(), days, markers); }
  }

  private static void merge(Map<UUID, Long> totals, UUID id, long seconds) {
    totals.merge(id, seconds, Long::sum);
  }

  private List<UUID> labelIds(TimeEntry entry) {
    if (entryLabels == null) return List.of();
    return entryLabels.findAllByIdTimeEntryId(entry.getId()).stream()
        .map(TimeEntryLabel::getLabelId)
        .toList();
  }

  private static List<Category> categories(
      Map<UUID, Long> totals, Map<UUID, String> names, Map<UUID, String> colors, String unassigned) {
    return totals.entrySet().stream()
        .map(
            entry ->
                new Category(
                    entry.getKey(),
                    entry.getKey() == null
                        ? unassigned
                        : names.getOrDefault(entry.getKey(), "Removed entity"),
                    entry.getValue(),
                    entry.getKey() == null ? null : colors.get(entry.getKey())))
        .sorted(
            Comparator.comparingLong(Category::seconds).reversed().thenComparing(Category::label))
        .toList();
  }

  private static long secondsIn(TimeEntry entry, Instant from, Instant to, Instant now) {
    Instant start = entry.getStartedAt().isAfter(from) ? entry.getStartedAt() : from;
    Instant actualEnd = entry.getEndedAt() == null ? now : entry.getEndedAt();
    Instant end = actualEnd.isBefore(to) ? actualEnd : to;
    return Math.max(0, Duration.between(start, end).toSeconds());
  }

  public enum Period {
    WEEK {
      LocalDate start(LocalDate date) {
        return date.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
      }

      LocalDate next(LocalDate start) {
        return start.plusWeeks(1);
      }
    },
    MONTH {
      LocalDate start(LocalDate date) {
        return date.withDayOfMonth(1);
      }

      LocalDate next(LocalDate start) {
        return start.plusMonths(1);
      }
    },
    YEAR {
      LocalDate start(LocalDate date) {
        return date.withDayOfYear(1);
      }

      LocalDate next(LocalDate start) {
        return start.plusYears(1);
      }
    };

    abstract LocalDate start(LocalDate date);

    abstract LocalDate next(LocalDate start);
  }
}
