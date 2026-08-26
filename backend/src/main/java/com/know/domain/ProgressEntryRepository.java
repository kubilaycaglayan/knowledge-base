package com.know.domain;

import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProgressEntryRepository extends JpaRepository<ProgressEntry, UUID> {
  List<ProgressEntry> findAllByItemIdOrderByChangedAtDesc(UUID itemId);

  List<ProgressEntry> findTop10ByUserIdOrderByChangedAtDesc(UUID userId);
}
