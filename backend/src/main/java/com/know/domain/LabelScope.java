package com.know.domain;

import jakarta.persistence.*;

@Entity
@Table(name = "label_scope")
public class LabelScope {
  @EmbeddedId private LabelScopeId id;
  protected LabelScope() {}
  public LabelScope(LabelScopeId id) { this.id = id; }
  public LabelScopeId getId() { return id; }
}
