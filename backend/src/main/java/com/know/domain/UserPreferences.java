package com.know.domain;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "user_preferences")
public class UserPreferences {
  @Id @Column(name = "user_id") private UUID userId;
  @Column(nullable = false, length = 8) private String theme = "auto";
  @Column(name = "kanban_wide", nullable = false) private boolean kanbanWide;
  @Column(name = "last_card_board_id") private UUID lastCardBoardId;
  @Column(name = "updated_at", nullable = false) private Instant updatedAt = Instant.now();
  protected UserPreferences() {}
  public UserPreferences(UUID userId) { this.userId = userId; }
  public UUID getUserId() { return userId; }
  public String getTheme() { return theme; }
  public boolean isKanbanWide() { return kanbanWide; }
  public UUID getLastCardBoardId() { return lastCardBoardId; }
  public void chooseCardBoard(UUID boardId) { lastCardBoardId = boardId; updatedAt = Instant.now(); }
  public void update(String theme, Boolean kanbanWide) {
    if (theme != null) this.theme = theme;
    if (kanbanWide != null) this.kanbanWide = kanbanWide;
    updatedAt = Instant.now();
  }
}
