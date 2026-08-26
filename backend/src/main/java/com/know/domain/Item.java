package com.know.domain;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "item")
public class Item {
  @Id private UUID id = UUID.randomUUID();

  @Column(name = "user_id", nullable = false)
  private UUID userId;

  @Column(nullable = false, length = 240)
  private String title;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private ItemType type = ItemType.CUSTOM;

  private String description;

  @Column(length = 1000)
  private String source;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private ItemStatus status = ItemStatus.PLANNED;

  @Column(nullable = false)
  private short progress;

  @Column(name = "started_at")
  private Instant startedAt;

  @Column(name = "completed_at")
  private Instant completedAt;

  @Column(name = "estimated_duration")
  private Integer estimatedDuration;

  @Column(name = "parent_item_id")
  private UUID parentItemId;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt = Instant.now();

  @Column(name = "updated_at", nullable = false)
  private Instant updatedAt = Instant.now();

  protected Item() {}

  public Item(UUID userId, String title, ItemType type, String description) {
    this(userId, title, type, description, null);
  }

  public Item(UUID userId, String title, ItemType type, String description, String source) {
    this.userId = userId;
    this.title = title;
    this.type = type;
    this.description = description;
    this.source = source;
  }

  public UUID getId() {
    return id;
  }

  public UUID getUserId() {
    return userId;
  }

  public String getTitle() {
    return title;
  }

  public ItemType getType() {
    return type;
  }

  public String getDescription() {
    return description;
  }

  public String getSource() {
    return source;
  }

  public ItemStatus getStatus() {
    return status;
  }

  public short getProgress() {
    return progress;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public Instant getUpdatedAt() {
    return updatedAt;
  }

  public void update(
      String title, ItemType type, String description, String source, ItemStatus status) {
    this.title = title;
    this.type = type;
    this.description = description;
    this.source = source;
    this.status = status;
    this.updatedAt = Instant.now();
    if (status == ItemStatus.COMPLETED) {
      progress = 100;
      completedAt = Instant.now();
    }
  }

  public short setProgress(short value) {
    short previous = progress;
    progress = value;
    updatedAt = Instant.now();
    if (value == 100) {
      status = ItemStatus.COMPLETED;
      completedAt = Instant.now();
    } else if (status == ItemStatus.COMPLETED) {
      status = value > 0 ? ItemStatus.ACTIVE : ItemStatus.PLANNED;
      completedAt = null;
    } else if (value == 0 && status == ItemStatus.ACTIVE) {
      status = ItemStatus.PLANNED;
    } else if (value > 0 && status == ItemStatus.PLANNED) {
      status = ItemStatus.ACTIVE;
    }
    return previous;
  }
}
