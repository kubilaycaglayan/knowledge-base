package com.know.api;

import com.know.domain.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.*;
import org.springframework.data.domain.PageRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.*;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.transaction.annotation.Transactional;

@RestController
@RequestMapping("/api/v1/paths")
public class PathController {
  private final PathRepository paths;
  private final PathItemRepository pathItems;
  private final ItemRepository items;
  private final ActivityRepository activities;
  private final TimeEntryRepository timeEntries;
  @Autowired(required = false)
  private TimeEntryItemRepository entryItems;

  public PathController(
      PathRepository paths,
      PathItemRepository pathItems,
      ItemRepository items,
      ActivityRepository activities,
      TimeEntryRepository timeEntries) {
    this.paths = paths;
    this.pathItems = pathItems;
    this.items = items;
    this.activities = activities;
    this.timeEntries = timeEntries;
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
          activityLabel,
          p.getCreatedAt(),
          p.getUpdatedAt());
    }
  }

  record PathSummary(
      PathResponse path,
      List<UUID> itemIds,
      Map<UUID, Short> itemProgress,
      long trackedSeconds,
      List<Activity> recentActivity) {}

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
    return ResponseEntity.status(HttpStatus.CREATED)
        .body(
            PathResponse.of(
                paths.save(new Path(user(a), r.name(), r.description(), r.color())), null));
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
    List<UUID> itemIds = pathItems.findItemIds(id);
    Map<UUID, Short> progress = new LinkedHashMap<>();
    items
        .findAllByUserIdAndIdIn(owner, itemIds)
        .forEach(item -> progress.put(item.getId(), item.getProgress()));
    Map<UUID, TimeEntry> relevantTimes = new LinkedHashMap<>();
    timeEntries
        .findAllByUserIdAndPathIdOrderByStartedAtDesc(owner, id)
        .forEach(entry -> relevantTimes.put(entry.getId(), entry));
    if (!itemIds.isEmpty())
      timeEntries
          .findRecentForPathAndItems(owner, id, itemIds, PageRequest.of(0, 50))
          .forEach(entry -> relevantTimes.put(entry.getId(), entry));
    long seconds = relevantTimes.values().stream().mapToLong(this::liveSeconds).sum();
    Map<UUID, Activity> relevantActivity = new LinkedHashMap<>();
    activities
        .findTop50ByUserIdAndPathIdOrderByOccurredAtDesc(owner, id)
        .forEach(event -> relevantActivity.put(event.getId(), event));
    if (!itemIds.isEmpty())
      activities
          .findRecentForPathAndItems(owner, id, itemIds, PageRequest.of(0, 50))
          .forEach(event -> relevantActivity.put(event.getId(), event));
    relevantActivity.values().removeIf(
        event ->
            event.getType() == ActivityType.TIMER_STARTED
                || event.getType() == ActivityType.TIMER_STOPPED
                || event.getType() == ActivityType.TIME_TRACKED);
    relevantTimes.values().stream()
        .map(entry -> sessionActivity(id, entry))
        .forEach(event -> relevantActivity.put(event.getId(), event));
    List<Activity> recent =
        relevantActivity.values().stream()
            .sorted(Comparator.comparing(Activity::getOccurredAt).reversed())
            .limit(50)
            .toList();
    return new PathSummary(PathResponse.of(path, null), itemIds, progress, seconds, recent);
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

  @PostMapping("/{id}/restore")
  @Transactional
  public void restore(Authentication a, @PathVariable UUID id) {
    if (paths.restoreByIdAndUserId(id, user(a)) == 0)
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Path not found");
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
    paths.findLatestSessionsByUserIdAndPathIdIn(owner, pathIds).forEach(
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

  private Activity sessionActivity(UUID pathId, TimeEntry entry) {
    long seconds = liveSeconds(entry);
    return Activity.session(
        entry.getUserId(),
        pathId,
        firstItem(entry),
        entry.getId(),
        "Tracked " + seconds + " seconds",
        entry.getDescription(),
        entry.getEndedAt() == null ? entry.getStartedAt() : entry.getEndedAt());
  }

  private UUID firstItem(TimeEntry entry) {
    if (entryItems == null) return entry.getItemId();
    return entryItems.findAllByIdTimeEntryId(entry.getId()).stream()
        .map(TimeEntryItem::getItemId)
        .findFirst()
        .orElse(null);
  }
}
