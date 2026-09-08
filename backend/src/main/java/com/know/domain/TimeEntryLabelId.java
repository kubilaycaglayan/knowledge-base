package com.know.domain;

import jakarta.persistence.Embeddable;
import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;

@Embeddable
public class TimeEntryLabelId implements Serializable {
  private UUID timeEntryId;
  private UUID dailyLabelId;

  protected TimeEntryLabelId() {}

  public TimeEntryLabelId(UUID timeEntryId, UUID dailyLabelId) {
    this.timeEntryId = timeEntryId;
    this.dailyLabelId = dailyLabelId;
  }

  public UUID getTimeEntryId() { return timeEntryId; }
  public UUID getDailyLabelId() { return dailyLabelId; }

  @Override
  public boolean equals(Object other) {
    if (this == other) return true;
    if (!(other instanceof TimeEntryLabelId x)) return false;
    return Objects.equals(timeEntryId, x.timeEntryId)
        && Objects.equals(dailyLabelId, x.dailyLabelId);
  }

  @Override
  public int hashCode() { return Objects.hash(timeEntryId, dailyLabelId); }
}
