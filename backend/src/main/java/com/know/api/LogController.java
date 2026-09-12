package com.know.api;

import com.know.service.LogService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/logs")
public class LogController {
  private final LogService service;
  public LogController(LogService service) { this.service = service; }

  record LogRequest(@NotBlank @Size(max = 20000) String body, @NotNull Instant occurredAt, Long version) {}
  private UUID user(Authentication authentication) { return UUID.fromString(authentication.getName()); }

  @GetMapping
  public List<LogService.LogView> list(Authentication authentication) { return service.list(user(authentication)); }

  @GetMapping("/{id}")
  public LogService.LogView get(Authentication authentication, @PathVariable UUID id) { return service.get(user(authentication), id); }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  public LogService.LogView create(Authentication authentication, @Valid @RequestBody LogRequest request) {
    return service.create(user(authentication), request.body(), request.occurredAt());
  }

  @PutMapping("/{id}")
  public LogService.LogView update(Authentication authentication, @PathVariable UUID id, @Valid @RequestBody LogRequest request) {
    return service.update(user(authentication), id, request.body(), request.occurredAt(), request.version());
  }
}
