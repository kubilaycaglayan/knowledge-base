package com.know.domain;

import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

@Entity
@Table(name = "time_entry_item")
public class TimeEntryItem {
  @EmbeddedId private TimeEntryItemId id;

  protected TimeEntryItem() {}

  public TimeEntryItem(java.util.UUID timeEntryId, java.util.UUID itemId) {
    this.id = new TimeEntryItemId(timeEntryId, itemId);
  }

  public java.util.UUID getTimeEntryId() { return id.getTimeEntryId(); }
  public java.util.UUID getItemId() { return id.getItemId(); }
}
