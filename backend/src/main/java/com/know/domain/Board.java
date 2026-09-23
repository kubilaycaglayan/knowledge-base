package com.know.domain;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "boards")
public class Board {
  @Id private UUID id = UUID.randomUUID();
  @Column(name = "user_id", nullable = false) private UUID userId;
  @Column(nullable = false, length = 120) private String name;
  @Column(name = "path_id") private UUID pathId;
  @Column(nullable = false) private boolean hidden;
  @Column(nullable = false) private boolean pinned;
  @Column(name = "sort_order") private Long sortOrder;
  @Column(name = "archived_at") private Instant archivedAt;
  @Column(name = "created_at", nullable = false) private Instant createdAt = Instant.now();
  @Column(name = "updated_at", nullable = false) private Instant updatedAt = Instant.now();

  protected Board() {}
  public Board(UUID userId, String name) { this.userId = userId; this.name = name.trim(); }
  public static Board forPath(Path path) { Board board = new Board(path.getUserId(), boardName(path)); board.pathId = path.getId(); return board; }
  // Board names are capped at 120 characters while path names allow 160.
  public static String boardName(Path path) { String name = path.getName().trim(); return name.length() > 120 ? name.substring(0, 120) : name; }
  public UUID getId() { return id; }
  public UUID getUserId() { return userId; }
  public String getName() { return name; }
  public Instant getArchivedAt() { return archivedAt; }
  public Instant getCreatedAt() { return createdAt; }
  public Instant getUpdatedAt() { return updatedAt; }
  public UUID getPathId() { return pathId; }
  public boolean isPathBoard() { return pathId != null; }
  public boolean isHidden() { return hidden; }
  public boolean isPinned() { return pinned; }
  public Long getSortOrder() { return sortOrder; }
  public boolean isArchived() { return archivedAt != null; }
  public void setHidden(boolean hidden) { this.hidden = hidden; updatedAt = Instant.now(); }
  public void setPinned(boolean pinned) { this.pinned = pinned; updatedAt = Instant.now(); }
  public void setSortOrder(long sortOrder) { this.sortOrder = sortOrder; }
  public void rename(String name) { this.name = name.trim(); this.updatedAt = Instant.now(); }
  public void archive() { archivedAt = Instant.now(); updatedAt = Instant.now(); }
  public void restore() { archivedAt = null; updatedAt = Instant.now(); }
}
