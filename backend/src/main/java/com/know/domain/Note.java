package com.know.domain;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "note")
public class Note {
  @Id private UUID id = UUID.randomUUID();

  @Column(name = "user_id", nullable = false)
  private UUID userId;

  @Column(name = "path_id")
  private UUID pathId;

  @Column(name = "item_id")
  private UUID itemId;

  @Column(name = "item_event_id")
  private UUID activityId;

  @Column(name = "time_entry_id")
  private UUID timeEntryId;

  @Column(nullable = false, length = 240)
  private String title;

  @Column(nullable = false, columnDefinition = "text")
  private String content;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt = Instant.now();

  @Column(name = "updated_at", nullable = false)
  private Instant updatedAt = Instant.now();

  protected Note() {}

  public Note(
      UUID userId, UUID pathId, UUID itemId, UUID activityId, String title, String content) {
    this.userId = userId;
    this.pathId = pathId;
    this.itemId = itemId;
    this.activityId = activityId;
    this.title = title;
    this.content = content;
  }

  public Note(
      UUID userId, UUID pathId, UUID itemId, UUID activityId, UUID timeEntryId,
      String title, String content) {
    this(userId, pathId, itemId, activityId, title, content);
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

  public UUID getActivityId() {
    return activityId;
  }

  public UUID getTimeEntryId() {
    return timeEntryId;
  }

  public String getTitle() {
    return title;
  }

  public String getContent() {
    return content;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public Instant getUpdatedAt() {
    return updatedAt;
  }

  public void update(String title, String content) {
    this.title = title;
    this.content = content;
    this.updatedAt = Instant.now();
  }
}
