package com.know.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;

@Embeddable
public class LogLabelId implements Serializable {
  @Column(name = "log_id")
  private UUID logId;

  @Column(name = "label_id")
  private UUID labelId;

  protected LogLabelId() {}

  public LogLabelId(UUID logId, UUID labelId) {
    this.logId = logId;
    this.labelId = labelId;
  }

  public UUID getLogId() {
    return logId;
  }

  public UUID getLabelId() {
    return labelId;
  }

  @Override
  public boolean equals(Object other) {
    return other instanceof LogLabelId value
        && Objects.equals(logId, value.logId)
        && Objects.equals(labelId, value.labelId);
  }

  @Override
  public int hashCode() {
    return Objects.hash(logId, labelId);
  }
}
