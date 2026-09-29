package com.know.service;

import com.know.domain.BoardRepository;
import com.know.domain.TimeEntryRepository;
import com.know.domain.UserPreferences;
import com.know.domain.UserPreferencesRepository;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Settings a user adjusts in the web app. Stored values are the theme and the
 * Kanban width, the board new cards from the All boards view go to, and the
 * Boards page state; recent paths are derived from time entries, so they never go
 * stale.
 */
@Service
public class UserPreferencesService {
  static final int RECENT_PATHS = 5;
  private final UserPreferencesRepository preferences;
  private final TimeEntryRepository entries;
  private final BoardRepository boards;

  public UserPreferencesService(UserPreferencesRepository preferences, TimeEntryRepository entries, BoardRepository boards) {
    this.preferences = preferences;
    this.entries = entries;
    this.boards = boards;
  }

  /** The Boards page state: the open board (null for All boards), view, Gantt range, and card search. */
  public record BoardState(UUID boardId, String view, LocalDate ganttFrom, LocalDate ganttTo, String search) {}

  public record View(String theme, boolean kanbanWide, List<UUID> recentPathIds, UUID lastCardBoardId, BoardState board) {}

  @Transactional(readOnly = true)
  public View get(UUID userId) {
    return view(userId, preferences.findById(userId).orElseGet(() -> new UserPreferences(userId)));
  }

  @Transactional
  public View update(UUID userId, String theme, Boolean kanbanWide, UUID lastCardBoardId, BoardState board) {
    UserPreferences stored = preferences.findById(userId).orElseGet(() -> new UserPreferences(userId));
    stored.update(theme, kanbanWide);
    if (lastCardBoardId != null) {
      if (boards.findByIdAndUserId(lastCardBoardId, userId).isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Board not found");
      stored.chooseCardBoard(lastCardBoardId);
    }
    if (board != null) {
      if (board.ganttFrom() != null && board.ganttTo() != null && board.ganttTo().isBefore(board.ganttFrom())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Gantt range ends before it starts");
      if (board.boardId() != null && boards.findByIdAndUserId(board.boardId(), userId).isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Board not found");
      String search = board.search() == null ? "" : board.search();
      stored.rememberBoardState(board.boardId(), board.view() == null ? "kanban" : board.view(), board.ganttFrom(), board.ganttTo(), search);
    }
    return view(userId, preferences.save(stored));
  }

  private View view(UUID userId, UserPreferences stored) {
    List<UUID> recent = entries.findRecentPathIds(userId, RECENT_PATHS).stream().map(UUID::fromString).toList();
    BoardState board = new BoardState(stored.getBoardId(), stored.getBoardView(), stored.getBoardGanttFrom(), stored.getBoardGanttTo(), stored.getBoardSearch());
    return new View(stored.getTheme(), stored.isKanbanWide(), recent, stored.getLastCardBoardId(), board);
  }
}
