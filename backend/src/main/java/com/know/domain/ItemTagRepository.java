package com.know.domain;

import java.util.*;
import org.springframework.data.jpa.repository.*;

public interface ItemTagRepository extends JpaRepository<ItemTag, ItemTagId> {
  interface ItemTagProjection {
    UUID getItemId();

    String getName();
  }

  @Query("select t from Tag t join ItemTag it on it.id.tagId=t.id where it.id.itemId=:itemId")
  List<Tag> findTags(UUID itemId);

  @Query(
      "select it.id.itemId as itemId,t.name as name from Tag t join ItemTag it on it.id.tagId=t.id"
          + " where it.id.itemId in :itemIds")
  List<ItemTagProjection> findRelationships(Collection<UUID> itemIds);

  List<ItemTag> findAllByIdItemId(UUID itemId);
}
