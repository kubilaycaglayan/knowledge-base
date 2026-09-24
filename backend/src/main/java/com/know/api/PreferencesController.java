package com.know.api;

import com.know.service.UserPreferencesService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import java.util.UUID;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/preferences")
public class PreferencesController {
  private final UserPreferencesService service;

  public PreferencesController(UserPreferencesService service) {
    this.service = service;
  }

  /** Omitted fields keep their stored value. */
  record Request(@Pattern(regexp = "auto|light|dark") String theme, Boolean kanbanWide, UUID lastCardBoardId) {}

  private UUID user(Authentication a) {
    return UUID.fromString(a.getName());
  }

  @GetMapping
  public UserPreferencesService.View get(Authentication a) {
    return service.get(user(a));
  }

  @PutMapping
  public UserPreferencesService.View update(Authentication a, @Valid @RequestBody Request r) {
    return service.update(user(a), r.theme(), r.kanbanWide(), r.lastCardBoardId());
  }
}
