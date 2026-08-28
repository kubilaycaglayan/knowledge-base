package com.know.service;

import com.know.domain.*;
import java.time.*;
import java.util.*;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class TimerService {
  private final TimeEntryRepository entries;
  private final PathRepository paths;
  private final ItemRepository items;
  private final PathItemRepository pathItems;
  private final ProgressEntryRepository progress;
  private final ActivityRepository activities;
  private final TimeEntryItemRepository entryItems;

  public TimerService(
      TimeEntryRepository entries,
      PathRepository paths,
      ItemRepository items,
      PathItemRepository pathItems,
      ProgressEntryRepository progress,
      ActivityRepository activities) {
    this(entries, paths, items, pathItems, progress, activities, null);
  }

  @Autowired
  public TimerService(
      TimeEntryRepository entries,
      PathRepository paths,
      ItemRepository items,
      PathItemRepository pathItems,
      ProgressEntryRepository progress,
      ActivityRepository activities,
      TimeEntryItemRepository entryItems) {
    this.entries = entries;
    this.paths = paths;
    this.items = items;
    this.pathItems = pathItems;
    this.progress = progress;
    this.activities = activities;
    this.entryItems = entryItems;
  }

  public record TimeView(
      UUID id,
      UUID pathId,
      UUID itemId,
      List<UUID> itemIds,
      Instant startedAt,
      Instant endedAt,
      Long durationSeconds,
      String description,
      TimeSource source,
      boolean running) {
    public TimeView(
        UUID id,
        UUID pathId,
        UUID itemId,
        Instant startedAt,
        Instant endedAt,
        Long durationSeconds,
        String description,
        TimeSource source,
        boolean running) {
      this(
          id,
          pathId,
          itemId,
          itemId == null ? List.of() : List.of(itemId),
          startedAt,
          endedAt,
          durationSeconds,
          description,
          source,
          running);
    }

    static TimeView of(TimeEntry e, List<UUID> itemIds) {
      return new TimeView(
          e.getId(),
          e.getPathId(),
          itemIds.isEmpty() ? e.getItemId() : itemIds.get(0),
          itemIds,
          e.getStartedAt(),
          e.getEndedAt(),
          e.getDurationSeconds(),
          e.getDescription(),
          e.getSource(),
          e.running());
    }
  }

  private List<UUID> itemIds(TimeEntry e) {
    if (entryItems == null)
      return e.getItemId() == null ? List.of() : List.of(e.getItemId());
    return entryItems.findAllByIdTimeEntryId(e.getId()).stream()
        .map(TimeEntryItem::getItemId)
        .toList();
  }

  private TimeView view(TimeEntry e) {
    return TimeView.of(e, itemIds(e));
  }

  static String formatTrackedDuration(Long durationSeconds) {
    long seconds = Math.max(0, durationSeconds == null ? 0 : durationSeconds);
    if (seconds < 60) return seconds + (seconds == 1 ? " second" : " seconds");

    long minutes = seconds / 60;
    if (minutes < 60) return minutes + (minutes == 1 ? " minute" : " minutes");

    long hours = minutes / 60;
    long remainingMinutes = minutes % 60;
    if (hours >= 24) return hours + "h";
    if (remainingMinutes == 0) return hours + "h";
    return hours
        + "h "
        + remainingMinutes
        + (remainingMinutes == 1 ? " minute" : " minutes");
  }

  @Transactional
  public TimeView start(
      UUID userId, UUID pathId, UUID itemId, String description, TimeSource source) {
    return startWithItems(userId, pathId, itemId == null ? List.of() : List.of(itemId), description, source);
  }

  @Transactional
  public TimeView startWithItems(
      UUID userId, UUID pathId, Collection<UUID> itemIds, String description, TimeSource source) {
    if (entries.findByUserIdAndEndedAtIsNull(userId).isPresent())
      throw new ResponseStatusException(HttpStatus.CONFLICT, "A timer is already running");
    validateTargets(userId, pathId, itemIds);
    UUID legacyItemId = itemIds.stream().filter(Objects::nonNull).findFirst().orElse(null);
    TimeEntry e;
    try {
      e =
          entries.save(
              new TimeEntry(
                  userId,
                  pathId,
                  legacyItemId,
                  Instant.now(),
                  description,
                  source == null ? TimeSource.WEB : source));
    } catch (DataIntegrityViolationException ex) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "A timer is already running");
    }
    replaceItems(e.getId(), itemIds);
    return view(e);
  }

  @Transactional
  public TimeView stop(UUID userId, UUID id) {
    TimeEntry e =
        entries
            .findById(id)
            .filter(x -> x.getUserId().equals(userId))
            .orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Timer not found"));
    if (!e.running()) return view(e);
    e.stop(Instant.now());
    entries.save(e);
    return view(e);
  }

  @Transactional
  public void cancel(UUID userId, UUID id) {
    TimeEntry e =
        entries
            .findById(id)
            .filter(x -> x.getUserId().equals(userId))
            .orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Timer not found"));
    if (!e.running())
      throw new ResponseStatusException(
          HttpStatus.CONFLICT, "Only running timers can be cancelled");
    entries.delete(e);
  }

  @Transactional
  public TimeView configureRunning(
      UUID userId,
      UUID id,
      UUID pathId,
      UUID itemId,
      Instant startedAt,
      Instant endedAt,
      String description) {
    return configureWithItems(
        userId,
        id,
        pathId,
        itemId == null ? List.of() : List.of(itemId),
        startedAt,
        endedAt,
        description);
  }

  @Transactional
  public TimeView configureWithItems(
      UUID userId,
      UUID id,
      UUID pathId,
      Collection<UUID> itemIds,
      Instant startedAt,
      Instant endedAt,
      String description) {
    Instant now = Instant.now();
    if (startedAt == null || startedAt.isAfter(now))
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST, "Timer start cannot be in the future");
    if (endedAt != null && (endedAt.isBefore(startedAt) || endedAt.isAfter(now)))
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid timer end time");
    validateTargets(userId, pathId, itemIds);
    TimeEntry e =
        entries
            .findByIdAndUserId(id, userId)
            .orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Timer not found"));
    if (!e.running())
      throw new ResponseStatusException(
          HttpStatus.CONFLICT, "Only a running timer can be configured");
    UUID legacyItemId = itemIds.stream().filter(Objects::nonNull).findFirst().orElse(null);
    e.reconfigureRunning(pathId, legacyItemId, startedAt, description);
    replaceItems(e.getId(), itemIds);
    if (endedAt != null) {
      e.stop(endedAt);
    }
    return view(entries.save(e));
  }

  public TimeView current(UUID userId) {
    return entries.findByUserIdAndEndedAtIsNull(userId).map(this::view).orElse(null);
  }

  public List<TimeView> history(UUID userId) {
    return entries
        .findAllByUserIdOrderByStartedAtDesc(
            userId, org.springframework.data.domain.PageRequest.of(0, 100))
        .stream()
        .map(this::view)
        .toList();
  }

  public record HistoryPage(
      List<TimeView> sessions, int page, int pageSize, long totalSessions, long totalPages) {}

  public HistoryPage historyPage(UUID userId, int page, int pageSize) {
    int safePage = Math.max(0, page);
    int safePageSize = Math.min(50, Math.max(1, pageSize));
    long total = entries.countByUserId(userId);
    long totalPages = Math.max(1, (total + safePageSize - 1) / safePageSize);
    List<TimeView> result =
        entries
            .findAllByUserIdOrderByStartedAtDesc(
                userId, org.springframework.data.domain.PageRequest.of(safePage, safePageSize))
            .stream()
            .map(this::view)
            .toList();
    return new HistoryPage(result, safePage, safePageSize, total, totalPages);
  }

  @Transactional
  public TimeView manual(
      UUID userId,
      UUID pathId,
      UUID itemId,
      Instant startedAt,
      Instant endedAt,
      String description) {
    return manualWithItems(
        userId,
        pathId,
        itemId == null ? List.of() : List.of(itemId),
        startedAt,
        endedAt,
        description);
  }

  @Transactional
  public TimeView manualWithItems(
      UUID userId,
      UUID pathId,
      Collection<UUID> itemIds,
      Instant startedAt,
      Instant endedAt,
      String description) {
    if (startedAt == null || endedAt == null || endedAt.isBefore(startedAt))
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid time range");
    validateTargets(userId, pathId, itemIds);
    UUID legacyItemId = itemIds.stream().filter(Objects::nonNull).findFirst().orElse(null);
    TimeEntry e = new TimeEntry(userId, pathId, legacyItemId, startedAt, description, TimeSource.MANUAL);
    e.stop(endedAt);
    entries.save(e);
    replaceItems(e.getId(), itemIds);
    return view(e);
  }

  @Transactional
  public TimeView edit(
      UUID userId,
      UUID id,
      UUID pathId,
      UUID itemId,
      Instant startedAt,
      Instant endedAt,
      String description) {
    return editWithItems(userId, id, pathId, itemId == null ? List.of() : List.of(itemId), startedAt, endedAt, description, null);
  }

  @Transactional
  public TimeView edit(
      UUID userId,
      UUID id,
      UUID pathId,
      UUID itemId,
      Instant startedAt,
      Instant endedAt,
      String description,
      TimeSource source) {
    return editWithItems(
        userId,
        id,
        pathId,
        itemId == null ? List.of() : List.of(itemId),
        startedAt,
        endedAt,
        description,
        source);
  }

  @Transactional
  public TimeView editWithItems(
      UUID userId,
      UUID id,
      UUID pathId,
      Collection<UUID> itemIds,
      Instant startedAt,
      Instant endedAt,
      String description,
      TimeSource source) {
    if (startedAt == null || endedAt == null || endedAt.isBefore(startedAt))
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid time range");
    validateTargets(userId, pathId, itemIds);
    TimeEntry e =
        entries
            .findByIdAndUserId(id, userId)
            .orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Time entry not found"));
    if (e.running())
      throw new ResponseStatusException(
          HttpStatus.CONFLICT, "Running timers must be stopped before editing");
    UUID legacyItemId = itemIds.stream().filter(Objects::nonNull).findFirst().orElse(null);
    e.edit(pathId, legacyItemId, startedAt, endedAt, description, source);
    entries.save(e);
    replaceItems(e.getId(), itemIds);
    return view(e);
  }

  @Transactional
  public void remove(UUID userId, UUID id) {
    TimeEntry e =
        entries
            .findByIdAndUserId(id, userId)
            .orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Time entry not found"));
    if (e.running())
      throw new ResponseStatusException(
          HttpStatus.CONFLICT, "Running timers must be stopped before removal");
    e.softDelete();
    entries.save(e);
  }

  private void replaceItems(UUID entryId, Collection<UUID> itemIds) {
    if (entryItems == null) return;
    entryItems.deleteAllByIdTimeEntryId(entryId);
    itemIds.stream()
        .filter(Objects::nonNull)
        .distinct()
        .map(itemId -> new TimeEntryItem(entryId, itemId))
        .forEach(entryItems::save);
  }

  public Statistics statistics(UUID userId) {
    Instant now = Instant.now();
    java.time.LocalDate date = java.time.LocalDate.now(java.time.ZoneOffset.UTC);
    Instant dayStart = date.atStartOfDay(java.time.ZoneOffset.UTC).toInstant();
    Instant weekStart = date.minusDays(6).atStartOfDay(java.time.ZoneOffset.UTC).toInstant();
    Instant monthStart = date.withDayOfMonth(1).atStartOfDay(java.time.ZoneOffset.UTC).toInstant();
    Instant windowStart = monthStart.isBefore(weekStart) ? monthStart : weekStart;
    List<TimeEntry> window = entries.findOverlappingByUserId(userId, windowStart, now);
    List<ProgressChange> changes =
        progress.findTop10ByUserIdOrderByChangedAtDesc(userId).stream()
            .map(
                e ->
                    new ProgressChange(
                        e.getItemId(),
                        e.getPreviousProgress(),
                        e.getNewProgress(),
                        e.getChangedAt()))
            .toList();
    return new Statistics(
        sum(window, dayStart, now),
        sum(window, weekStart, now),
        sum(window, monthStart, now),
        group(window, dayStart, now, TimeEntry::getPathId),
        groupItems(window, dayStart, now),
        group(window, weekStart, now, TimeEntry::getPathId),
        groupItems(window, weekStart, now),
        items.countByUserIdAndStatus(userId, ItemStatus.COMPLETED),
        items.countByUserIdAndStatus(userId, ItemStatus.ACTIVE),
        changes);
  }

  private long secondsIn(TimeEntry entry, Instant from, Instant to) {
    Instant start = entry.getStartedAt().isAfter(from) ? entry.getStartedAt() : from;
    Instant entryEnd = entry.getEndedAt() == null ? to : entry.getEndedAt();
    Instant end = entryEnd.isBefore(to) ? entryEnd : to;
    return Math.max(0, Duration.between(start, end).toSeconds());
  }

  private long sum(List<TimeEntry> list, Instant from, Instant to) {
    return list.stream().mapToLong(e -> secondsIn(e, from, to)).sum();
  }

  private Map<UUID, Long> group(
      List<TimeEntry> list,
      Instant from,
      Instant to,
      java.util.function.Function<TimeEntry, UUID> key) {
    Map<UUID, Long> out = new LinkedHashMap<>();
    for (TimeEntry e : list)
      if (key.apply(e) != null) {
        long seconds = secondsIn(e, from, to);
        if (seconds > 0) out.merge(key.apply(e), seconds, Long::sum);
      }
    return out;
  }

  private Map<UUID, Long> groupItems(List<TimeEntry> list, Instant from, Instant to) {
    Map<UUID, Long> out = new LinkedHashMap<>();
    for (TimeEntry entry : list) {
      long seconds = secondsIn(entry, from, to);
      if (seconds == 0) continue;
      for (UUID itemId : itemIds(entry)) out.merge(itemId, seconds, Long::sum);
    }
    return out;
  }

  public record ProgressChange(
      UUID itemId, short previousProgress, short newProgress, Instant changedAt) {}

  public record Statistics(
      long todaySeconds,
      long weekSeconds,
      long monthSeconds,
      Map<UUID, Long> todayByPath,
      Map<UUID, Long> todayByItem,
      Map<UUID, Long> weekByPath,
      Map<UUID, Long> weekByItem,
      long completedItems,
      long activeItems,
      List<ProgressChange> recentProgressChanges) {}

  private void validateTargets(UUID userId, UUID pathId, UUID itemId) {
    validateTargets(userId, pathId, itemId == null ? List.of() : List.of(itemId));
  }

  private void validateTargets(UUID userId, UUID pathId, Collection<UUID> itemIds) {
    if (pathId != null) {
      Path path =
          paths
              .findByIdAndUserId(pathId, userId)
              .orElseThrow(
                  () ->
                      new ResponseStatusException(
                          HttpStatus.BAD_REQUEST, "Path does not belong to user"));
      if (path.getStatus() != PathStatus.ACTIVE)
        throw new ResponseStatusException(
            HttpStatus.BAD_REQUEST, "Archived paths cannot receive new time");
    }
    for (UUID itemId : itemIds) {
      if (itemId == null) continue;
      items
          .findByIdAndUserId(itemId, userId)
          .orElseThrow(
              () ->
                  new ResponseStatusException(
                      HttpStatus.BAD_REQUEST, "Item does not belong to user"));
      // Paths and items are independent timer targets. An item may be used with
      // any owned path without first being organized into that path.
    }
  }
}
