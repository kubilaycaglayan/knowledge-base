package com.know.domain;

import java.time.LocalDate;
import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DailyRecordRepository extends JpaRepository<DailyRecord, UUID> {
  long deleteByUserIdAndImportBatchId(UUID userId, UUID importBatchId);
  List<DailyRecord> findAllByUserId(UUID userId);
  Optional<DailyRecord> findByUserIdAndRecordDate(UUID userId, LocalDate recordDate);
  Optional<DailyRecord> findByIdAndUserId(UUID id, UUID userId);
  List<DailyRecord> findAllByUserIdAndRecordDateBetweenOrderByRecordDate(UUID userId, LocalDate from, LocalDate to);
}
