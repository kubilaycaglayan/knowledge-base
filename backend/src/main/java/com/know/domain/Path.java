package com.know.domain;

import jakarta.persistence.*;
import org.hibernate.annotations.SQLRestriction;
import java.time.Instant;
import java.util.UUID;

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

  public UUID getImportBatchId() {
    return importBatchId;
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
}
