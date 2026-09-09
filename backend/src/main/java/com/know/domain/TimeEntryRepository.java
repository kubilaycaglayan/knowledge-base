package com.know.domain;

import java.time.Instant;
import java.util.*;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

public interface TimeEntryRepository extends JpaRepository<TimeEntry, UUID> {
  List<TimeEntry> findAllByUserId(UUID userId);
  @Query(
      "select t from TimeEntry t where t.userId=:userId and t.startedAt < :to and (t.endedAt is"
          + " null or t.endedAt > :from) order by t.startedAt desc")
  List<TimeEntry> findOverlappingByUserId(
      @Param("userId") UUID userId, @Param("from") Instant from, @Param("to") Instant to);

  Optional<TimeEntry> findByUserIdAndEndedAtIsNull(UUID userId);

  Optional<TimeEntry> findByIdAndUserId(UUID id, UUID userId);

  Optional<TimeEntry> findByUserIdAndSourceAndExternalId(
      UUID userId, TimeSource source, String externalId);

  @Query(
      value =
          "select exists(select 1 from time_entry"
              + " where user_id=:userId and source=:source and external_id=:externalId)",
      nativeQuery = true)
  boolean existsImportIdentityIncludingDeleted(
      @Param("userId") UUID userId,
      @Param("source") String source,
      @Param("externalId") String externalId);

  @Query(
      "select t from TimeEntry t where t.userId=:userId"
          + " order by t.endedAt desc nulls last, t.startedAt desc")
  List<TimeEntry> findAllByUserIdOrderByCompletionTimeDesc(
      @Param("userId") UUID userId, Pageable page);

  List<TimeEntry> findAllByUserIdOrderByStartedAtDesc(UUID userId, Pageable page);

  long countByUserId(UUID userId);

  List<TimeEntry> findAllByUserIdAndPathIdOrderByStartedAtDesc(UUID userId, UUID pathId);

  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query(
      "update TimeEntry t set t.pathId = :targetPathId"
          + " where t.userId = :userId and t.pathId = :sourcePathId")
  int moveAllByUserIdAndPathId(
      @Param("userId") UUID userId,
      @Param("sourcePathId") UUID sourcePathId,
      @Param("targetPathId") UUID targetPathId);

  long deleteByUserIdAndImportBatchId(UUID userId, UUID importBatchId);
}
