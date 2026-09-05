package com.know.domain;

import jakarta.persistence.Embeddable;
import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;

@Embeddable
public class DailyRecordLabelId implements Serializable {
  private UUID dailyRecordId;
  private UUID dailyLabelId;
  protected DailyRecordLabelId() {}
  public DailyRecordLabelId(UUID dailyRecordId, UUID dailyLabelId) { this.dailyRecordId = dailyRecordId; this.dailyLabelId = dailyLabelId; }
  public UUID getDailyRecordId() { return dailyRecordId; }
  public UUID getDailyLabelId() { return dailyLabelId; }
  @Override public boolean equals(Object other) {
    if (this == other) return true;
    if (!(other instanceof DailyRecordLabelId that)) return false;
    return Objects.equals(dailyRecordId, that.dailyRecordId) && Objects.equals(dailyLabelId, that.dailyLabelId);
  }
  @Override public int hashCode() { return Objects.hash(dailyRecordId, dailyLabelId); }
}
