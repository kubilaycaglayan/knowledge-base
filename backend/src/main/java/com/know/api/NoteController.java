package com.know.api;

import com.know.service.KnowledgeService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.*;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/notes")
public class NoteController {
  private final KnowledgeService service;

  public NoteController(KnowledgeService service) {
    this.service = service;
  }

  record NoteRequest(
      UUID pathId,
      UUID itemId,
      UUID activityId,
      UUID timeEntryId,
      @NotBlank @Size(max = 240) String title,
      @NotBlank @Size(max = 20000) String content) {}

  record EditNoteRequest(
      @NotBlank @Size(max = 240) String title, @NotBlank @Size(max = 20000) String content) {}

  private UUID user(Authentication a) {
    return UUID.fromString(a.getName());
  }

  @GetMapping
  public List<KnowledgeService.NoteView> list(Authentication a) {
    return service.listNotes(user(a));
  }

  @PostMapping
  public KnowledgeService.NoteView create(Authentication a, @Valid @RequestBody NoteRequest r) {
    return service.createNote(
        user(a), r.pathId(), r.itemId(), r.activityId(), r.timeEntryId(), r.title(), r.content());
  }

  @PutMapping("/{id}")
  public KnowledgeService.NoteView update(
      Authentication a, @PathVariable UUID id, @Valid @RequestBody EditNoteRequest r) {
    return service.updateNote(user(a), id, r.title(), r.content());
  }
}
