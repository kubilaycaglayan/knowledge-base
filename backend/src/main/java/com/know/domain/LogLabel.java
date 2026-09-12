package com.know.domain;

import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

@Entity
@Table(name = "log_label")
public class LogLabel {
  @EmbeddedId private LogLabelId id;
  protected LogLabel() {}
  public LogLabel(LogLabelId id) { this.id = id; }
  public LogLabelId getId() { return id; }
}
