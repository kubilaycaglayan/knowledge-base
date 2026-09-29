package com.know.domain;

import jakarta.persistence.*;
import java.util.*;

@Entity
@Table(name = "tracker_draft")
public class TrackerDraft {
  @Id
  @Column(name = "user_id")
  private UUID userId;

  @Column(name = "path_id")
  private UUID pathId;

  @Column(length = 5000)
  private String description;

  @ElementCollection
  @CollectionTable(name = "tracker_draft_label", joinColumns = @JoinColumn(name = "user_id"))
  @Column(name = "label_id", nullable = false)
  private Set<UUID> labelIds = new HashSet<>();

  // The total of a paused session's recorded segments; null when not paused.
  @Column(name = "paused_seconds")
  private Long pausedSeconds;

  protected TrackerDraft() {}

  public TrackerDraft(UUID userId) {
    this.userId = userId;
  }

  public UUID getPathId() {
    return pathId;
  }

  public String getDescription() {
    return description;
  }

  public List<UUID> getLabelIds() {
    return labelIds.stream().sorted().toList();
  }

  public Long getPausedSeconds() {
    return pausedSeconds;
  }

  public boolean paused() {
    return pausedSeconds != null;
  }

  public void pause(long totalSeconds) {
    pausedSeconds = Math.max(0, totalSeconds);
  }

  public void clearPause() {
    pausedSeconds = null;
  }

  public void configure(UUID pathId, Collection<UUID> labels, String description) {
    this.pathId = pathId;
    this.description = description;
    labelIds.clear();
    labels.stream().filter(Objects::nonNull).forEach(labelIds::add);
  }
}
