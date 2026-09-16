package com.know.domain;

import jakarta.persistence.*;
import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;

@Embeddable
public class LabelScopeId implements Serializable {
  @Column(name = "label_id")
  private UUID labelId;

  @Enumerated(EnumType.STRING)
  @Column(name = "scope")
  private LabelScopeType scope;

  protected LabelScopeId() {}

  public LabelScopeId(UUID labelId, LabelScopeType scope) {
    this.labelId = labelId;
    this.scope = scope;
  }

  public UUID getLabelId() {
    return labelId;
  }

  public LabelScopeType getScope() {
    return scope;
  }

  @Override
  public boolean equals(Object other) {
    return other instanceof LabelScopeId x
        && Objects.equals(labelId, x.labelId)
        && scope == x.scope;
  }

  @Override
  public int hashCode() {
    return Objects.hash(labelId, scope);
  }
}
