package com.know.domain;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

@Entity
@Table(name = "note")
public class Note {
  @Id private UUID id = UUID.randomUUID();

  @Column(name = "user_id", nullable = false)
  private UUID userId;

  @Column(name = "path_id")
  private UUID pathId;

  @Column(name = "item_event_id")
  private UUID activityId;

  @Column(name = "time_entry_id")
  private UUID timeEntryId;

  @Column(nullable = false, length = 240)
  private String title;

  @Column(nullable = false, columnDefinition = "text")
  private String content;

  @Column(name = "content_text", columnDefinition = "text")
  private String contentText;

  @Version
  @Column(nullable = false)
  private long version;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt = Instant.now();

  @Column(name = "updated_at", nullable = false)
  private Instant updatedAt = Instant.now();

  @Column(name = "deleted_at")
  private Instant deletedAt;

  @Column(nullable = false)
  private boolean pinned;

  @Column(name = "sort_order")
  private Long sortOrder;

  @Column(name = "pinned_at")
  private Instant pinnedAt;

  @Column(name = "import_batch_id")
  private UUID importBatchId;

  @Column(name = "line_edits", columnDefinition = "text")
  private String lineEdits;

  protected Note() {}

  public Note(UUID userId, UUID pathId, UUID activityId, String title, String content) {
    this.userId = userId;
    this.pathId = pathId;
    this.activityId = activityId;
    this.title = title;
    this.content = content;
    this.contentText = copyOf(content, content);
    this.lineEdits = LineAttribution.fresh(content, createdAt);
  }

  public static Note imported(
      UUID id,
      UUID userId,
      UUID pathId,
      UUID activityId,
      UUID timeEntryId,
      String title,
      String content,
      String contentText,
      Instant createdAt,
      Instant updatedAt) {
    Note note = new Note(userId, pathId, activityId, timeEntryId, title, content);
    note.id = id;
    // An import restores the exported copy as it was; the next edit derives it again.
    note.contentText = contentText == null ? copyOf(content, content) : contentText;
    note.createdAt = createdAt == null ? Instant.now() : createdAt;
    note.updatedAt = updatedAt == null ? note.createdAt : updatedAt;
    note.lineEdits = null;
    return note;
  }

  public Note(
      UUID userId, UUID pathId, UUID activityId, UUID timeEntryId, String title, String content) {
    this(userId, pathId, activityId, title, content);
    this.timeEntryId = timeEntryId;
  }

  public UUID getId() {
    return id;
  }

  public UUID getPathId() {
    return pathId;
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

  public String getContentText() {
    return contentText == null ? content : contentText;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public Instant getUpdatedAt() {
    return updatedAt;
  }

  public long getVersion() {
    return version;
  }

  /** When each body line was last edited, in body line order. */
  public List<Instant> getLineEdits() {
    return LineAttribution.times(content, lineEdits, updatedAt);
  }

  public Instant getDeletedAt() {
    return deletedAt;
  }

  public boolean isPinned() {
    return pinned;
  }

  public Long getSortOrder() {
    return sortOrder;
  }

  public Instant getPinnedAt() {
    return pinnedAt;
  }

  // Pinning drops the manual slot so the item joins the end of the pinned items.
  public void setPinned(boolean pinned) {
    if (pinned && !this.pinned) {
      sortOrder = null;
      pinnedAt = Instant.now();
    }
    if (!pinned) pinnedAt = null;
    this.pinned = pinned;
    touch();
  }

  public void setSortOrder(long sortOrder) {
    this.sortOrder = sortOrder;
    touch();
  }

  public UUID getImportBatchId() {
    return importBatchId;
  }

  public void assignImportBatch(UUID id) {
    importBatchId = id;
  }

  public void delete() {
    deletedAt = Instant.now();
    touch();
  }

  public void restore() {
    deletedAt = null;
    touch();
  }

  // Search and excerpts read the plain-text copy, so the server derives it from document bodies
  // whatever a client sends (the extension sends Markdown, older web clients sent blank lines
  // between blocks); legacy plain-text bodies keep the client's copy.
  private static String copyOf(String content, String clientCopy) {
    String derived = LineAttribution.plainText(content);
    return derived != null ? derived : clientCopy;
  }

  // Rows from before line times date every line from updated_at, so pin those
  // times down before updated_at moves on.
  private void touch() {
    lineEdits = LineAttribution.pin(content, lineEdits, updatedAt);
    updatedAt = Instant.now();
  }

  public void update(String title, String content) {
    update(title, content, content);
  }

  public void update(String title, String content, String contentText) {
    if (Objects.equals(this.content, content)) {
      this.title = title;
      this.contentText = copyOf(content, contentText);
      touch();
      return;
    }
    Instant now = Instant.now();
    lineEdits = LineAttribution.next(this.content, lineEdits, updatedAt, content, now);
    this.title = title;
    this.content = content;
    this.contentText = copyOf(content, contentText);
    this.updatedAt = now;
  }
}
