package com.know.domain;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface LogRepository extends JpaRepository<Log, UUID> {
  long deleteByUserIdAndImportBatchId(UUID userId, UUID importBatchId);

  List<Log> findAllByUserIdOrderByOccurredAtDescIdDesc(UUID userId);

  Optional<Log> findByIdAndUserId(UUID id, UUID userId);

  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select l from Log l where l.id = :id and l.userId = :userId")
  Optional<Log> findByIdAndUserIdForUpdate(@Param("id") UUID id, @Param("userId") UUID userId);
}
