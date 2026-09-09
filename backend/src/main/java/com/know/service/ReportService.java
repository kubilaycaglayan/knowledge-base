package com.know.service;

import com.know.domain.*;
import java.time.*;
import java.math.BigDecimal;
import java.time.temporal.TemporalAdjusters;
import java.time.format.DateTimeFormatter;
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
  public record SankeyNode(String id, String label, String color, int depth, long value, String pathLabel, String bucketLabel) {}
  public record SankeyLink(String source, String target, String sourceLabel, String targetLabel, long value) {}
  public record Sankey(String granularity, List<SankeyNode> nodes, List<SankeyLink> links) {}

  public record Report(
      String period,
      LocalDate from,
      LocalDate to,
      long totalSeconds,
      List<Day> days,
      List<Category> paths,
      List<Category> sessionLabels,
      List<CalendarLabelTotal> calendarLabels,
      Sankey sankey) {}

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
    Map<UUID, List<UUID>> labelsByEntry = new HashMap<>();
    if (entryLabels != null && !window.isEmpty()) {
      entryLabels.findAllByIdTimeEntryIdIn(window.stream().map(TimeEntry::getId).toList())
          .forEach(assignment -> labelsByEntry
              .computeIfAbsent(assignment.getTimeEntryId(), ignored -> new ArrayList<>())
              .add(assignment.getLabelId()));
    }
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
        .flatMap(entry -> labelsByEntry.getOrDefault(entry.getId(), List.of()).stream())
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
    Map<LocalDate, Long> totalsByDate = new HashMap<>();
    Map<LocalDate, Map<UUID, Long>> pathsByDate = new HashMap<>();
    Map<LocalDate, Map<UUID, Long>> labelsByDate = new HashMap<>();
    for (LocalDate date = fromDate; date.isBefore(toDateExclusive); date = date.plusDays(1)) {
      totalsByDate.put(date, 0L);
      pathsByDate.put(date, new HashMap<>());
      labelsByDate.put(date, new HashMap<>());
    }
    for (TimeEntry entry : window) {
      LocalDate firstDate = LocalDate.ofInstant(entry.getStartedAt().isAfter(from) ? entry.getStartedAt() : from, ZoneOffset.UTC);
      Instant actualEnd = entry.getEndedAt() == null ? now : entry.getEndedAt();
      Instant end = actualEnd.isBefore(to) ? actualEnd : to;
      LocalDate lastDate = LocalDate.ofInstant(end.minusNanos(1), ZoneOffset.UTC);
      for (LocalDate date = firstDate; !date.isAfter(lastDate); date = date.plusDays(1)) {
        long seconds = secondsIn(entry, date.atStartOfDay(ZoneOffset.UTC).toInstant(), date.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant(), now);
        if (seconds == 0) continue;
        Map<UUID, Long> dayLabels = labelsByDate.get(date);
        totalsByDate.merge(date, seconds, Long::sum);
        merge(pathsByDate.get(date), entry.getPathId(), seconds);
        labelsByEntry.getOrDefault(entry.getId(), List.of()).forEach(labelId -> merge(dayLabels, labelId, seconds));
        merge(allPaths, entry.getPathId(), seconds);
        labelsByEntry.getOrDefault(entry.getId(), List.of()).forEach(labelId -> merge(allLabels, labelId, seconds));
      }
    }
    List<Day> days = new ArrayList<>();
    for (LocalDate date = fromDate; date.isBefore(toDateExclusive); date = date.plusDays(1)) {
      days.add(
          new Day(
              date,
              totalsByDate.get(date),
              categories(pathsByDate.get(date), pathNames, pathColors, "Unassigned path"),
              categories(labelsByDate.get(date), labelNames, labelColors, "Unassigned label"),
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
            .sorted(Comparator.comparing(CalendarLabelTotal::label)).toList(),
        sankey(period, fromDate, toDateExclusive, days));
  }

  private static Sankey sankey(String period, LocalDate from, LocalDate toExclusive, List<Day> days) {
    SankeyGranularity granularity = SankeyGranularity.forRange(period, from, toExclusive);
    List<SankeyNode> nodes = new ArrayList<>();
    List<SankeyLink> links = new ArrayList<>();
    List<SankeyBucket> buckets = new ArrayList<>();
    int depth = 0;
    for (LocalDate bucketStart = from; bucketStart.isBefore(toExclusive); bucketStart = granularity.next(bucketStart)) {
      LocalDate bucketEnd = granularity.end(bucketStart, toExclusive);
      String bucketLabel = granularity.label(bucketStart, bucketEnd);
      Map<String, Category> bucketPaths = new HashMap<>();
      for (Day day : days) {
        if (day.date().isBefore(bucketStart) || !day.date().isBefore(bucketEnd)) continue;
        day.paths().forEach(path -> {
          String pathKey = path.id() == null ? "unassigned" : path.id().toString();
          bucketPaths.merge(pathKey, path, (existing, added) ->
              new Category(existing.id(), existing.label(), existing.seconds() + added.seconds(), existing.color()));
        });
      }
      LocalDate bucketDate = bucketStart;
      List<SankeyPath> bucketNodes = bucketPaths.entrySet().stream()
          .map(entry -> {
            Category path = entry.getValue();
            String nodeId = "bucket:" + bucketDate + ":path:" + entry.getKey();
            String nodeLabel = bucketLabel + " · " + path.label();
            return new SankeyPath(entry.getKey(), nodeId, nodeLabel, path.color(), path.seconds(), path.label(), bucketLabel);
          })
          .sorted(Comparator.comparingLong(SankeyPath::seconds).reversed().thenComparing(SankeyPath::label))
          .toList();
      int bucketDepth = depth++;
      bucketNodes.forEach(path -> nodes.add(
          new SankeyNode(path.nodeId(), path.label(), path.color(), bucketDepth, path.seconds(), path.pathLabel(), path.bucketLabel())));
      buckets.add(new SankeyBucket(bucketNodes));
    }
    for (int index = 0; index + 1 < buckets.size(); index++) {
      connectBuckets(buckets.get(index), buckets.get(index + 1), links);
    }
    return new Sankey(granularity.name(), List.copyOf(nodes), List.copyOf(links));
  }

  private static void connectBuckets(SankeyBucket source, SankeyBucket target, List<SankeyLink> links) {
    Map<String, Long> sourceRemaining = source.paths().stream()
        .collect(Collectors.toMap(SankeyPath::key, SankeyPath::seconds));
    Map<String, Long> targetRemaining = target.paths().stream()
        .collect(Collectors.toMap(SankeyPath::key, SankeyPath::seconds));
    Map<String, SankeyPath> targetsByKey = target.paths().stream()
        .collect(Collectors.toMap(SankeyPath::key, path -> path));

    for (SankeyPath sourcePath : source.paths()) {
      SankeyPath targetPath = targetsByKey.get(sourcePath.key());
      if (targetPath != null) {
        addFlow(sourcePath, targetPath, sourceRemaining, targetRemaining, links);
      }
    }
    for (SankeyPath sourcePath : source.paths()) {
      for (SankeyPath targetPath : target.paths()) {
        addFlow(sourcePath, targetPath, sourceRemaining, targetRemaining, links);
      }
    }
  }

  private static void addFlow(
      SankeyPath source,
      SankeyPath target,
      Map<String, Long> sourceRemaining,
      Map<String, Long> targetRemaining,
      List<SankeyLink> links) {
    long value = Math.min(
        sourceRemaining.getOrDefault(source.key(), 0L),
        targetRemaining.getOrDefault(target.key(), 0L));
    if (value <= 0) return;
    links.add(new SankeyLink(source.nodeId(), target.nodeId(), source.label(), target.label(), value));
    sourceRemaining.put(source.key(), sourceRemaining.get(source.key()) - value);
    targetRemaining.put(target.key(), targetRemaining.get(target.key()) - value);
  }

  private record SankeyBucket(List<SankeyPath> paths) {}
  private record SankeyPath(String key, String nodeId, String label, String color, long seconds, String pathLabel, String bucketLabel) {}

  private enum SankeyGranularity {
    DAY {
      LocalDate next(LocalDate date) { return date.plusDays(1); }
      LocalDate end(LocalDate start, LocalDate toExclusive) { return start.plusDays(1); }
      String label(LocalDate start, LocalDate end) { return start.format(DateTimeFormatter.ofPattern("EEE, MMM d", Locale.US)); }
    },
    WEEK {
      LocalDate next(LocalDate date) { return date.plusWeeks(1); }
      LocalDate end(LocalDate start, LocalDate toExclusive) { return start.plusWeeks(1).isAfter(toExclusive) ? toExclusive : start.plusWeeks(1); }
      String label(LocalDate start, LocalDate end) { return start.equals(end.minusDays(1)) ? start.format(DateTimeFormatter.ofPattern("MMM d", Locale.US)) : start.format(DateTimeFormatter.ofPattern("MMM d", Locale.US)) + "–" + end.minusDays(1).format(DateTimeFormatter.ofPattern("MMM d", Locale.US)); }
    },
    MONTH {
      LocalDate next(LocalDate date) { return date.plusMonths(1).withDayOfMonth(1); }
      LocalDate end(LocalDate start, LocalDate toExclusive) { LocalDate end = start.plusMonths(1).withDayOfMonth(1); return end.isAfter(toExclusive) ? toExclusive : end; }
      String label(LocalDate start, LocalDate end) { return start.format(DateTimeFormatter.ofPattern("MMM yyyy", Locale.US)); }
    };

    abstract LocalDate next(LocalDate date);
    abstract LocalDate end(LocalDate start, LocalDate toExclusive);
    abstract String label(LocalDate start, LocalDate end);

    static SankeyGranularity forRange(String period, LocalDate from, LocalDate toExclusive) {
      if ("WEEK".equals(period)) return DAY;
      if ("MONTH".equals(period)) return WEEK;
      if ("YEAR".equals(period)) return MONTH;
      long days = Duration.between(from.atStartOfDay(), toExclusive.atStartOfDay()).toDays();
      return days <= 7 ? DAY : days <= 62 ? WEEK : MONTH;
    }
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
