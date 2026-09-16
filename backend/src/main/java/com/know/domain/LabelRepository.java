package com.know.domain;

import java.util.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

public interface LabelRepository extends JpaRepository<Label, UUID> {
  long deleteByUserIdAndImportBatchId(UUID userId, UUID importBatchId);

  List<Label> findAllByUserIdOrderByName(UUID userId);

  Optional<Label> findByIdAndUserId(UUID id, UUID userId);

  List<Label> findAllByUserIdAndIdIn(UUID userId, Collection<UUID> ids);

  Optional<Label> findByUserIdAndNameIgnoreCase(UUID userId, String name);

  Optional<Label> findByUserIdAndSystemTrue(UUID userId);

  boolean existsByUserIdAndNameIgnoreCase(UUID userId, String name);

  @Query(
      "select l from Label l where l.userId = :userId and exists (select s from LabelScope s where"
          + " s.id.labelId = l.id and s.id.scope = :scope) order by l.name")
  List<Label> findAllByUserIdAndScope(
      @Param("userId") UUID userId, @Param("scope") LabelScopeType scope);
}
