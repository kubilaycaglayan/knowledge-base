package com.know.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;

@Embeddable
public class DailyRecordLabelId implements Serializable {
  private UUID dailyRecordId;
  @Column(name = "label_id") private UUID labelId;
  protected DailyRecordLabelId() {}
  public DailyRecordLabelId(UUID dailyRecordId, UUID labelId) { this.dailyRecordId = dailyRecordId; this.labelId = labelId; }
  public UUID getDailyRecordId() { return dailyRecordId; }
  public UUID getLabelId() { return labelId; }
  @Override public boolean equals(Object other) {
    if (this == other) return true;
    if (!(other instanceof DailyRecordLabelId that)) return false;
    return Objects.equals(dailyRecordId, that.dailyRecordId) && Objects.equals(labelId, that.labelId);
  }
  @Override public int hashCode() { return Objects.hash(dailyRecordId, labelId); }
}
