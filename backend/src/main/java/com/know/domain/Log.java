package com.know.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "logs")
public class Log {
  @Id private UUID id = UUID.randomUUID();
  @Column(name = "user_id", nullable = false) private UUID userId;
  @Column(nullable = false, columnDefinition = "text") private String body;
  @Column(name = "occurred_at", nullable = false) private Instant occurredAt;
  @Version @Column(nullable = false) private long version;
  @Column(name = "created_at", nullable = false) private Instant createdAt = Instant.now();
  @Column(name = "updated_at", nullable = false) private Instant updatedAt = Instant.now();
  @Column(name = "import_batch_id") private UUID importBatchId;

  protected Log() {}

  public Log(UUID userId, String body, Instant occurredAt) {
    this.userId = userId;
    this.body = body;
    this.occurredAt = occurredAt;
  }

  public static Log imported(UUID id, UUID userId, String body, Instant occurredAt,
      Instant createdAt, Instant updatedAt) {
    Log log = new Log(userId, body, occurredAt);
    log.id = id;
    log.createdAt = createdAt == null ? Instant.now() : createdAt;
    log.updatedAt = updatedAt == null ? log.createdAt : updatedAt;
    return log;
  }

  public UUID getId() { return id; }
  public UUID getUserId() { return userId; }
  public String getBody() { return body; }
  public Instant getOccurredAt() { return occurredAt; }
  public long getVersion() { return version; }
  public Instant getCreatedAt() { return createdAt; }
  public Instant getUpdatedAt() { return updatedAt; }
  public UUID getImportBatchId() { return importBatchId; }
  public void assignImportBatch(UUID importBatchId) { this.importBatchId = importBatchId; }

  public void update(String body, Instant occurredAt) {
    this.body = body;
    this.occurredAt = occurredAt;
    this.updatedAt = Instant.now();
  }
}
