package com.know.domain;

import jakarta.persistence.*;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;

@Entity
@Table(name = "board_cards")
public class BoardCard {
  @Id private UUID id = UUID.randomUUID();
  @Column(name = "board_id", nullable = false) private UUID boardId;
  @Column(name = "status_id", nullable = false) private UUID statusId;
  @Column(nullable = false, length = 240) private String title = "";
  @Column(nullable = false, columnDefinition = "text") private String body = "{}";
  @Enumerated(EnumType.STRING) @Column(nullable = false, length = 10) private BoardPriority priority = BoardPriority.MEDIUM;
  @Column(name = "start_date") private LocalDate startDate;
  @Column(name = "due_date") private LocalDate dueDate;
  @Column(nullable = false) private int position;
  @Column(name = "archived_at") private Instant archivedAt;
  @Column(name = "created_at", nullable = false) private Instant createdAt = now();
  @Column(name = "updated_at", nullable = false) private Instant updatedAt = now();
  @ManyToMany @JoinTable(name = "board_card_paths", joinColumns = @JoinColumn(name = "card_id"), inverseJoinColumns = @JoinColumn(name = "path_id")) private Set<Path> paths = new LinkedHashSet<>();
  @ManyToMany @JoinTable(name = "board_card_labels", joinColumns = @JoinColumn(name = "card_id"), inverseJoinColumns = @JoinColumn(name = "label_id")) private Set<Label> labels = new LinkedHashSet<>();
  protected BoardCard() {}
  public BoardCard(UUID boardId, UUID statusId, int position) { this.boardId = boardId; this.statusId = statusId; this.position = position; }
  public UUID getId() { return id; } public UUID getBoardId() { return boardId; } public UUID getStatusId() { return statusId; }
  public String getTitle() { return title; } public String getBody() { return body; } public BoardPriority getPriority() { return priority; }
  public LocalDate getStartDate() { return startDate; } public LocalDate getDueDate() { return dueDate; } public int getPosition() { return position; }
  public Instant getArchivedAt() { return archivedAt; } public Instant getCreatedAt() { return createdAt; } public Instant getUpdatedAt() { return updatedAt; }
  public Set<Path> getPaths() { return paths; } public Set<Label> getLabels() { return labels; }
  public boolean isArchived() { return archivedAt != null; }
  public void update(String title, String body, BoardPriority priority, LocalDate start, LocalDate due) { this.title = title == null ? "" : title; this.body = body == null || body.isBlank() ? "{}" : body; this.priority = priority == null ? BoardPriority.MEDIUM : priority; this.startDate = start; this.dueDate = due; this.updatedAt = now(); }
  public void move(UUID statusId, int position) { this.statusId = statusId; this.position = position; this.updatedAt = now(); }
  public void archive() { archivedAt = now(); updatedAt = now(); } public void restore() { archivedAt = null; updatedAt = now(); }
  public void setPaths(Collection<Path> values) { paths = new LinkedHashSet<>(values); } public void setLabels(Collection<Label> values) { labels = new LinkedHashSet<>(values); }
  private static Instant now() { return Instant.now().truncatedTo(ChronoUnit.MICROS); }
}
