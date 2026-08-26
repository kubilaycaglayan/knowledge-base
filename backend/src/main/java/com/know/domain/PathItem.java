package com.know.domain;

import jakarta.persistence.*;

@Entity
@Table(name = "path_item")
public class PathItem {
  @EmbeddedId private PathItemId id;

  @Column(nullable = false)
  private int position;

  protected PathItem() {}

  public PathItem(PathItemId id, int position) {
    this.id = id;
    this.position = position;
  }

  public PathItemId getId() {
    return id;
  }
}
