package com.know.domain;

import java.util.*;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ImportBatchRepository extends JpaRepository<ImportBatch, UUID> {
  List<ImportBatch> findAllByUserIdAndSourceOrderByCreatedAtDesc(
      UUID userId, TimeSource source, org.springframework.data.domain.Pageable page);

  List<ImportBatch> findAllByUserIdOrderByCreatedAtDesc(UUID userId, Pageable page);

  Optional<ImportBatch> findByIdAndUserId(UUID id, UUID userId);
}
