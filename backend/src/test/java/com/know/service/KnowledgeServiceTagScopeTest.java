package com.know.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.know.domain.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class KnowledgeServiceTagScopeTest {
  private final LabelRepository labels = mock(LabelRepository.class);
  private final NoteRepository notes = mock(NoteRepository.class);
  private final NoteTagRepository noteTags = mock(NoteTagRepository.class);
  private final LabelScopeRepository scopes = mock(LabelScopeRepository.class);
  private final UUID user = UUID.randomUUID();

  private KnowledgeService service() {
    when(notes.save(any(Note.class))).thenAnswer(invocation -> invocation.getArgument(0));
    when(labels.save(any(Label.class))).thenAnswer(invocation -> invocation.getArgument(0));
    return new KnowledgeService(
        mock(PathRepository.class),
        labels,
        mock(ActivityRepository.class),
        notes,
        mock(TimeEntryRepository.class),
        noteTags,
        scopes);
  }

  private Set<LabelScopeType> savedScopes() {
    ArgumentCaptor<LabelScope> saved = ArgumentCaptor.forClass(LabelScope.class);
    verify(scopes, atLeast(0)).save(saved.capture());
    Set<LabelScopeType> result = EnumSet.noneOf(LabelScopeType.class);
    saved.getAllValues().forEach(scope -> result.add(scope.getId().getScope()));
    return result;
  }

  @Test
  void newNoteLabelShowsEverywhereExceptCalendar() {
    when(labels.findByUserIdAndNameIgnoreCase(user, "Ideas")).thenReturn(Optional.empty());

    service().createNote(user, null, null, null, "Title", "Body", null, List.of("Ideas"));

    assertEquals(
        EnumSet.of(
            LabelScopeType.NOTE,
            LabelScopeType.TIME_ENTRY,
            LabelScopeType.LOG,
            LabelScopeType.BOARD),
        savedScopes());
  }

  @Test
  void existingLabelOnlyGainsTheNoteScope() {
    Label existing = new Label(user, "Ideas", "#2878D5");
    when(labels.findByUserIdAndNameIgnoreCase(user, "Ideas")).thenReturn(Optional.of(existing));

    service().createNote(user, null, null, null, "Title", "Body", null, List.of("Ideas"));

    assertEquals(EnumSet.of(LabelScopeType.NOTE), savedScopes());
  }
}
