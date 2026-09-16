package com.know.domain;

import jakarta.persistence.*;
import java.time.*;
import java.util.UUID;

@Entity
@Table(
    name = "daily_record",
    uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "record_date"}))
public class DailyRecord {
  @Id private UUID id = UUID.randomUUID();

  @Column(name = "user_id", nullable = false)
  private UUID userId;

  @Column(name = "record_date", nullable = false)
  private LocalDate recordDate;

  @Column(columnDefinition = "text")
  private String note;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt = Instant.now();

  @Column(name = "updated_at", nullable = false)
  private Instant updatedAt = Instant.now();

  @Column(name = "import_batch_id")
  private UUID importBatchId;

  protected DailyRecord() {}

  public DailyRecord(UUID userId, LocalDate recordDate, String note) {
    this.userId = userId;
    this.recordDate = recordDate;
    this.note = note;
  }

  public static DailyRecord imported(
      UUID id, UUID userId, LocalDate date, String note, Instant createdAt, Instant updatedAt) {
    DailyRecord record = new DailyRecord(userId, date, note);
    record.id = id;
    record.createdAt = createdAt == null ? Instant.now() : createdAt;
    record.updatedAt = updatedAt == null ? record.createdAt : updatedAt;
    return record;
  }

  public UUID getId() {
    return id;
  }

  public UUID getUserId() {
    return userId;
  }

  public LocalDate getRecordDate() {
    return recordDate;
  }

  public String getNote() {
    return note;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public Instant getUpdatedAt() {
    return updatedAt;
  }

  public void assignImportBatch(UUID id) {
    importBatchId = id;
  }

  public void update(String note) {
    this.note = note;
    this.updatedAt = Instant.now();
  }
}
