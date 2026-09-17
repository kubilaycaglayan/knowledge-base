package com.know.api;

import com.know.service.KnowledgeService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.*;
import org.springframework.http.HttpStatus;
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
      UUID activityId,
      UUID timeEntryId,
      @Size(max = 240) String title,
      @NotBlank @Size(max = 200000) String content,
      @Size(max = 200000) String contentText,
      List<String> tags) {}

  record EditNoteRequest(
      @Size(max = 240) String title,
      @NotBlank @Size(max = 200000) String content,
      @Size(max = 200000) String contentText,
      List<String> tags,
      Long version) {}

  private UUID user(Authentication a) {
    return UUID.fromString(a.getName());
  }

  @GetMapping
  public Object list(
      Authentication a,
      @RequestParam(required = false) Integer page,
      @RequestParam(required = false) Integer size,
      @RequestParam(required = false) String q,
      @RequestParam(defaultValue = "false") boolean archived) {
    if (page == null && size == null && q == null && !archived) return service.listNotes(user(a));
    return service.pageNotes(
        user(a), page == null ? 0 : page, size == null ? 20 : size, q, archived);
  }

  @GetMapping("/labels")
  public List<KnowledgeService.TagView> labels(Authentication a) {
    return service.noteTags(user(a));
  }

  @GetMapping("/{id}")
  public KnowledgeService.NoteView get(Authentication a, @PathVariable UUID id) {
    return service.getNote(user(a), id);
  }

  @PostMapping
  public KnowledgeService.NoteView create(Authentication a, @Valid @RequestBody NoteRequest r) {
    return service.createNote(
        user(a),
        r.pathId(),
        r.activityId(),
        r.timeEntryId(),
        r.title(),
        r.content(),
        r.contentText(),
        r.tags());
  }

  @PutMapping("/{id}")
  public KnowledgeService.NoteView update(
      Authentication a, @PathVariable UUID id, @Valid @RequestBody EditNoteRequest r) {
    return service.updateNote(
        user(a), id, r.title(), r.content(), r.contentText(), r.tags(), r.version());
  }

  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void archive(Authentication a, @PathVariable UUID id) {
    service.archiveNote(user(a), id);
  }

  @PostMapping("/{id}/restore")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void restore(Authentication a, @PathVariable UUID id) {
    service.restoreNote(user(a), id);
  }
}
