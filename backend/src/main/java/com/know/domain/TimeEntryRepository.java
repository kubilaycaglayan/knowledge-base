package com.know.domain;

import java.time.Instant;
import java.util.*;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

public interface TimeEntryRepository extends JpaRepository<TimeEntry, UUID> {
  @Query(
      "select distinct t from TimeEntry t join TimeEntryItem ti on ti.id.timeEntryId=t.id"
          + " where t.userId=:userId and ti.id.itemId in :itemIds and (t.pathId is null"
          + " or t.pathId=:pathId) order by t.startedAt desc")
  List<TimeEntry> findRecentForPathAndItems(
      @Param("userId") UUID userId,
      @Param("pathId") UUID pathId,
      @Param("itemIds") Collection<UUID> itemIds,
      Pageable page);

  @Query(
      "select t from TimeEntry t where t.userId=:userId and t.startedAt < :to and (t.endedAt is"
          + " null or t.endedAt > :from) order by t.startedAt desc")
  List<TimeEntry> findOverlappingByUserId(
      @Param("userId") UUID userId, @Param("from") Instant from, @Param("to") Instant to);

  Optional<TimeEntry> findByUserIdAndEndedAtIsNull(UUID userId);

  Optional<TimeEntry> findByIdAndUserId(UUID id, UUID userId);

  Optional<TimeEntry> findByUserIdAndSourceAndExternalId(
      UUID userId, TimeSource source, String externalId);

  List<TimeEntry> findAllByUserIdOrderByStartedAtDesc(UUID userId, Pageable page);

  long countByUserId(UUID userId);

  List<TimeEntry> findAllByUserIdAndPathIdOrderByStartedAtDesc(UUID userId, UUID pathId);

  long deleteByUserIdAndImportBatchId(UUID userId, UUID importBatchId);
}
