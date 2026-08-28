package com.know.domain;

import jakarta.persistence.Embeddable;
import java.io.Serializable;
import java.util.UUID;

@Embeddable
public class TimeEntryItemId implements Serializable {
  private UUID timeEntryId;
  private UUID itemId;

  protected TimeEntryItemId() {}

  public TimeEntryItemId(UUID timeEntryId, UUID itemId) {
    this.timeEntryId = timeEntryId;
    this.itemId = itemId;
  }

  public UUID getTimeEntryId() { return timeEntryId; }
  public UUID getItemId() { return itemId; }

  @Override
  public boolean equals(Object other) {
    if (this == other) return true;
    if (!(other instanceof TimeEntryItemId x)) return false;
    return java.util.Objects.equals(timeEntryId, x.timeEntryId)
        && java.util.Objects.equals(itemId, x.itemId);
  }

  @Override
  public int hashCode() { return java.util.Objects.hash(timeEntryId, itemId); }
}
