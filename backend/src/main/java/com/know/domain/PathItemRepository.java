package com.know.domain;

import java.util.*;
import org.springframework.data.jpa.repository.*;

public interface PathItemRepository extends JpaRepository<PathItem, PathItemId> {
  interface ItemPathProjection {
    UUID getItemId();

    UUID getPathId();
  }

  @Query("select p.id.itemId from PathItem p where p.id.pathId=:pathId")
  List<UUID> findItemIds(UUID pathId);

  @Query("select p.id.pathId from PathItem p where p.id.itemId=:itemId")
  List<UUID> findPathIds(UUID itemId);

  @Query(
      "select p.id.itemId as itemId,p.id.pathId as pathId from PathItem p where p.id.itemId in"
          + " :itemIds")
  List<ItemPathProjection> findRelationships(Collection<UUID> itemIds);

  void deleteAllByIdItemId(UUID itemId);

  boolean existsByIdPathIdAndIdItemId(UUID pathId, UUID itemId);
}
