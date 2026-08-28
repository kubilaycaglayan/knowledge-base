package com.know.domain;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "activity")
public class Activity {
  @Id private UUID id = UUID.randomUUID();

  @Column(name = "user_id", nullable = false)
  private UUID userId;

  @Column(name = "path_id")
  private UUID pathId;

  @Column(name = "item_id")
  private UUID itemId;

  @Column(name = "time_entry_id")
  private UUID timeEntryId;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private ActivityType type;

  @Column(nullable = false, length = 240)
  private String title;

  @Column(columnDefinition = "text")
  private String detail;

  @Column(name = "occurred_at", nullable = false)
  private Instant occurredAt = Instant.now();

  @Column(name = "import_batch_id")
  private UUID importBatchId;

  protected Activity() {}

  public Activity(
      UUID userId, UUID pathId, UUID itemId, ActivityType type, String title, String detail) {
    this(userId, pathId, itemId, type, title, detail, Instant.now());
  }

  public Activity(
      UUID userId, UUID pathId, UUID itemId, UUID timeEntryId, ActivityType type,
      String title, String detail) {
    this(userId, pathId, itemId, type, title, detail, Instant.now());
    this.timeEntryId = timeEntryId;
  }

  public Activity(
      UUID userId,
      UUID pathId,
      UUID itemId,
      ActivityType type,
      String title,
      String detail,
      Instant occurredAt) {
    this.userId = userId;
    this.pathId = pathId;
    this.itemId = itemId;
    this.type = type;
    this.title = title;
    this.detail = detail;
    this.occurredAt = occurredAt;
  }

  public Activity(
      UUID userId, UUID pathId, UUID itemId, UUID timeEntryId, ActivityType type,
      String title, String detail, Instant occurredAt) {
    this(userId, pathId, itemId, type, title, detail, occurredAt);
    this.timeEntryId = timeEntryId;
  }

  public UUID getId() {
    return id;
  }

  public UUID getPathId() {
    return pathId;
  }

  public UUID getItemId() {
    return itemId;
  }

  public UUID getTimeEntryId() {
    return timeEntryId;
  }

  public ActivityType getType() {
    return type;
  }

  public String getTitle() {
    return title;
  }

  public String getDetail() {
    return detail;
  }

  public Instant getOccurredAt() {
    return occurredAt;
  }

  public UUID getImportBatchId() {
    return importBatchId;
  }

  public void assignImportBatch(UUID importBatchId) {
    this.importBatchId = importBatchId;
  }

  public void updateForTimeEntry(
      UUID pathId, UUID itemId, String title, String detail, Instant occurredAt) {
    this.pathId = pathId;
    this.itemId = itemId;
    this.title = title;
    this.detail = detail;
    this.occurredAt = occurredAt;
  }
}
