package com.know.domain;

import java.time.LocalDate;
import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DailyRecordRepository extends JpaRepository<DailyRecord, UUID> {
  Optional<DailyRecord> findByUserIdAndRecordDate(UUID userId, LocalDate recordDate);
  List<DailyRecord> findAllByUserIdAndRecordDateBetweenOrderByRecordDate(UUID userId, LocalDate from, LocalDate to);
}
