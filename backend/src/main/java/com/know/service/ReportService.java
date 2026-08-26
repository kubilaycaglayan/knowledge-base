package com.know.service;

import com.know.domain.*;
import org.springframework.stereotype.Service;

import java.time.*;
import java.time.temporal.TemporalAdjusters;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class ReportService {
    private final TimeEntryRepository entries;
    private final PathRepository paths;
    private final ItemRepository items;

    public ReportService(TimeEntryRepository entries, PathRepository paths, ItemRepository items) {
        this.entries = entries;
        this.paths = paths;
        this.items = items;
    }

    public record Category(UUID id, String label, long seconds) {}
    public record Day(LocalDate date, long totalSeconds, List<Category> paths, List<Category> items) {}
    public record Report(String period, LocalDate from, LocalDate to, long totalSeconds, List<Day> days, List<Category> paths, List<Category> items) {}

    public Report report(UUID userId, Period period, LocalDate anchor) {
        LocalDate selected = anchor == null ? LocalDate.now(ZoneOffset.UTC) : anchor;
        LocalDate fromDate = period.start(selected);
        LocalDate toDateExclusive = period.next(fromDate);
        Instant from = fromDate.atStartOfDay(ZoneOffset.UTC).toInstant();
        Instant reportEnd = toDateExclusive.atStartOfDay(ZoneOffset.UTC).toInstant();
        Instant now = Instant.now();
        Instant to = reportEnd.isBefore(now) ? reportEnd : now;
        List<TimeEntry> window = to.isAfter(from) ? entries.findOverlappingByUserId(userId, from, to) : List.of();

        Set<UUID> pathIds = window.stream().map(TimeEntry::getPathId).filter(Objects::nonNull).collect(Collectors.toSet());
        Set<UUID> itemIds = window.stream().map(TimeEntry::getItemId).filter(Objects::nonNull).collect(Collectors.toSet());
        Map<UUID, String> pathNames = pathIds.isEmpty() ? Map.of() : paths.findByUserIdAndIdIn(userId, pathIds).stream().collect(Collectors.toMap(Path::getId, Path::getName));
        Map<UUID, String> itemNames = itemIds.isEmpty() ? Map.of() : items.findAllByUserIdAndIdIn(userId, itemIds).stream().collect(Collectors.toMap(Item::getId, Item::getTitle));

        Map<UUID, Long> allPaths = new HashMap<>();
        Map<UUID, Long> allItems = new HashMap<>();
        List<Day> days = new ArrayList<>();
        for (LocalDate date = fromDate; date.isBefore(toDateExclusive); date = date.plusDays(1)) {
            Instant dayFrom = date.atStartOfDay(ZoneOffset.UTC).toInstant();
            Instant dayTo = date.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant();
            long reportSeconds = 0;
            Map<UUID, Long> dayPaths = new HashMap<>();
            Map<UUID, Long> dayItems = new HashMap<>();
            for (TimeEntry entry : window) {
                long seconds = secondsIn(entry, dayFrom, dayTo, now);
                if (seconds == 0) continue;
                reportSeconds += seconds;
                merge(dayPaths, entry.getPathId(), seconds);
                merge(dayItems, entry.getItemId(), seconds);
                merge(allPaths, entry.getPathId(), seconds);
                merge(allItems, entry.getItemId(), seconds);
            }
            days.add(new Day(date, reportSeconds, categories(dayPaths, pathNames, "Unassigned path"), categories(dayItems, itemNames, "Unassigned item")));
        }
        long total = days.stream().mapToLong(Day::totalSeconds).sum();
        return new Report(period.name(), fromDate, toDateExclusive.minusDays(1), total, List.copyOf(days), categories(allPaths, pathNames, "Unassigned path"), categories(allItems, itemNames, "Unassigned item"));
    }

    private static void merge(Map<UUID, Long> totals, UUID id, long seconds) { totals.merge(id, seconds, Long::sum); }

    private static List<Category> categories(Map<UUID, Long> totals, Map<UUID, String> names, String unassigned) {
        return totals.entrySet().stream().map(entry -> new Category(entry.getKey(), entry.getKey() == null ? unassigned : names.getOrDefault(entry.getKey(), "Removed entity"), entry.getValue())).sorted(Comparator.comparingLong(Category::seconds).reversed().thenComparing(Category::label)).toList();
    }

    private static long secondsIn(TimeEntry entry, Instant from, Instant to, Instant now) {
        Instant start = entry.getStartedAt().isAfter(from) ? entry.getStartedAt() : from;
        Instant actualEnd = entry.getEndedAt() == null ? now : entry.getEndedAt();
        Instant end = actualEnd.isBefore(to) ? actualEnd : to;
        return Math.max(0, Duration.between(start, end).toSeconds());
    }

    public enum Period {
        WEEK { LocalDate start(LocalDate date) { return date.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)); } LocalDate next(LocalDate start) { return start.plusWeeks(1); } },
        MONTH { LocalDate start(LocalDate date) { return date.withDayOfMonth(1); } LocalDate next(LocalDate start) { return start.plusMonths(1); } },
        YEAR { LocalDate start(LocalDate date) { return date.withDayOfYear(1); } LocalDate next(LocalDate start) { return start.plusYears(1); } };
        abstract LocalDate start(LocalDate date);
        abstract LocalDate next(LocalDate start);
    }
}
