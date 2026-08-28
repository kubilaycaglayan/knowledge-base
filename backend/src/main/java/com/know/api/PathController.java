package com.know.api;

import com.know.domain.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import org.springframework.data.domain.PageRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.*;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

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
      java.time.Instant createdAt,
      java.time.Instant updatedAt) {
    static PathResponse of(Path p) {
      return new PathResponse(
          p.getId(),
          p.getName(),
          p.getDescription(),
          p.getColor(),
          p.getStatus(),
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
    return paths.findAllByUserIdOrderByUpdatedAtDesc(user(a), PageRequest.of(0, 100)).stream()
        .map(PathResponse::of)
        .toList();
  }

  @PostMapping
  public ResponseEntity<PathResponse> create(Authentication a, @Valid @RequestBody PathRequest r) {
    return ResponseEntity.status(HttpStatus.CREATED)
        .body(PathResponse.of(paths.save(new Path(user(a), r.name(), r.description(), r.color()))));
  }

  @GetMapping("/{id}")
  public PathResponse get(Authentication a, @PathVariable UUID id) {
    return PathResponse.of(find(a, id));
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
    return new PathSummary(PathResponse.of(path), itemIds, progress, seconds, recent);
  }

  @PutMapping("/{id}")
  public PathResponse update(
      Authentication a, @PathVariable UUID id, @Valid @RequestBody PathRequest r) {
    Path p = find(a, id);
    p.update(r.name(), r.description(), r.color());
    return PathResponse.of(paths.save(p));
  }

  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void delete(Authentication a, @PathVariable UUID id) {
    Path p = find(a, id);
    p.delete();
    paths.save(p);
  }

  private Path find(Authentication a, UUID id) {
    return paths
        .findByIdAndUserId(id, user(a))
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Path not found"));
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
