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
  private static final long MINIMUM_SAVED_TIMER_SECONDS = 2;
  private final TimeEntryRepository entries;
  private final PathRepository paths;
  private final LabelRepository labels;
  private final LabelScopeRepository scopes;
  private final TimeEntryLabelRepository entryLabels;
  private final TimerEventPublisher timerEvents;

  public TimerService(
      TimeEntryRepository entries,
      PathRepository paths,
      LabelRepository labels,
      TimeEntryLabelRepository entryLabels,
      LabelScopeRepository scopes) {
    this(entries, paths, labels, entryLabels, scopes, null);
  }

  @org.springframework.beans.factory.annotation.Autowired
  public TimerService(
      TimeEntryRepository entries,
      PathRepository paths,
      LabelRepository labels,
      TimeEntryLabelRepository entryLabels,
      LabelScopeRepository scopes,
      TimerEventPublisher timerEvents) {
    this.entries = entries;
    this.paths = paths;
    this.labels = labels;
    this.entryLabels = entryLabels;
    this.scopes = scopes;
    this.timerEvents = timerEvents;
  }

  public record TimeView(
      UUID id,
      UUID pathId,
      List<UUID> labelIds,
      Instant startedAt,
      Instant endedAt,
      Long durationSeconds,
      String description,
      TimeSource source,
      boolean running) {
    static TimeView of(TimeEntry e, List<UUID> labelIds) {
      return new TimeView(
          e.getId(),
          e.getPathId(),
          labelIds,
          e.getStartedAt(),
          e.getEndedAt(),
          e.getDurationSeconds(),
          e.getDescription(),
          e.getSource(),
          e.running());
    }
  }

  private List<UUID> labelIds(TimeEntry e) {
    return entryLabels.findAllByIdTimeEntryId(e.getId()).stream()
        .map(TimeEntryLabel::getLabelId)
        .toList();
  }

  private TimeView view(TimeEntry e) {
    return TimeView.of(e, labelIds(e));
  }

  private Map<UUID, List<UUID>> labelIdsByEntry(List<TimeEntry> entriesToView) {
    if (entriesToView.isEmpty()) return Map.of();
    Map<UUID, List<UUID>> result = new HashMap<>();
    entryLabels.findAllByIdTimeEntryIdIn(entriesToView.stream().map(TimeEntry::getId).toList())
        .forEach(assignment -> result.computeIfAbsent(assignment.getTimeEntryId(), ignored -> new ArrayList<>())
            .add(assignment.getLabelId()));
    return result;
  }

  private List<TimeView> views(List<TimeEntry> entriesToView) {
    Map<UUID, List<UUID>> labelsByEntry = labelIdsByEntry(entriesToView);
    return entriesToView.stream().map(entry -> TimeView.of(entry,
        labelsByEntry.getOrDefault(entry.getId(), List.of()))).toList();
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
      UUID userId, UUID pathId, Collection<UUID> labelIds, String description, TimeSource source) {
    if (entries.findByUserIdAndEndedAtIsNull(userId).isPresent())
      throw new ResponseStatusException(HttpStatus.CONFLICT, "A timer is already running");
    validateTargets(userId, pathId, labelIds);
    TimeEntry e;
    try {
      e =
          entries.save(
              new TimeEntry(
                  userId,
                  pathId,
                  Instant.now(),
                  description,
                  source == null ? TimeSource.WEB : source));
    } catch (DataIntegrityViolationException ex) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "A timer is already running");
    }
    replaceLabels(e.getId(), labelIds);
    TimeView started = view(e);
    publishChanged(userId, started);
    return started;
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
    TimeView stopped = view(e);
    if (stopped.durationSeconds() < MINIMUM_SAVED_TIMER_SECONDS) {
      entries.delete(e);
      publishChanged(userId, null);
      return stopped;
    }
    entries.save(e);
    // The event describes the current running-timer state, not the completed
    // history row returned to the command caller.
    publishChanged(userId, null);
    return stopped;
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
    publishChanged(userId, null);
  }

  @Transactional
  public TimeView configure(
      UUID userId,
      UUID id,
      UUID pathId,
      Collection<UUID> labelIds,
      Instant startedAt,
      Instant endedAt,
      String description) {
    Instant now = Instant.now();
    if (startedAt == null || startedAt.isAfter(now))
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST, "Timer start cannot be in the future");
    if (endedAt != null && (endedAt.isBefore(startedAt) || endedAt.isAfter(now)))
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid timer end time");
    validateTargets(userId, pathId, labelIds);
    TimeEntry e =
        entries
            .findByIdAndUserId(id, userId)
            .orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Timer not found"));
    if (!e.running())
      throw new ResponseStatusException(
          HttpStatus.CONFLICT, "Only a running timer can be configured");
    e.reconfigureRunning(pathId, startedAt, description);
    replaceLabels(e.getId(), labelIds);
    if (endedAt != null) {
      e.stop(endedAt);
    }
    TimeView updated = view(entries.save(e));
    publishChanged(userId, updated.running() ? updated : null);
    return updated;
  }

  private void publishChanged(UUID userId, TimeView timer) {
    if (timerEvents != null) timerEvents.changed(userId, timer);
  }

  public TimeView current(UUID userId) {
    return entries.findByUserIdAndEndedAtIsNull(userId).map(this::view).orElse(null);
  }

  public List<TimeView> history(UUID userId) {
    return views(entries.findAllByUserIdOrderByCompletionTimeDesc(
        userId, org.springframework.data.domain.PageRequest.of(0, 100)));
  }

  public record HistoryPage(
      List<TimeView> sessions, int page, int pageSize, long totalSessions, long totalPages) {}

  public HistoryPage historyPage(UUID userId, int page, int pageSize) {
    int safePage = Math.max(0, page);
    int safePageSize = Math.min(50, Math.max(1, pageSize));
    long total = entries.countByUserId(userId);
    long totalPages = Math.max(1, (total + safePageSize - 1) / safePageSize);
    List<TimeEntry> pageEntries = entries.findAllByUserIdOrderByCompletionTimeDesc(
        userId, org.springframework.data.domain.PageRequest.of(safePage, safePageSize));
    List<TimeView> result = views(pageEntries);
    return new HistoryPage(result, safePage, safePageSize, total, totalPages);
  }

  @Transactional
  public TimeView manual(
      UUID userId,
      UUID pathId,
      Collection<UUID> labelIds,
      Instant startedAt,
      Instant endedAt,
      String description) {
    if (startedAt == null || endedAt == null || endedAt.isBefore(startedAt))
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid time range");
    validateTargets(userId, pathId, labelIds);
    TimeEntry e = new TimeEntry(userId, pathId, startedAt, description, TimeSource.MANUAL);
    e.stop(endedAt);
    entries.save(e);
    replaceLabels(e.getId(), labelIds);
    return view(e);
  }

  @Transactional
  public TimeView edit(
      UUID userId,
      UUID id,
      UUID pathId,
      Collection<UUID> labelIds,
      Instant startedAt,
      Instant endedAt,
      String description,
      TimeSource source) {
    if (startedAt == null || endedAt == null || endedAt.isBefore(startedAt))
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid time range");
    validateTargets(userId, pathId, labelIds);
    TimeEntry e =
        entries
            .findByIdAndUserId(id, userId)
            .orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Time entry not found"));
    if (e.running())
      throw new ResponseStatusException(
          HttpStatus.CONFLICT, "Running timers must be stopped before editing");
    e.edit(pathId, startedAt, endedAt, description, source);
    entries.save(e);
    replaceLabels(e.getId(), labelIds);
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

  private void replaceLabels(UUID entryId, Collection<UUID> labelIds) {
    entryLabels.deleteAllByIdTimeEntryId(entryId);
    labelIds.stream()
        .filter(Objects::nonNull)
        .distinct()
        .map(labelId -> new TimeEntryLabel(entryId, labelId))
        .forEach(entryLabels::save);
  }

  public Statistics statistics(UUID userId) {
    Instant now = Instant.now();
    java.time.LocalDate date = java.time.LocalDate.now(java.time.ZoneOffset.UTC);
    Instant dayStart = date.atStartOfDay(java.time.ZoneOffset.UTC).toInstant();
    Instant weekStart = date.minusDays(6).atStartOfDay(java.time.ZoneOffset.UTC).toInstant();
    Instant monthStart = date.withDayOfMonth(1).atStartOfDay(java.time.ZoneOffset.UTC).toInstant();
    Instant windowStart = monthStart.isBefore(weekStart) ? monthStart : weekStart;
    List<TimeEntry> window = entries.findOverlappingByUserId(userId, windowStart, now);
    Map<UUID, List<UUID>> labelsByEntry = labelIdsByEntry(window);
    return new Statistics(
        sum(window, dayStart, now),
        sum(window, weekStart, now),
        sum(window, monthStart, now),
        group(window, dayStart, now, TimeEntry::getPathId),
        groupLabels(window, dayStart, now, labelsByEntry),
        group(window, weekStart, now, TimeEntry::getPathId),
        groupLabels(window, weekStart, now, labelsByEntry));
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

  private Map<UUID, Long> groupLabels(List<TimeEntry> list, Instant from, Instant to,
      Map<UUID, List<UUID>> labelsByEntry) {
    Map<UUID, Long> out = new LinkedHashMap<>();
    for (TimeEntry entry : list) {
      long seconds = secondsIn(entry, from, to);
      if (seconds == 0) continue;
      for (UUID labelId : labelsByEntry.getOrDefault(entry.getId(), List.of())) out.merge(labelId, seconds, Long::sum);
    }
    return out;
  }

  public record Statistics(
      long todaySeconds,
      long weekSeconds,
      long monthSeconds,
      Map<UUID, Long> todayByPath,
      Map<UUID, Long> todayByLabel,
      Map<UUID, Long> weekByPath,
      Map<UUID, Long> weekByLabel) {}

  private void validateTargets(UUID userId, UUID pathId, Collection<UUID> labelIds) {
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
    for (UUID labelId : labelIds) {
      if (labelId == null) continue;
      labels
          .findByIdAndUserId(labelId, userId)
          .filter(label -> scopes.existsByIdLabelIdAndIdScope(labelId, LabelScopeType.TIME_ENTRY))
          .orElseThrow(
              () ->
                  new ResponseStatusException(
                      HttpStatus.BAD_REQUEST, "Label does not belong to user"));
    }
  }
}
