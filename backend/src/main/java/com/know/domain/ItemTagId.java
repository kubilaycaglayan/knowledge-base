package com.know.domain;

import jakarta.persistence.*;
import java.io.Serializable;
import java.util.*;

@Embeddable
public class ItemTagId implements Serializable {
  @Column(name = "item_id")
  UUID itemId;

  @Column(name = "tag_id")
  UUID tagId;

  protected ItemTagId() {}

  public ItemTagId(UUID itemId, UUID tagId) {
    this.itemId = itemId;
    this.tagId = tagId;
  }

  @Override
  public boolean equals(Object o) {
    return o instanceof ItemTagId x
        && Objects.equals(itemId, x.itemId)
        && Objects.equals(tagId, x.tagId);
  }

  @Override
  public int hashCode() {
    return Objects.hash(itemId, tagId);
  }
}
