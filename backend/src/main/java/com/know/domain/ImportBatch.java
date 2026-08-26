package com.know.domain;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "import_batch")
public class ImportBatch {
  @Id private UUID id = UUID.randomUUID();

  @Column(name = "user_id", nullable = false)
  private UUID userId;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private TimeSource source;

  @Column(name = "imported_count", nullable = false)
  private int importedCount;

  @Column(name = "skipped_count", nullable = false)
  private int skippedCount;

  @Column(name = "created_paths_count", nullable = false)
  private int createdPathsCount;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt = Instant.now();

  @Column(name = "undone_at")
  private Instant undoneAt;

  protected ImportBatch() {}

  public ImportBatch(UUID userId, TimeSource source) {
    this.userId = userId;
    this.source = source;
  }

  public UUID getId() {
    return id;
  }

  public UUID getUserId() {
    return userId;
  }

  public TimeSource getSource() {
    return source;
  }

  public int getImportedCount() {
    return importedCount;
  }

  public int getSkippedCount() {
    return skippedCount;
  }

  public int getCreatedPathsCount() {
    return createdPathsCount;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public Instant getUndoneAt() {
    return undoneAt;
  }

  public void complete(int imported, int skipped, int createdPaths) {
    this.importedCount = imported;
    this.skippedCount = skipped;
    this.createdPathsCount = createdPaths;
  }

  public void undo() {
    this.undoneAt = Instant.now();
  }
}
