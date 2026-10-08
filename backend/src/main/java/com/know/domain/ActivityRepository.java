package com.know.domain;

import java.util.*;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

public interface ActivityRepository extends JpaRepository<Activity, UUID> {
  List<Activity> findAllByUserId(UUID userId);

  List<Activity> findTop100ByUserIdOrderByOccurredAtDesc(UUID userId);

  List<Activity> findTop50ByUserIdAndPathIdOrderByOccurredAtDesc(UUID userId, UUID pathId);

  Optional<Activity> findByIdAndUserId(UUID id, UUID userId);

  List<Activity> findAllByTimeEntryId(UUID timeEntryId);

  long deleteByUserIdAndImportBatchId(UUID userId, UUID importBatchId);
}
