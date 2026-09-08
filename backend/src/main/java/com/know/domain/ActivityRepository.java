package com.know.domain;

import java.util.*;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

public interface ActivityRepository extends JpaRepository<Activity, UUID> {
  List<Activity> findTop100ByUserIdOrderByOccurredAtDesc(UUID userId);

  List<Activity> findTop50ByUserIdAndPathIdOrderByOccurredAtDesc(UUID userId, UUID pathId);

  @Query(
      "select a from Activity a where a.userId=:userId and (lower(a.title) like"
          + " lower(concat('%',:query,'%')) or lower(coalesce(a.detail,'')) like"
          + " lower(concat('%',:query,'%'))) order by a.occurredAt desc")
  List<Activity> search(@Param("userId") UUID userId, @Param("query") String query, Pageable page);

  Optional<Activity> findByIdAndUserId(UUID id, UUID userId);

  List<Activity> findAllByTimeEntryId(UUID timeEntryId);

  long deleteByUserIdAndImportBatchId(UUID userId, UUID importBatchId);
}
