package com.know.domain;
import org.springframework.data.domain.Pageable;import org.springframework.data.jpa.repository.*;import org.springframework.data.repository.query.Param;import java.time.Instant;import java.util.*;
public interface ActivityRepository extends JpaRepository<Activity,UUID>{
 List<Activity> findTop100ByUserIdOrderByOccurredAtDesc(UUID userId);
 List<Activity> findTop50ByUserIdAndPathIdOrderByOccurredAtDesc(UUID userId,UUID pathId);
 List<Activity> findTop50ByUserIdAndItemIdInOrderByOccurredAtDesc(UUID userId,Collection<UUID> itemIds);
 @Query("select a from Activity a where a.userId=:userId and a.itemId in :itemIds and (a.pathId is null or a.pathId=:pathId) order by a.occurredAt desc") List<Activity> findRecentForPathAndItems(@Param("userId") UUID userId,@Param("pathId") UUID pathId,@Param("itemIds") Collection<UUID> itemIds,Pageable page);
 @Query(value="select * from activity where user_id=:userId and (cast(:from as timestamptz) is null or occurred_at>=cast(:from as timestamptz)) and (cast(:to as timestamptz) is null or occurred_at<=cast(:to as timestamptz)) and (cast(:pathId as uuid) is null or path_id=cast(:pathId as uuid)) and (cast(:itemId as uuid) is null or item_id=cast(:itemId as uuid)) and (cast(:type as varchar) is null or type=cast(:type as varchar)) order by occurred_at desc",nativeQuery=true)
 List<Activity> findFiltered(@Param("userId") UUID userId,@Param("from") Instant from,@Param("to") Instant to,@Param("pathId") UUID pathId,@Param("itemId") UUID itemId,@Param("type") ActivityType type,Pageable page);
 @Query("select a from Activity a where a.userId=:userId and (lower(a.title) like lower(concat('%',:query,'%')) or lower(coalesce(a.detail,'')) like lower(concat('%',:query,'%'))) order by a.occurredAt desc")
 List<Activity> search(@Param("userId") UUID userId,@Param("query") String query,Pageable page);
 Optional<Activity> findByIdAndUserId(UUID id,UUID userId);
}
