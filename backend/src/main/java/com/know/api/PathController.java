package com.know.api;

import com.know.domain.*;
import com.know.service.PathManagementService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.*;
import java.util.stream.Collectors;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.*;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/paths")
public class PathController {
  private final PathRepository paths;
  private final ActivityRepository activities;
  private final TimeEntryRepository timeEntries;
  private final TimeEntryLabelRepository entryLabels;
  private final PathManagementService pathManagement;

  public PathController(
      PathRepository paths,
      ActivityRepository activities,
      TimeEntryRepository timeEntries,
      TimeEntryLabelRepository entryLabels,
      PathManagementService pathManagement) {
    this.paths = paths;
    this.activities = activities;
    this.timeEntries = timeEntries;
    this.entryLabels = entryLabels;
    this.pathManagement = pathManagement;
  }

  record PathRequest(
      @NotBlank @Size(max = 160) String name,
      @Size(max = 2000) String description,
      @Pattern(regexp = "^#[0-9A-Fa-f]{6}$", message = "Color must be a six-digit hex value")
          String color) {}

  record PathResponse(
      UUID id,
      String name,
      String description,
      String color,
      PathStatus status,
      boolean pinned,
      Long sortOrder,
      String activityLabel,
      java.time.Instant createdAt,
      java.time.Instant updatedAt) {
    static PathResponse of(Path p, String activityLabel) {
      return new PathResponse(
          p.getId(),
          p.getName(),
          p.getDescription(),
          p.getColor(),
          p.getStatus(),
          p.isPinned(),
          p.getSortOrder(),
          activityLabel,
          p.getCreatedAt(),
          p.getUpdatedAt());
    }
  }

  record PathSummary(PathResponse path, long trackedSeconds, List<Activity> recentActivity) {}

  record MergePathRequest(@NotNull UUID targetPathId) {}

  record PinRequest(boolean pinned) {}

  record OrderRequest(List<UUID> pathIds) {}

  private UUID user(Authentication a) {
    return UUID.fromString(a.getName());
  }

  @GetMapping
  public List<PathResponse> list(Authentication a) {
    UUID owner = user(a);
    List<Path> ownedPaths =
        paths.findAllByUserIdOrderByUpdatedAtDesc(owner, PageRequest.of(0, 100));
    Map<UUID, String> labels = activityLabels(owner, ownedPaths);
    return ownedPaths.stream()
        .map(path -> PathResponse.of(path, labels.get(path.getId())))
        .toList();
  }

  @PostMapping
  public ResponseEntity<PathResponse> create(Authentication a, @Valid @RequestBody PathRequest r) {
    UUID owner = user(a);
    Path path = new Path(owner, r.name(), r.description(), r.color());
    return ResponseEntity.status(HttpStatus.CREATED).body(PathResponse.of(paths.save(path), null));
  }

  @GetMapping("/{id}")
  public PathResponse get(Authentication a, @PathVariable UUID id) {
    UUID owner = user(a);
    Path path = find(a, id);
    return PathResponse.of(path, activityLabels(owner, List.of(path)).get(path.getId()));
  }

  @GetMapping("/{id}/summary")
  public PathSummary summary(Authentication a, @PathVariable UUID id) {
    UUID owner = user(a);
    Path path = find(a, id);
    Map<UUID, TimeEntry> relevantTimes = new LinkedHashMap<>();
    timeEntries
        .findAllByUserIdAndPathIdOrderByStartedAtDesc(owner, id)
        .forEach(entry -> relevantTimes.put(entry.getId(), entry));
    long seconds = relevantTimes.values().stream().mapToLong(this::liveSeconds).sum();
    Map<UUID, Activity> relevantActivity = new LinkedHashMap<>();
    activities
        .findTop50ByUserIdAndPathIdOrderByOccurredAtDesc(owner, id)
        .forEach(event -> relevantActivity.put(event.getId(), event));
    relevantActivity
        .values()
        .removeIf(
            event ->
                event.getType() == ActivityType.TIMER_STARTED
                    || event.getType() == ActivityType.TIMER_STOPPED
                    || event.getType() == ActivityType.TIME_TRACKED);
    Map<UUID, List<UUID>> labelIdsByEntry =
        entryLabels.findAllByIdTimeEntryIdIn(relevantTimes.keySet()).stream()
            .collect(
                Collectors.groupingBy(
                    TimeEntryLabel::getTimeEntryId,
                    Collectors.mapping(TimeEntryLabel::getLabelId, Collectors.toList())));
    relevantTimes.values().stream()
        .map(
            entry ->
                sessionActivity(id, entry, labelIdsByEntry.getOrDefault(entry.getId(), List.of())))
        .forEach(event -> relevantActivity.put(event.getId(), event));
    List<Activity> recent =
        relevantActivity.values().stream()
            .sorted(Comparator.comparing(Activity::getOccurredAt).reversed())
            .limit(50)
            .toList();
    return new PathSummary(PathResponse.of(path, null), seconds, recent);
  }

  @PutMapping("/{id}")
  public PathResponse update(
      Authentication a, @PathVariable UUID id, @Valid @RequestBody PathRequest r) {
    Path p = find(a, id);
    p.update(r.name(), r.description(), r.color());
    return PathResponse.of(paths.save(p), activityLabels(user(a), List.of(p)).get(p.getId()));
  }

  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void delete(Authentication a, @PathVariable UUID id) {
    Path p = find(a, id);
    p.delete();
    paths.save(p);
  }

  @PostMapping("/{id}/merge")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void merge(
      Authentication a, @PathVariable UUID id, @Valid @RequestBody MergePathRequest request) {
    pathManagement.merge(user(a), id, request.targetPathId());
  }

  @PostMapping("/{id}/restore")
  @Transactional
  public void restore(Authentication a, @PathVariable UUID id) {
    if (paths.restoreByIdAndUserId(id, user(a)) == 0)
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Path not found");
  }

  @PostMapping("/{id}/pin")
  public PathResponse pin(Authentication a, @PathVariable UUID id, @RequestBody PinRequest request) {
    Path path = find(a, id);
    path.setPinned(request.pinned());
    return PathResponse.of(paths.save(path), activityLabels(user(a), List.of(path)).get(path.getId()));
  }

  @PutMapping("/order")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @Transactional
  public void order(Authentication a, @RequestBody OrderRequest request) {
    UUID owner = user(a);
    List<Path> owned = paths.findByUserIdAndIdIn(owner, request.pathIds());
    if (owned.size() != request.pathIds().stream().distinct().count())
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Every path must belong to the user");
    Map<UUID, Path> byId = owned.stream().collect(Collectors.toMap(Path::getId, path -> path));
    for (int index = 0; index < request.pathIds().size(); index++)
      byId.get(request.pathIds().get(index)).setSortOrder(index);
    paths.saveAll(owned);
  }

  private Path find(Authentication a, UUID id) {
    return paths
        .findByIdAndUserId(id, user(a))
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Path not found"));
  }

  private Map<UUID, String> activityLabels(UUID owner, List<Path> ownedPaths) {
    if (ownedPaths.isEmpty()) return Map.of();
    List<UUID> pathIds = ownedPaths.stream().map(Path::getId).toList();
    Instant now = Instant.now();
    Instant todayStart = LocalDate.now(ZoneOffset.UTC).atStartOfDay(ZoneOffset.UTC).toInstant();
    Instant weekStart = now.minus(Duration.ofDays(7));
    Instant monthStart = now.minus(Duration.ofDays(28));
    Map<UUID, String> labels = new HashMap<>();
    paths
        .findLatestSessionsByUserIdAndPathIdIn(owner, pathIds)
        .forEach(
            session ->
                labels.put(
                    session.getPathId(),
                    session.getLatestStartedAt().compareTo(todayStart) >= 0
                        ? "today"
                        : session.getLatestStartedAt().compareTo(weekStart) >= 0
                            ? "this week"
                            : session.getLatestStartedAt().compareTo(monthStart) >= 0
                                ? "this month"
                                : "passive"));
    ownedPaths.forEach(path -> labels.putIfAbsent(path.getId(), "passive"));
    return labels;
  }

  private long liveSeconds(TimeEntry entry) {
    return entry.getDurationSeconds() != null
        ? entry.getDurationSeconds()
        : Math.max(0, Duration.between(entry.getStartedAt(), Instant.now()).toSeconds());
  }

  private Activity sessionActivity(UUID pathId, TimeEntry entry, List<UUID> labelIds) {
    long seconds = liveSeconds(entry);
    Activity activity =
        Activity.session(
            entry.getUserId(),
            pathId,
            entry.getId(),
            "Tracked " + seconds + " seconds",
            entry.getDescription(),
            entry.getEndedAt() == null ? entry.getStartedAt() : entry.getEndedAt());
    activity.assignLabelIds(labelIds);
    return activity;
  }
}
