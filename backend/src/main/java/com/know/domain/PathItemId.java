package com.know.domain;

import jakarta.persistence.*;
import java.io.Serializable;
import java.util.*;

@Embeddable
public class PathItemId implements Serializable {
  @Column(name = "path_id")
  UUID pathId;

  @Column(name = "item_id")
  UUID itemId;

  protected PathItemId() {}

  public PathItemId(UUID pathId, UUID itemId) {
    this.pathId = pathId;
    this.itemId = itemId;
  }

  public UUID pathId() {
    return pathId;
  }

  public UUID itemId() {
    return itemId;
  }

  @Override
  public boolean equals(Object o) {
    return o instanceof PathItemId x
        && Objects.equals(pathId, x.pathId)
        && Objects.equals(itemId, x.itemId);
  }

  @Override
  public int hashCode() {
    return Objects.hash(pathId, itemId);
  }
}
