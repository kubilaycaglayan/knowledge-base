package com.know.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;

@Embeddable
public class TimeEntryLabelId implements Serializable {
  private UUID timeEntryId;

  @Column(name = "label_id")
  private UUID labelId;

  protected TimeEntryLabelId() {}

  public TimeEntryLabelId(UUID timeEntryId, UUID labelId) {
    this.timeEntryId = timeEntryId;
    this.labelId = labelId;
  }

  public UUID getTimeEntryId() {
    return timeEntryId;
  }

  public UUID getLabelId() {
    return labelId;
  }

  @Override
  public boolean equals(Object other) {
    if (this == other) return true;
    if (!(other instanceof TimeEntryLabelId x)) return false;
    return Objects.equals(timeEntryId, x.timeEntryId) && Objects.equals(labelId, x.labelId);
  }

  @Override
  public int hashCode() {
    return Objects.hash(timeEntryId, labelId);
  }
}
