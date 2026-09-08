package com.know.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.know.domain.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class CalendarServiceTest {
  private final DailyRecordRepository records = mock(DailyRecordRepository.class);
  private final LabelRepository labels = mock(LabelRepository.class);
  private final LabelScopeRepository scopes = mock(LabelScopeRepository.class);
  private final DailyRecordLabelRepository assignments = mock(DailyRecordLabelRepository.class);

  @Test
  void createsTrimmedLabelAndRejectsDuplicateNamesAndInvalidColors() {
    UUID user = UUID.randomUUID();
    when(labels.existsByUserIdAndNameIgnoreCase(user, "Focus")).thenReturn(false);
    when(labels.save(any(Label.class))).thenAnswer(invocation -> invocation.getArgument(0));
    when(labels.findByUserIdAndNameIgnoreCase(user, "Focus")).thenReturn(Optional.empty());
    CalendarService service = new CalendarService(records, labels, assignments, scopes);

    CalendarService.LabelView created = service.createLabel(user, "  Focus  ", "#2878d5");

    assertEquals("Focus", created.name());
    assertEquals("#2878d5", created.color());
    verify(labels).save(argThat((Label label) -> label.getName().equals("Focus")));
    when(labels.findByUserIdAndNameIgnoreCase(user, "Focus")).thenReturn(Optional.of(new Label(user, "Focus", null)));
    when(scopes.existsByIdLabelIdAndIdScope(any(), eq(LabelScopeType.CALENDAR))).thenReturn(true);
    assertThrows(
        ResponseStatusException.class,
        () -> service.createLabel(user, "Focus", "#2878D5"));
    assertThrows(
        ResponseStatusException.class,
        () -> service.createLabel(user, "Other", "not-a-palette-color"));
  }

  @Test
  void replaceDayTreatsBlankNoteAsEmptyAndDeletesAnExistingEmptyDay() {
    UUID user = UUID.randomUUID();
    LocalDate date = LocalDate.of(2026, 9, 6);
    DailyRecord existing = new DailyRecord(user, date, "old");
    when(records.findByUserIdAndRecordDate(user, date)).thenReturn(Optional.of(existing));
    CalendarService service = new CalendarService(records, labels, assignments, scopes);

    CalendarService.DayView result = service.replaceDay(user, date, "  \n", null);

    assertEquals(date, result.date());
    assertNull(result.note());
    assertTrue(result.labels().isEmpty());
    verify(records).delete(existing);
    verify(assignments, never()).deleteAllByIdDailyRecordId(any());
  }

  @Test
  void replaceDayRejectsDuplicateLabelsInvalidPortionsAndForeignLabelsBeforeWriting() {
    UUID user = UUID.randomUUID();
    UUID labelId = UUID.randomUUID();
    CalendarService service = new CalendarService(records, labels, assignments, scopes);
    CalendarService.LabelInput duplicate =
        new CalendarService.LabelInput(labelId, new BigDecimal("0.25"));

    assertThrows(
        ResponseStatusException.class,
        () -> service.replaceDay(user, LocalDate.now(), null, List.of(duplicate, duplicate)));
    assertThrows(
        ResponseStatusException.class,
        () ->
            service.replaceDay(
                user,
                LocalDate.now(),
                null,
                List.of(new CalendarService.LabelInput(labelId, new BigDecimal("0.30")))));
    when(labels.findByIdAndUserId(labelId, user)).thenReturn(Optional.empty());
    assertThrows(
        ResponseStatusException.class,
        () ->
            service.replaceDay(
                user,
                LocalDate.now(),
                null,
                List.of(new CalendarService.LabelInput(labelId, null))));
    verifyNoInteractions(records, assignments);
    verify(labels).findByIdAndUserId(labelId, user);
  }

  @Test
  void applyRangeRejectsReversedAndOverYearRangesWithoutWriting() {
    CalendarService service = new CalendarService(records, labels, assignments, scopes);
    UUID user = UUID.randomUUID();
    LocalDate start = LocalDate.of(2026, 1, 1);

    assertThrows(
        ResponseStatusException.class,
        () -> service.applyRange(user, start, start.minusDays(1), null, List.of()));
    assertThrows(
        ResponseStatusException.class,
        () -> service.applyRange(user, start, start.plusYears(1).plusDays(1), null, List.of()));
    verifyNoInteractions(records, labels, assignments, scopes);
  }

  @Test
  void applyRangeKeepsExistingAssignmentsAndMergesRequestedOnes() {
    UUID user = UUID.randomUUID();
    UUID existingLabelId = UUID.randomUUID();
    LocalDate date = LocalDate.of(2026, 9, 6);
    DailyRecord record = new DailyRecord(user, date, "keep me");
    Label requestedLabel = new Label(user, "New", "#2878D5");
    UUID requestedLabelId = requestedLabel.getId();
    when(labels.findByIdAndUserId(requestedLabelId, user)).thenReturn(Optional.of(requestedLabel));
    when(scopes.existsByIdLabelIdAndIdScope(requestedLabelId, LabelScopeType.CALENDAR)).thenReturn(true);
    when(records.findByUserIdAndRecordDate(user, date)).thenReturn(Optional.of(record));
    when(assignments.findAllByIdDailyRecordId(record.getId()))
        .thenReturn(
            List.of(
                new DailyRecordLabel(
                    new DailyRecordLabelId(record.getId(), existingLabelId),
                    new BigDecimal("0.25"))));
    when(records.save(any(DailyRecord.class))).thenAnswer(invocation -> invocation.getArgument(0));
    when(records.findAllByUserIdAndRecordDateBetweenOrderByRecordDate(user, date, date))
        .thenReturn(List.of());
    CalendarService service = new CalendarService(records, labels, assignments, scopes);

    service.applyRange(
        user,
        date,
        date,
        "  updated  ",
        List.of(new CalendarService.LabelInput(requestedLabelId, new BigDecimal("1.00"))));

    verify(assignments)
        .saveAll(
            argThat(
                values -> {
                  List<?> saved = (List<?>) values;
                  return saved.size() == 2;
                }));
    assertEquals("updated", record.getNote());
  }
}
