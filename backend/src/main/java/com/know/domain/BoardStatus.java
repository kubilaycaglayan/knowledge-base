package com.know.domain;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "board_statuses")
public class BoardStatus {
  @Id private UUID id = UUID.randomUUID();
  @Column(name = "board_id", nullable = false) private UUID boardId;
  @Column(nullable = false, length = 80) private String name;
  @Column(nullable = false) private int position;
  @Column(name = "archived_at") private Instant archivedAt;
  @Enumerated(EnumType.STRING) @Column(name = "card_sort", nullable = false, length = 16) private BoardCardSort cardSort = BoardCardSort.MANUAL;
  protected BoardStatus() {}
  public BoardStatus(UUID boardId, String name, int position) { this.boardId = boardId; this.name = name.trim(); this.position = position; }
  public UUID getId() { return id; }
  public UUID getBoardId() { return boardId; }
  public String getName() { return name; }
  public int getPosition() { return position; }
  public Instant getArchivedAt() { return archivedAt; }
  public boolean isArchived() { return archivedAt != null; }
  public BoardCardSort getCardSort() { return cardSort; }
  public void sortCardsBy(BoardCardSort cardSort) { this.cardSort = cardSort; }
  public void rename(String name) { this.name = name.trim(); }
  public void moveTo(int position) { this.position = position; }
  public void archive() { archivedAt = Instant.now(); }
  public void restore() { archivedAt = null; }
}
