package com.know.api;

import com.know.domain.*;
import com.know.service.KnowledgeService;
import java.time.*;
import java.util.*;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/activities")
public class ActivityController {
  private final KnowledgeService service;

  public ActivityController(KnowledgeService service) {
    this.service = service;
  }

  @GetMapping
  public List<Activity> list(
      Authentication a,
      @RequestParam(required = false) Instant from,
      @RequestParam(required = false) Instant to,
      @RequestParam(required = false) UUID pathId,
      @RequestParam(required = false) UUID itemId,
      @RequestParam(required = false) ActivityType type) {
    return service.filteredActivities(UUID.fromString(a.getName()), from, to, pathId, itemId, type);
  }
}
