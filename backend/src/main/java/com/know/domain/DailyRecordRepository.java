package com.know.domain;

import java.time.LocalDate;
import java.util.*;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface DailyRecordRepository extends JpaRepository<DailyRecord, UUID> {
  long deleteByUserIdAndImportBatchId(UUID userId, UUID importBatchId);

  List<DailyRecord> findAllByUserId(UUID userId);

  Optional<DailyRecord> findByUserIdAndRecordDate(UUID userId, LocalDate recordDate);

  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select r from DailyRecord r where r.userId = :userId and r.recordDate = :recordDate")
  Optional<DailyRecord> findByUserIdAndRecordDateForUpdate(
      @Param("userId") UUID userId, @Param("recordDate") LocalDate recordDate);

  Optional<DailyRecord> findByIdAndUserId(UUID id, UUID userId);

  List<DailyRecord> findAllByUserIdAndRecordDateBetweenOrderByRecordDate(
      UUID userId, LocalDate from, LocalDate to);
}
