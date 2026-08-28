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
      UUID pathId, UUID itemId, @Size(max = 500) String description, TimeSource source) {}

  record RunningUpdateRequest(
      UUID pathId,
      UUID itemId,
      @NotNull Instant startedAt,
      Instant endedAt,
      @Size(max = 500) String description) {}

  record ManualRequest(
      UUID pathId,
      UUID itemId,
      @NotNull Instant startedAt,
      @NotNull Instant endedAt,
      @Size(max = 500) String description) {}

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
    return ResponseEntity.status(HttpStatus.CREATED)
        .body(service.start(user(a), r.pathId(), r.itemId(), r.description(), r.source()));
  }

  @PutMapping("/timers/{id}")
  public TimerService.TimeView configure(
      Authentication a, @PathVariable UUID id, @Valid @RequestBody RunningUpdateRequest r) {
    return service.configureRunning(
        user(a), id, r.pathId(), r.itemId(), r.startedAt(), r.endedAt(), r.description());
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
    return service.manual(
        user(a), r.pathId(), r.itemId(), r.startedAt(), r.endedAt(), r.description());
  }

  @GetMapping("/time-entries")
  public List<TimerService.TimeView> history(Authentication a) {
    return service.history(user(a));
  }

  @PutMapping("/time-entries/{id}")
  public TimerService.TimeView edit(
      Authentication a, @PathVariable UUID id, @Valid @RequestBody ManualRequest r) {
    return service.edit(
        user(a), id, r.pathId(), r.itemId(), r.startedAt(), r.endedAt(), r.description());
  }

  @GetMapping("/statistics")
  public TimerService.Statistics statistics(Authentication a) {
    return service.statistics(user(a));
  }
}
