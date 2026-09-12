package com.know.service;

import com.know.domain.*;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class LabelManagementService {
  private final LabelRepository labels;
  private final LabelScopeRepository scopes;
  private final DailyRecordLabelRepository calendarAssignments;
  private final TimeEntryLabelRepository timeAssignments;
  private final NoteTagRepository noteAssignments;
  private final LogLabelRepository logAssignments;

  public LabelManagementService(LabelRepository labels, LabelScopeRepository scopes,
      DailyRecordLabelRepository calendarAssignments, TimeEntryLabelRepository timeAssignments,
      NoteTagRepository noteAssignments, LogLabelRepository logAssignments) {
    this.labels = labels; this.scopes = scopes; this.calendarAssignments = calendarAssignments;
    this.timeAssignments = timeAssignments; this.noteAssignments = noteAssignments;
    this.logAssignments = logAssignments;
  }

  public record View(UUID id, String name, String color, Set<LabelScopeType> scopes, boolean system) {}

  @Transactional
  public List<View> list(UUID userId) {
    return labels.findAllByUserIdOrderByName(userId).stream().map(this::view).toList();
  }

  public List<View> list(UUID userId, LabelScopeType scope) {
    return labels.findAllByUserIdAndScope(userId, scope).stream().map(this::view).toList();
  }

  @Transactional
  public View create(UUID userId, String name, String color, Collection<LabelScopeType> requestedScopes) {
    String normalized = normalize(name);
    Label label = labels.findByUserIdAndNameIgnoreCase(userId, normalized)
        .orElseGet(() -> labels.save(new Label(userId, normalized, color)));
    if (label.getColor() == null && color != null) { label.update(label.getName(), color); labels.save(label); }
    replaceScopes(label, requestedScopes);
    return view(label);
  }

  @Transactional
  public View update(UUID userId, UUID id, String name, String color, Collection<LabelScopeType> requestedScopes) {
    Label label = owned(userId, id);
    String normalized = normalize(name);
    if (!label.getName().equalsIgnoreCase(normalized) && labels.existsByUserIdAndNameIgnoreCase(userId, normalized))
      throw conflict("A label with this name already exists");
    label.update(normalized, color);
    replaceScopes(label, requestedScopes);
    return view(labels.save(label));
  }

  @Transactional
  public void delete(UUID userId, UUID id) {
    delete(userId, id, false);
  }

  @Transactional
  public void delete(UUID userId, UUID id, boolean removeAssignments) {
    Label label = owned(userId, id);
    if (label.isSystem()) throw conflict("System labels cannot be removed");
    boolean assigned = calendarAssignments.existsByIdLabelId(id) || timeAssignments.existsByIdLabelId(id) || noteAssignments.existsByIdLabelId(id) || logAssignments.existsByIdLabelId(id);
    if (assigned && !removeAssignments)
      throw conflict("Labels in use cannot be deleted; remove their assignments first");
    if (removeAssignments) {
      calendarAssignments.deleteAllByIdLabelId(id);
      timeAssignments.deleteAllByIdLabelId(id);
      noteAssignments.deleteAllByIdLabelId(id);
      logAssignments.deleteAllByIdLabelId(id);
    }
    scopes.deleteAllByIdLabelId(id);
    labels.delete(label);
  }

  private void replaceScopes(Label label, Collection<LabelScopeType> requested) {
    Set<LabelScopeType> next = requested == null || requested.isEmpty() ? EnumSet.noneOf(LabelScopeType.class) : EnumSet.copyOf(requested);
    for (LabelScopeType scope : LabelScopeType.values()) {
      boolean present = scopes.existsByIdLabelIdAndIdScope(label.getId(), scope);
      if (next.contains(scope) && !present) scopes.save(new LabelScope(new LabelScopeId(label.getId(), scope)));
      if (!next.contains(scope) && present) {
        if ((scope == LabelScopeType.CALENDAR && calendarAssignments.existsByIdLabelId(label.getId()))
            || (scope == LabelScopeType.TIME_ENTRY && timeAssignments.existsByIdLabelId(label.getId()))
            || (scope == LabelScopeType.NOTE && noteAssignments.existsByIdLabelId(label.getId()))
            || (scope == LabelScopeType.LOG && logAssignments.existsByIdLabelId(label.getId())))
          throw conflict("Cannot remove a scope while the label is in use");
        scopes.deleteById(new LabelScopeId(label.getId(), scope));
      }
    }
  }

  private View view(Label label) {
    return new View(label.getId(), label.getName(), label.getColor(),
        scopes.findAllByIdLabelId(label.getId()).stream().map(value -> value.getId().getScope()).collect(java.util.stream.Collectors.toCollection(() -> EnumSet.noneOf(LabelScopeType.class))), label.isSystem());
  }
  private Label owned(UUID userId, UUID id) { return labels.findByIdAndUserId(id, userId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Label not found")); }
  private static String normalize(String name) { if (name == null || name.isBlank()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Label name is required"); return name.trim(); }
  private static ResponseStatusException conflict(String message) { return new ResponseStatusException(HttpStatus.CONFLICT, message); }
}
