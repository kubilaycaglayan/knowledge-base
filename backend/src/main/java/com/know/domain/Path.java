package com.know.domain;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.SQLRestriction;

@Entity
@Table(name = "path")
@SQLRestriction("deleted_at IS NULL")
public class Path {
  @Id private UUID id = UUID.randomUUID();

  @Column(name = "user_id", nullable = false)
  private UUID userId;

  @Column(nullable = false, length = 160)
  private String name;

  @Column(nullable = false, length = 7)
  private String color = "#E8754E";

  private String description;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private PathStatus status = PathStatus.ACTIVE;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt = Instant.now();

  @Column(name = "updated_at", nullable = false)
  private Instant updatedAt = Instant.now();

  @Column(nullable = false)
  private boolean pinned;

  @Column(name = "sort_order")
  private Long sortOrder;

  @Column(name = "archived_at")
  private Instant archivedAt;

  @Column(name = "deleted_at")
  private Instant deletedAt;

  @Column(name = "import_batch_id")
  private UUID importBatchId;

  protected Path() {}

  public Path(UUID userId, String name, String description) {
    this(userId, name, description, null);
  }

  public Path(UUID userId, String name, String description, String color) {
    this.userId = userId;
    this.name = name;
    this.description = description;
    if (color != null && !color.isBlank()) this.color = color;
  }

  public static Path imported(
      UUID id,
      UUID userId,
      String name,
      String description,
      String color,
      PathStatus status,
      Instant createdAt,
      Instant updatedAt) {
    Path path = new Path(userId, name, description, color);
    path.id = id;
    path.status = status == null ? PathStatus.ACTIVE : status;
    path.createdAt = createdAt == null ? Instant.now() : createdAt;
    path.updatedAt = updatedAt == null ? path.createdAt : updatedAt;
    return path;
  }

  public UUID getId() {
    return id;
  }

  public UUID getUserId() {
    return userId;
  }

  public String getName() {
    return name;
  }

  public String getDescription() {
    return description;
  }

  public String getColor() {
    return color;
  }

  public PathStatus getStatus() {
    return status;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public Instant getUpdatedAt() {
    return updatedAt;
  }

  public boolean isPinned() {
    return pinned;
  }

  public Long getSortOrder() {
    return sortOrder;
  }

  public void setPinned(boolean pinned) {
    this.pinned = pinned;
    this.updatedAt = Instant.now();
  }

  public void setSortOrder(long sortOrder) {
    this.sortOrder = sortOrder;
    this.updatedAt = Instant.now();
  }

  public UUID getImportBatchId() {
    return importBatchId;
  }

  public Instant getDeletedAt() {
    return deletedAt;
  }

  public void assignImportBatch(UUID importBatchId) {
    this.importBatchId = importBatchId;
  }

  public void update(String name, String description, String color) {
    this.name = name;
    this.description = description;
    if (color != null && !color.isBlank()) this.color = color;
    this.updatedAt = Instant.now();
  }

  public void archive() {
    status = PathStatus.ARCHIVED;
    archivedAt = Instant.now();
    updatedAt = Instant.now();
  }

  public void delete() {
    deletedAt = Instant.now();
    updatedAt = Instant.now();
  }

  public void restore() {
    deletedAt = null;
    updatedAt = Instant.now();
  }
}
