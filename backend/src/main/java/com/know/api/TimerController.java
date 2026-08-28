package com.know.api;

import com.know.domain.TimeSource;
import com.know.service.TimerService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.time.Instant;
import java.util.*;
import org.springframework.http.*;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1")
public class TimerController {
  private final TimerService service;

  public TimerController(TimerService service) {
    this.service = service;
  }

  record StartRequest(
      UUID pathId, List<UUID> itemIds, UUID itemId, @Size(max = 500) String description, TimeSource source) {}

  record RunningUpdateRequest(
      UUID pathId,
      List<UUID> itemIds,
      UUID itemId,
      @NotNull Instant startedAt,
      Instant endedAt,
      @Size(max = 500) String description) {}

  record ManualRequest(
      UUID pathId,
      List<UUID> itemIds,
      UUID itemId,
      @NotNull Instant startedAt,
      @NotNull Instant endedAt,
      @Size(max = 500) String description,
      TimeSource source) {}

  private UUID user(Authentication a) {
    return UUID.fromString(a.getName());
  }

  @GetMapping("/timers/current")
  public TimerService.TimeView current(Authentication a) {
    return service.current(user(a));
  }

  @PostMapping("/timers")
  public ResponseEntity<TimerService.TimeView> start(
      Authentication a, @Valid @RequestBody StartRequest r) {
    TimerService.TimeView result =
        r.itemIds() == null
            ? service.start(user(a), r.pathId(), r.itemId(), r.description(), r.source())
            : service.startWithItems(user(a), r.pathId(), r.itemIds(), r.description(), r.source());
    return ResponseEntity.status(HttpStatus.CREATED).body(result);
  }

  @PutMapping("/timers/{id}")
  public TimerService.TimeView configure(
      Authentication a, @PathVariable UUID id, @Valid @RequestBody RunningUpdateRequest r) {
    return r.itemIds() == null
        ? service.configureRunning(
            user(a), id, r.pathId(), r.itemId(), r.startedAt(), r.endedAt(), r.description())
        : service.configureWithItems(
            user(a), id, r.pathId(), r.itemIds(), r.startedAt(), r.endedAt(), r.description());
  }

  @PostMapping({"/timers/stop", "/timers/{id}/stop"})
  public TimerService.TimeView stop(Authentication a, @PathVariable(required = false) UUID id) {
    TimerService.TimeView current = service.current(user(a));
    if (id == null && current == null)
      throw new ResponseStatusException(HttpStatus.CONFLICT, "No timer is running");
    return service.stop(user(a), id == null ? current.id() : id);
  }

  @PostMapping({"/timers/cancel", "/timers/{id}/cancel"})
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void cancel(Authentication a, @PathVariable(required = false) UUID id) {
    TimerService.TimeView current = service.current(user(a));
    if (id == null && current == null)
      throw new ResponseStatusException(HttpStatus.CONFLICT, "No timer is running");
    service.cancel(user(a), id == null ? current.id() : id);
  }

  @PostMapping("/time-entries")
  public TimerService.TimeView manual(Authentication a, @Valid @RequestBody ManualRequest r) {
    return r.itemIds() == null
        ? service.manual(
            user(a), r.pathId(), r.itemId(), r.startedAt(), r.endedAt(), r.description())
        : service.manualWithItems(
            user(a), r.pathId(), r.itemIds(), r.startedAt(), r.endedAt(), r.description());
  }

  @GetMapping("/time-entries")
  public Object history(
      Authentication a,
      @RequestParam(required = false) Integer page,
      @RequestParam(defaultValue = "50") int size) {
    if (page != null) return service.historyPage(user(a), page, size);
    return service.history(user(a));
  }

  @PutMapping("/time-entries/{id}")
  public TimerService.TimeView edit(
      Authentication a, @PathVariable UUID id, @Valid @RequestBody ManualRequest r) {
    return r.itemIds() == null
        ? service.edit(
            user(a), id, r.pathId(), r.itemId(), r.startedAt(), r.endedAt(), r.description(), r.source())
        : service.editWithItems(
            user(a), id, r.pathId(), r.itemIds(), r.startedAt(), r.endedAt(), r.description(), r.source());
  }

  @DeleteMapping("/time-entries/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void remove(Authentication a, @PathVariable UUID id) {
    service.remove(user(a), id);
  }

  @GetMapping("/statistics")
  public TimerService.Statistics statistics(Authentication a) {
    return service.statistics(user(a));
  }

  private List<UUID> ids(List<UUID> itemIds, UUID itemId) {
    if (itemIds != null) return itemIds;
    return itemId == null ? List.of() : List.of(itemId);
  }
}
