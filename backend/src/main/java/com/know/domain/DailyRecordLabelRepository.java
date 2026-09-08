package com.know.domain;

import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DailyRecordLabelRepository extends JpaRepository<DailyRecordLabel, DailyRecordLabelId> {
  List<DailyRecordLabel> findAllByIdDailyRecordIdIn(Collection<UUID> recordIds);
  List<DailyRecordLabel> findAllByIdDailyRecordId(UUID recordId);
  void deleteAllByIdDailyRecordId(UUID recordId);
  boolean existsByIdLabelId(UUID labelId);
}
