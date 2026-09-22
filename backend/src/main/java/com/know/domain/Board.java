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
  @Column(name = "archived_at") private Instant archivedAt;
  @Column(name = "created_at", nullable = false) private Instant createdAt = Instant.now();
  @Column(name = "updated_at", nullable = false) private Instant updatedAt = Instant.now();

  protected Board() {}
  public Board(UUID userId, String name) { this.userId = userId; this.name = name.trim(); }
  public UUID getId() { return id; }
  public UUID getUserId() { return userId; }
  public String getName() { return name; }
  public Instant getArchivedAt() { return archivedAt; }
  public Instant getCreatedAt() { return createdAt; }
  public Instant getUpdatedAt() { return updatedAt; }
  public boolean isArchived() { return archivedAt != null; }
  public void rename(String name) { this.name = name.trim(); this.updatedAt = Instant.now(); }
  public void archive() { archivedAt = Instant.now(); updatedAt = Instant.now(); }
  public void restore() { archivedAt = null; updatedAt = Instant.now(); }
}
