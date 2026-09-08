package com.know.domain;

import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.util.UUID;

@Entity
@Table(name = "time_entry_label")
public class TimeEntryLabel {
  @EmbeddedId private TimeEntryLabelId id;

  protected TimeEntryLabel() {}

  public TimeEntryLabel(UUID timeEntryId, UUID labelId) {
    id = new TimeEntryLabelId(timeEntryId, labelId);
  }

  public UUID getTimeEntryId() { return id.getTimeEntryId(); }
  public UUID getLabelId() { return id.getDailyLabelId(); }
}
