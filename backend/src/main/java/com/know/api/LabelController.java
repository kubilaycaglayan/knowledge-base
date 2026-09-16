package com.know.api;

import com.know.domain.LabelScopeType;
import com.know.service.LabelManagementService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/labels")
public class LabelController {
  private final LabelManagementService service;

  public LabelController(LabelManagementService service) {
    this.service = service;
  }

  record Request(
      @NotBlank @Size(max = 80) String name,
      @Pattern(regexp = "^#[0-9A-Fa-f]{6}$") String color,
      Set<LabelScopeType> scopes) {}

  private UUID user(Authentication a) {
    return UUID.fromString(a.getName());
  }

  @GetMapping
  public List<LabelManagementService.View> list(
      Authentication a, @RequestParam(required = false) LabelScopeType scope) {
    return scope == null ? service.list(user(a)) : service.list(user(a), scope);
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  public LabelManagementService.View create(Authentication a, @Valid @RequestBody Request r) {
    return service.create(user(a), r.name(), r.color(), r.scopes());
  }

  @PutMapping("/{id}")
  public LabelManagementService.View update(
      Authentication a, @PathVariable UUID id, @Valid @RequestBody Request r) {
    return service.update(user(a), id, r.name(), r.color(), r.scopes());
  }

  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void delete(
      Authentication a,
      @PathVariable UUID id,
      @RequestParam(defaultValue = "false") boolean removeAssignments) {
    service.delete(user(a), id, removeAssignments);
  }
}
