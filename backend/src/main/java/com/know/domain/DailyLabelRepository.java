package com.know.domain;

import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DailyLabelRepository extends JpaRepository<DailyLabel, UUID> {
  List<DailyLabel> findAllByUserIdOrderByName(UUID userId);
  Optional<DailyLabel> findByIdAndUserId(UUID id, UUID userId);
  List<DailyLabel> findAllByUserIdAndIdIn(UUID userId, Collection<UUID> ids);
  boolean existsByUserIdAndNameIgnoreCase(UUID userId, String name);
}
