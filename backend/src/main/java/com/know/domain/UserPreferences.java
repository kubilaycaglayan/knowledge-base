package com.know.domain;

import jakarta.persistence.*;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "user_preferences")
public class UserPreferences {
  @Id @Column(name = "user_id") private UUID userId;
  @Column(nullable = false, length = 8) private String theme = "auto";
  @Column(name = "kanban_wide", nullable = false) private boolean kanbanWide;
  @Column(name = "last_card_board_id") private UUID lastCardBoardId;
  @Column(name = "board_id") private UUID boardId;
  @Column(name = "board_view", nullable = false, length = 8) private String boardView = "kanban";
  @Column(name = "board_gantt_from") private LocalDate boardGanttFrom;
  @Column(name = "board_gantt_to") private LocalDate boardGanttTo;
  @Column(name = "board_search", nullable = false, length = 200) private String boardSearch = "";
  @Column(name = "board_gantt_sorts", nullable = false, length = 32) private String boardGanttSorts = "";
  @Column(name = "updated_at", nullable = false) private Instant updatedAt = Instant.now();
  protected UserPreferences() {}
  public UserPreferences(UUID userId) { this.userId = userId; }
  public UUID getUserId() { return userId; }
  public String getTheme() { return theme; }
  public boolean isKanbanWide() { return kanbanWide; }
  public UUID getLastCardBoardId() { return lastCardBoardId; }
  public UUID getBoardId() { return boardId; }
  public String getBoardView() { return boardView; }
  public LocalDate getBoardGanttFrom() { return boardGanttFrom; }
  public LocalDate getBoardGanttTo() { return boardGanttTo; }
  public String getBoardSearch() { return boardSearch; }
  public String getBoardGanttSorts() { return boardGanttSorts; }
  /** A null board is the All boards view. */
  public void rememberBoardState(UUID boardId, String view, LocalDate ganttFrom, LocalDate ganttTo, String search, String ganttSorts) {
    this.boardId = boardId;
    boardView = view;
    boardGanttFrom = ganttFrom;
    boardGanttTo = ganttTo;
    boardSearch = search;
    boardGanttSorts = ganttSorts;
    updatedAt = Instant.now();
  }
  public void chooseCardBoard(UUID boardId) { lastCardBoardId = boardId; updatedAt = Instant.now(); }
  public void update(String theme, Boolean kanbanWide) {
    if (theme != null) this.theme = theme;
    if (kanbanWide != null) this.kanbanWide = kanbanWide;
    updatedAt = Instant.now();
  }
}
