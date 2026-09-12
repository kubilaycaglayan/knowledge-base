package com.know.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.know.domain.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class LabelManagementServiceTest {
  private final LabelRepository labels = mock(LabelRepository.class);
  private final LabelScopeRepository scopes = mock(LabelScopeRepository.class);
  private final DailyRecordLabelRepository calendar = mock(DailyRecordLabelRepository.class);
  private final TimeEntryLabelRepository timeEntries = mock(TimeEntryLabelRepository.class);
  private final NoteTagRepository notes = mock(NoteTagRepository.class);
  private final LogLabelRepository logs = mock(LogLabelRepository.class);
  private final UserRepository users = mock(UserRepository.class);

  private LabelManagementService service() {
    return new LabelManagementService(labels, scopes, calendar, timeEntries, notes, logs, users);
  }

  @Test
  void createsSystemHighlightLabelAndLogScopeWhenMissing() {
    UUID user = UUID.randomUUID();
    when(labels.findByUserIdAndSystemTrue(user)).thenReturn(Optional.empty());
    when(labels.findByUserIdAndNameIgnoreCase(user, "Highlight")).thenReturn(Optional.empty());
    when(labels.save(any(Label.class))).thenAnswer(invocation -> invocation.getArgument(0));

    Label label = service().highlight(user);

    assertEquals("Highlight", label.getName());
    assertTrue(label.isSystem());
    verify(users).findForUpdateById(user);
    verify(scopes).save(argThat(scope -> scope.getId().equals(new LabelScopeId(label.getId(), LabelScopeType.LOG))));
  }

  @Test
  void repairsAnExistingHighlightLabelWithoutCreatingADuplicate() {
    UUID user = UUID.randomUUID();
    Label label = new Label(user, "Highlight", null);
    when(labels.findByUserIdAndSystemTrue(user)).thenReturn(Optional.empty());
    when(labels.findByUserIdAndNameIgnoreCase(user, "Highlight")).thenReturn(Optional.of(label));
    when(labels.save(any(Label.class))).thenAnswer(invocation -> invocation.getArgument(0));

    Label repaired = service().highlight(user);

    assertSame(label, repaired);
    assertTrue(repaired.isSystem());
    verify(labels, times(1)).save(label);
    verify(scopes).save(any(LabelScope.class));
  }

  @Test
  void doesNotRewriteAnAlreadyProvisionedHighlightLabel() {
    UUID user = UUID.randomUUID();
    Label label = new Label(user, "Highlight", null);
    label.markSystem();
    when(labels.findByUserIdAndSystemTrue(user)).thenReturn(Optional.of(label));
    when(scopes.existsByIdLabelIdAndIdScope(label.getId(), LabelScopeType.LOG)).thenReturn(true);

    assertSame(label, service().highlight(user));

    verify(labels, never()).save(any(Label.class));
    verify(scopes, never()).save(any(LabelScope.class));
  }

  @Test
  void repairsTheLogScopeOnAnExistingSystemHighlightLabel() {
    UUID user = UUID.randomUUID();
    Label label = new Label(user, "Highlight", null);
    label.markSystem();
    when(labels.findByUserIdAndSystemTrue(user)).thenReturn(Optional.of(label));
    when(scopes.existsByIdLabelIdAndIdScope(label.getId(), LabelScopeType.LOG)).thenReturn(false);

    service().highlight(user);

    verify(labels, never()).save(any(Label.class));
    verify(scopes).save(argThat(scope -> scope.getId().equals(new LabelScopeId(label.getId(), LabelScopeType.LOG))));
  }

  @Test
  void createsOneLabelWithMultipleScopes() {
    UUID user = UUID.randomUUID();
    when(labels.findByUserIdAndNameIgnoreCase(user, "Work")).thenReturn(Optional.empty());
    when(labels.save(any(Label.class))).thenAnswer(invocation -> invocation.getArgument(0));
    LabelManagementService service = service();

    LabelManagementService.View view = service.create(user, " Work ", "#2878D5", List.of(LabelScopeType.NOTE, LabelScopeType.TIME_ENTRY));

    assertEquals("Work", view.name());
    verify(scopes, times(2)).save(any(LabelScope.class));
  }

  @Test
  void refusesRemovingAUsedScope() {
    UUID user = UUID.randomUUID();
    Label label = new Label(user, "Work", "#2878D5");
    when(labels.findByIdAndUserId(label.getId(), user)).thenReturn(Optional.of(label));
    when(scopes.existsByIdLabelIdAndIdScope(label.getId(), LabelScopeType.TIME_ENTRY)).thenReturn(true);
    when(timeEntries.existsByIdLabelId(label.getId())).thenReturn(true);
    LabelManagementService service = service();

    assertThrows(ResponseStatusException.class, () -> service.update(user, label.getId(), "Work", "#2878D5", List.of()));
    verify(scopes, never()).deleteById(any());
  }

  @Test
  void removesAssignmentsButKeepsAssignedEntitiesWhenConfirmed() {
    UUID user = UUID.randomUUID();
    Label label = new Label(user, "Work", "#2878D5");
    when(labels.findByIdAndUserId(label.getId(), user)).thenReturn(Optional.of(label));
    when(calendar.existsByIdLabelId(label.getId())).thenReturn(true);
    LabelManagementService service = service();

    service.delete(user, label.getId(), true);

    verify(calendar).deleteAllByIdLabelId(label.getId());
    verify(timeEntries).deleteAllByIdLabelId(label.getId());
    verify(notes).deleteAllByIdLabelId(label.getId());
    verify(scopes).deleteAllByIdLabelId(label.getId());
    verify(labels).delete(label);
  }
}
