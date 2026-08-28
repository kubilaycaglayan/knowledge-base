package com.know.domain;

import jakarta.persistence.*;
import java.time.*;
import java.util.UUID;

@Entity
@Table(name = "time_entry")
public class TimeEntry {
  @Id private UUID id = UUID.randomUUID();

  @Column(name = "user_id", nullable = false)
  private UUID userId;

  @Column(name = "path_id")
  private UUID pathId;

  @Transient private UUID legacyItemId;

  @Column(name = "started_at", nullable = false)
  private Instant startedAt;

  @Column(name = "ended_at")
  private Instant endedAt;

  @Column(name = "duration_seconds")
  private Long durationSeconds;

  private String description;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private TimeSource source;

  @Column(name = "external_id", length = 255)
  private String externalId;

  @Column(name = "import_batch_id")
  private UUID importBatchId;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt = Instant.now();

  protected TimeEntry() {}

  public TimeEntry(
      UUID userId,
      UUID pathId,
      UUID itemId,
      Instant startedAt,
      String description,
      TimeSource source) {
    this(userId, pathId, itemId, startedAt, description, source, null);
  }

  public TimeEntry(
      UUID userId,
      UUID pathId,
      UUID itemId,
      Instant startedAt,
      String description,
      TimeSource source,
      String externalId) {
    this.userId = userId;
    this.pathId = pathId;
    this.legacyItemId = itemId;
    this.startedAt = startedAt;
    this.description = description;
    this.source = source;
    this.externalId = externalId;
  }

  public UUID getId() {
    return id;
  }

  public UUID getUserId() {
    return userId;
  }

  public UUID getPathId() {
    return pathId;
  }

  public UUID getItemId() {
    return legacyItemId;
  }

  public Instant getStartedAt() {
    return startedAt;
  }

  public Instant getEndedAt() {
    return endedAt;
  }

  public Long getDurationSeconds() {
    return durationSeconds;
  }

  public String getDescription() {
    return description;
  }

  public TimeSource getSource() {
    return source;
  }

  public String getExternalId() {
    return externalId;
  }

  public UUID getImportBatchId() {
    return importBatchId;
  }

  public boolean running() {
    return endedAt == null;
  }

  public void assignImportBatch(UUID importBatchId) {
    this.importBatchId = importBatchId;
  }

  public void stop(Instant end) {
    endedAt = end;
    durationSeconds = Math.max(0, Duration.between(startedAt, end).toSeconds());
  }

  public void reconfigureRunning(UUID pathId, UUID itemId, Instant start, String description) {
    if (!running()) throw new IllegalStateException("Only running entries can be reconfigured");
    this.pathId = pathId;
    this.legacyItemId = itemId;
    this.startedAt = start;
    this.description = description;
  }

  public void edit(
      UUID pathId,
      UUID itemId,
      Instant start,
      Instant end,
      String description,
      TimeSource source) {
    if (running()) throw new IllegalStateException("Running entries cannot be edited");
    this.pathId = pathId;
    this.legacyItemId = itemId;
    this.startedAt = start;
    this.endedAt = end;
    this.durationSeconds = Math.max(0, Duration.between(start, end).toSeconds());
    this.description = description;
    if (source != null) this.source = source;
  }
}
