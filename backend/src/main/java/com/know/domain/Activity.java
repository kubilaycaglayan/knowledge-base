package com.know.domain;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "item_event")
public class Activity {
  @Id private UUID id = UUID.randomUUID();

  @Column(name = "user_id", nullable = false)
  private UUID userId;

  @Column(name = "path_id")
  private UUID pathId;

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
      UUID userId, UUID pathId, ActivityType type, String title, String detail) {
    this(userId, pathId, type, title, detail, Instant.now());
  }

  public Activity(
      UUID userId, UUID pathId, UUID timeEntryId, ActivityType type,
      String title, String detail) {
    this(userId, pathId, type, title, detail, Instant.now());
    this.timeEntryId = timeEntryId;
  }

  public Activity(
      UUID userId,
      UUID pathId,
      ActivityType type,
      String title,
      String detail,
      Instant occurredAt) {
    this.userId = userId;
    this.pathId = pathId;
    this.type = type;
    this.title = title;
    this.detail = detail;
    this.occurredAt = occurredAt;
  }

  public Activity(
      UUID userId, UUID pathId, UUID timeEntryId, ActivityType type,
      String title, String detail, Instant occurredAt) {
    this(userId, pathId, type, title, detail, occurredAt);
    this.timeEntryId = timeEntryId;
  }

  public static Activity session(
      UUID userId, UUID pathId, UUID timeEntryId, String title, String detail,
      Instant occurredAt) {
    return new Activity(
        userId, pathId, timeEntryId, ActivityType.TIME_TRACKED, title, detail, occurredAt);
  }

  public UUID getId() {
    return id;
  }

  public UUID getPathId() {
    return pathId;
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
      UUID pathId, String title, String detail, Instant occurredAt) {
    this.pathId = pathId;
    this.title = title;
    this.detail = detail;
    this.occurredAt = occurredAt;
  }
}
