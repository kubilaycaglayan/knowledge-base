package com.know.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;

@Entity
@Table(name = "daily_record_label")
public class DailyRecordLabel {
  @EmbeddedId private DailyRecordLabelId id;

  @Column(precision = 3, scale = 2)
  private BigDecimal portion;

  protected DailyRecordLabel() {}

  public DailyRecordLabel(DailyRecordLabelId id, BigDecimal portion) {
    this.id = id;
    this.portion = portion;
  }

  public DailyRecordLabelId getId() {
    return id;
  }

  public BigDecimal getPortion() {
    return portion;
  }
}
