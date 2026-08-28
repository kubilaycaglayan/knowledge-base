package com.know.service;

import com.know.domain.*;
import java.time.*;
import java.util.*;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
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

  public TimerService(
      TimeEntryRepository entries,
      PathRepository paths,
      ItemRepository items,
      PathItemRepository pathItems,
      ProgressEntryRepository progress,
      ActivityRepository activities) {
    this.entries = entries;
    this.paths = paths;
    this.items = items;
    this.pathItems = pathItems;
    this.progress = progress;
    this.activities = activities;
  }

  public record TimeView(
      UUID id,
      UUID pathId,
      UUID itemId,
      Instant startedAt,
      Instant endedAt,
      Long durationSeconds,
      String description,
      TimeSource source,
      boolean running) {
    static TimeView of(TimeEntry e) {
      return new TimeView(
          e.getId(),
          e.getPathId(),
          e.getItemId(),
          e.getStartedAt(),
          e.getEndedAt(),
          e.getDurationSeconds(),
          e.getDescription(),
          e.getSource(),
          e.running());
    }
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
    if (entries.findByUserIdAndEndedAtIsNull(userId).isPresent())
      throw new ResponseStatusException(HttpStatus.CONFLICT, "A timer is already running");
    validateTargets(userId, pathId, itemId);
    TimeEntry e;
    try {
      e =
          entries.save(
              new TimeEntry(
                  userId,
                  pathId,
                  itemId,
                  Instant.now(),
                  description,
                  source == null ? TimeSource.WEB : source));
    } catch (DataIntegrityViolationException ex) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "A timer is already running");
    }
    activities.save(
        new Activity(
            userId,
            pathId,
            itemId,
            e.getId(),
            ActivityType.TIMER_STARTED,
            "Started a timer",
            description));
    return TimeView.of(e);
  }

  @Transactional
  public TimeView stop(UUID userId, UUID id) {
    TimeEntry e =
        entries
            .findById(id)
            .filter(x -> x.getUserId().equals(userId))
            .orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Timer not found"));
    if (!e.running()) return TimeView.of(e);
    e.stop(Instant.now());
    entries.save(e);
    saveStoppedActivity(userId, e);
    return TimeView.of(e);
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
    Instant now = Instant.now();
    if (startedAt == null || startedAt.isAfter(now))
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST, "Timer start cannot be in the future");
    if (endedAt != null && (endedAt.isBefore(startedAt) || endedAt.isAfter(now)))
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid timer end time");
    validateTargets(userId, pathId, itemId);
    TimeEntry e =
        entries
            .findByIdAndUserId(id, userId)
            .orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Timer not found"));
    if (!e.running())
      throw new ResponseStatusException(
          HttpStatus.CONFLICT, "Only a running timer can be configured");
    e.reconfigureRunning(pathId, itemId, startedAt, description);
    if (endedAt != null) {
      e.stop(endedAt);
      activities.save(
          new Activity(
              userId,
              e.getPathId(),
              e.getItemId(),
              e.getId(),
              ActivityType.TIMER_STOPPED,
              "Tracked " + formatTrackedDuration(e.getDurationSeconds()),
              e.getDescription()));
    }
    return TimeView.of(entries.save(e));
  }

  public TimeView current(UUID userId) {
    return entries.findByUserIdAndEndedAtIsNull(userId).map(TimeView::of).orElse(null);
  }

  public List<TimeView> history(UUID userId) {
    return entries
        .findAllByUserIdOrderByStartedAtDesc(
            userId, org.springframework.data.domain.PageRequest.of(0, 100))
        .stream()
        .map(TimeView::of)
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
            .map(TimeView::of)
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
    if (startedAt == null || endedAt == null || endedAt.isBefore(startedAt))
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid time range");
    validateTargets(userId, pathId, itemId);
    TimeEntry e = new TimeEntry(userId, pathId, itemId, startedAt, description, TimeSource.MANUAL);
    e.stop(endedAt);
    entries.save(e);
    activities.save(
        new Activity(
            userId,
            pathId,
            itemId,
            e.getId(),
            ActivityType.TIME_TRACKED,
            "Tracked " + formatTrackedDuration(e.getDurationSeconds()),
            description));
    return TimeView.of(e);
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
    return edit(userId, id, pathId, itemId, startedAt, endedAt, description, null);
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
    if (startedAt == null || endedAt == null || endedAt.isBefore(startedAt))
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid time range");
    validateTargets(userId, pathId, itemId);
    TimeEntry e =
        entries
            .findByIdAndUserId(id, userId)
            .orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Time entry not found"));
    if (e.running())
      throw new ResponseStatusException(
          HttpStatus.CONFLICT, "Running timers must be stopped before editing");
    e.edit(pathId, itemId, startedAt, endedAt, description, source);
    entries.save(e);
    syncActivities(e);
    return TimeView.of(e);
  }

  private void saveStoppedActivity(UUID userId, TimeEntry e) {
    activities.save(
        new Activity(
            userId,
            e.getPathId(),
            e.getItemId(),
            e.getId(),
            ActivityType.TIMER_STOPPED,
            "Tracked " + formatTrackedDuration(e.getDurationSeconds()),
            e.getDescription(),
            e.getEndedAt()));
  }

  private void syncActivities(TimeEntry e) {
    activities.findAllByTimeEntryId(e.getId()).forEach(activity -> {
      String title = activity.getTitle();
      Instant occurredAt = activity.getOccurredAt();
      if (activity.getType() == ActivityType.TIMER_STARTED) {
        occurredAt = e.getStartedAt();
      } else if (activity.getType() == ActivityType.TIMER_STOPPED) {
        title = "Tracked " + formatTrackedDuration(e.getDurationSeconds());
        occurredAt = e.getEndedAt();
      } else if (activity.getType() == ActivityType.TIME_TRACKED
          && title.startsWith("Tracked ")) {
        title = "Tracked " + formatTrackedDuration(e.getDurationSeconds());
        occurredAt = e.getEndedAt();
      }
      activity.updateForTimeEntry(
          e.getPathId(), e.getItemId(), title, e.getDescription(), occurredAt);
      activities.save(activity);
    });
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
        group(window, dayStart, now, TimeEntry::getItemId),
        group(window, weekStart, now, TimeEntry::getPathId),
        group(window, weekStart, now, TimeEntry::getItemId),
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
    if (itemId != null)
      items
          .findByIdAndUserId(itemId, userId)
          .orElseThrow(
              () ->
                  new ResponseStatusException(
                      HttpStatus.BAD_REQUEST, "Item does not belong to user"));
    if (pathId != null && itemId != null && !pathItems.existsByIdPathIdAndIdItemId(pathId, itemId))
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST, "Item is not attached to the selected path");
  }
}
