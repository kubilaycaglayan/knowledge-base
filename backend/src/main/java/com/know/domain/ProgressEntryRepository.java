package com.know.domain;
import org.springframework.data.jpa.repository.JpaRepository;import java.util.*;
public interface ProgressEntryRepository extends JpaRepository<ProgressEntry,UUID>{List<ProgressEntry> findAllByItemIdOrderByChangedAtDesc(UUID itemId);List<ProgressEntry> findTop10ByUserIdOrderByChangedAtDesc(UUID userId);}
