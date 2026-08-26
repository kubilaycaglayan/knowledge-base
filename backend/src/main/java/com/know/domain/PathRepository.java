package com.know.domain;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PathRepository extends JpaRepository<Path, UUID> {
  @Query(
      value =
          "select p.* from path p"
              + " left join time_entry t on t.path_id=p.id and t.user_id=:userId"
              + " where p.user_id=:userId"
              + " group by p.id"
              + " order by case when max(t.started_at) is null then 1 else 0 end,"
              + " coalesce(max(t.started_at), p.updated_at) desc",
      nativeQuery = true)
  List<Path> findAllByUserIdOrderByUpdatedAtDesc(@Param("userId") UUID userId, Pageable page);

  Optional<Path> findByIdAndUserId(UUID id, UUID userId);

  List<Path> findByUserIdAndIdIn(UUID userId, Collection<UUID> ids);

  List<Path> findByUserIdAndNameIgnoreCase(UUID userId, String name);

  List<Path> findAllByUserIdAndNameContainingIgnoreCase(UUID userId, String name, Pageable page);
}
