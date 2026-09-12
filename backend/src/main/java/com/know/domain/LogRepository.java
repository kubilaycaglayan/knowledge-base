package com.know.domain;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LogRepository extends JpaRepository<Log, UUID> {
  long deleteByUserIdAndImportBatchId(UUID userId, UUID importBatchId);
  List<Log> findAllByUserIdOrderByOccurredAtDescIdDesc(UUID userId);
  Optional<Log> findByIdAndUserId(UUID id, UUID userId);
}
