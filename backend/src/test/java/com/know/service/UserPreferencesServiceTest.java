package com.know.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.*;

import com.know.domain.BoardRepository;
import com.know.domain.TimeEntryRepository;
import com.know.domain.UserPreferences;
import com.know.domain.UserPreferencesRepository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class UserPreferencesServiceTest {
  private final UserPreferencesRepository preferences = mock(UserPreferencesRepository.class);
  private final TimeEntryRepository entries = mock(TimeEntryRepository.class);
  private final BoardRepository boards = mock(BoardRepository.class);
  private final UserPreferencesService service = new UserPreferencesService(preferences, entries, boards);

  @Test
  void boardStateAcceptsTwoDifferentGanttSortDimensions() {
    UUID userId = UUID.randomUUID();
    when(preferences.findById(userId)).thenReturn(Optional.empty());
    when(preferences.save(any(UserPreferences.class))).thenAnswer(invocation -> invocation.getArgument(0));
    when(entries.findRecentPathIds(userId, 5)).thenReturn(List.of());

    UserPreferencesService.View saved =
        service.update(
            userId,
            null,
            null,
            null,
            null,
            new UserPreferencesService.BoardState(
                null,
                "gantt",
                null,
                null,
                "release",
                List.of("PRIORITY", "DATE_DESC"),
                null,
                null,
                null));

    assertEquals(List.of("PRIORITY", "DATE_DESC"), saved.board().ganttSorts());
    verify(preferences).save(any(UserPreferences.class));
  }

  @Test
  void boardStateRejectsRepeatedGanttSortDimensionBeforeSaving() {
    UUID userId = UUID.randomUUID();
    when(preferences.findById(userId)).thenReturn(Optional.empty());

    assertThrows(
        ResponseStatusException.class,
        () ->
            service.update(
                userId,
                null,
                null,
                null,
                null,
                new UserPreferencesService.BoardState(
                    null,
                    "gantt",
                    null,
                    null,
                    "release",
                    List.of("PRIORITY", "PRIORITY_DESC"),
                    null,
                    null,
                    null)));

    verify(preferences, never()).save(any(UserPreferences.class));
  }
}
