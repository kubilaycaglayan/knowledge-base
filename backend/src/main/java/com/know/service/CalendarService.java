package com.know.service;

import com.know.domain.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class CalendarService {
  private static final Set<BigDecimal> VALID_PORTIONS = Set.of(
      new BigDecimal("0.25"), new BigDecimal("0.50"), new BigDecimal("0.75"), new BigDecimal("1.00"));
  private static final Set<String> VALID_COLORS = Set.of("#2878D5", "#E05D44", "#D69E2E", "#2F855A", "#009688", "#805AD5", "#D53F8C", "#4A5568", "#718096", "#8B5E3C");
  private final DailyRecordRepository records;
  private final LabelRepository labels;
  private final LabelScopeRepository scopes;
  private final DailyRecordLabelRepository assignments;

  public CalendarService(DailyRecordRepository records, LabelRepository labels, DailyRecordLabelRepository assignments, LabelScopeRepository scopes) {
    this.records = records; this.labels = labels; this.assignments = assignments; this.scopes = scopes;
  }

  public record LabelView(UUID id, String name, String color) {}
  public record LabelAssignmentView(UUID labelId, String name, String color, BigDecimal portion) {}
  public record DayView(LocalDate date, String note, List<LabelAssignmentView> labels) {}

  public List<LabelView> labels(UUID userId) {
    return labels.findAllByUserIdAndScope(userId, LabelScopeType.CALENDAR).stream().map(this::labelView).toList();
  }

  @Transactional
  public LabelView createLabel(UUID userId, String name, String color) {
    String normalized = normalizedName(name);
    validateColor(color);
    Optional<Label> existing = labels.findByUserIdAndNameIgnoreCase(userId, normalized);
    if (existing.isPresent() && scopes.existsByIdLabelIdAndIdScope(existing.get().getId(), LabelScopeType.CALENDAR))
      conflict("A calendar label with this name already exists");
    Label label = existing.orElseGet(() -> labels.save(new Label(userId, normalized, color)));
    if (label.getColor() == null && color != null) { label.update(label.getName(), color); labels.save(label); }
    if (!scopes.existsByIdLabelIdAndIdScope(label.getId(), LabelScopeType.CALENDAR)) scopes.save(new LabelScope(new LabelScopeId(label.getId(), LabelScopeType.CALENDAR)));
    return labelView(label);
  }

  @Transactional
  public LabelView updateLabel(UUID userId, UUID id, String name, String color) {
    Label label = label(userId, id);
    String normalized = normalizedName(name);
    validateColor(color);
    if (!label.getName().equalsIgnoreCase(normalized) && labels.existsByUserIdAndNameIgnoreCase(userId, normalized)) conflict("A label with this name already exists");
    label.update(normalized, color);
    return labelView(labels.save(label));
  }

  @Transactional
  public void deleteLabel(UUID userId, UUID id) {
    Label label = label(userId, id);
    if (assignments.existsByIdLabelId(id)) conflict("Labels used by calendar records cannot be deleted");
    labels.delete(label);
  }

  public List<DayView> days(UUID userId, LocalDate from, LocalDate to) {
    List<DailyRecord> found = records.findAllByUserIdAndRecordDateBetweenOrderByRecordDate(userId, from, to);
    return views(found);
  }

  @Transactional
  public DayView replaceDay(UUID userId, LocalDate date, String note, List<LabelInput> inputs) {
    String cleanedNote = note == null || note.isBlank() ? null : note.trim();
    List<LabelInput> requested = inputs == null ? List.of() : inputs;
    Set<UUID> ids = new HashSet<>();
    for (LabelInput input : requested) {
      if (input.labelId() == null || !ids.add(input.labelId())) badRequest("Each calendar label can be selected only once");
      if (input.portion() != null && !isValidPortion(input.portion())) badRequest("Portion must be 0.25, 0.50, 0.75, or 1.00");
    }
    Map<UUID, Label> owned = new HashMap<>();
    for (UUID id : ids) owned.put(id, label(userId, id));
    Optional<DailyRecord> existing = records.findByUserIdAndRecordDate(userId, date);
    if (cleanedNote == null && requested.isEmpty()) {
      existing.ifPresent(record -> records.delete(record));
      return new DayView(date, null, List.of());
    }
    DailyRecord record = existing.orElseGet(() -> records.save(new DailyRecord(userId, date, cleanedNote)));
    record.update(cleanedNote);
    records.save(record);
    assignments.deleteAllByIdDailyRecordId(record.getId());
    assignments.flush();
    assignments.saveAll(requested.stream().map(input -> new DailyRecordLabel(new DailyRecordLabelId(record.getId(), input.labelId()), input.portion())).toList());
    return view(record, requested.stream().map(input -> assignmentView(owned.get(input.labelId()), input.portion())).toList());
  }

  public record LabelInput(UUID labelId, BigDecimal portion) {}

  @Transactional
  public List<DayView> applyRange(
      UUID userId, LocalDate startDate, LocalDate endDate, String note, List<LabelInput> inputs) {
    if (endDate.isBefore(startDate) || startDate.plusYears(1).isBefore(endDate))
      badRequest("Calendar range must be between zero days and one year");
    List<LabelInput> requested = inputs == null ? List.of() : inputs;
    validateInputs(userId, requested);
    String cleanedNote = note == null || note.isBlank() ? null : note.trim();
    for (LocalDate date = startDate; !date.isAfter(endDate); date = date.plusDays(1)) {
      LocalDate recordDate = date;
      Optional<DailyRecord> existing = records.findByUserIdAndRecordDate(userId, recordDate);
      if (existing.isEmpty() && cleanedNote == null && requested.isEmpty()) continue;
      DailyRecord record = existing.orElseGet(() -> records.save(new DailyRecord(userId, recordDate, cleanedNote)));
      if (cleanedNote != null) record.update(cleanedNote);
      records.save(record);
      Map<UUID, BigDecimal> current = new HashMap<>();
      assignments.findAllByIdDailyRecordId(record.getId()).forEach(value -> current.put(value.getId().getLabelId(), value.getPortion()));
      requested.forEach(input -> current.put(input.labelId(), input.portion()));
      assignments.saveAll(current.entrySet().stream().map(entry -> new DailyRecordLabel(new DailyRecordLabelId(record.getId(), entry.getKey()), entry.getValue())).toList());
    }
    return days(userId, startDate, endDate);
  }

  private List<DayView> views(List<DailyRecord> found) {
    if (found.isEmpty()) return List.of();
    List<UUID> ids = found.stream().map(DailyRecord::getId).toList();
    Map<UUID, Label> labelsById = new HashMap<>();
    labels.findAllById(assignments.findAllByIdDailyRecordIdIn(ids).stream().map(a -> a.getId().getLabelId()).distinct().toList()).forEach(label -> labelsById.put(label.getId(), label));
    Map<UUID, List<LabelAssignmentView>> byRecord = new HashMap<>();
    assignments.findAllByIdDailyRecordIdIn(ids).forEach(a -> byRecord.computeIfAbsent(a.getId().getDailyRecordId(), ignored -> new ArrayList<>()).add(assignmentView(labelsById.get(a.getId().getLabelId()), a.getPortion())));
    return found.stream().map(record -> view(record, byRecord.getOrDefault(record.getId(), List.of()))).toList();
  }

  private DayView view(DailyRecord record, List<LabelAssignmentView> assignments) { return new DayView(record.getRecordDate(), record.getNote(), assignments.stream().sorted(Comparator.comparing(LabelAssignmentView::name)).toList()); }
  private static boolean isValidPortion(BigDecimal portion) { return VALID_PORTIONS.stream().anyMatch(valid -> valid.compareTo(portion) == 0); }
  private void validateInputs(UUID userId, List<LabelInput> inputs) {
    Set<UUID> ids = new HashSet<>();
    for (LabelInput input : inputs) {
      if (input.labelId() == null || !ids.add(input.labelId())) badRequest("Each calendar label can be selected only once");
      if (input.portion() != null && !isValidPortion(input.portion())) badRequest("Portion must be 0.25, 0.50, 0.75, or 1.00");
    }
    ids.forEach(id -> label(userId, id));
  }
  private LabelAssignmentView assignmentView(Label label, BigDecimal portion) { return new LabelAssignmentView(label.getId(), label.getName(), label.getColor(), portion); }
  private LabelView labelView(Label label) { return new LabelView(label.getId(), label.getName(), label.getColor()); }
  private Label label(UUID userId, UUID id) { return labels.findByIdAndUserId(id, userId).filter(value -> scopes.existsByIdLabelIdAndIdScope(id, LabelScopeType.CALENDAR)).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Calendar label not found")); }
  private static String normalizedName(String name) { return name.trim(); }
  private static void validateColor(String color) { if (color != null && !VALID_COLORS.contains(color.toUpperCase(Locale.ROOT))) badRequest("Color must be selected from the calendar palette"); }
  private static void badRequest(String message) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }
  private static void conflict(String message) { throw new ResponseStatusException(HttpStatus.CONFLICT, message); }
}
