package com.know.domain;

import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.Pageable;

public interface BoardRepository extends JpaRepository<Board, UUID> {
  List<Board> findAllByUserIdOrderByUpdatedAtDesc(UUID userId);
  List<Board> findAllByUserIdOrderByUpdatedAtDesc(UUID userId, Pageable pageable);
  Optional<Board> findByIdAndUserId(UUID id, UUID userId);
  Optional<Board> findByPathId(UUID pathId);
  List<Board> findAllByPathIdIn(Collection<UUID> pathIds);
  List<Board> findAllByUserIdAndIdIn(UUID userId, Collection<UUID> ids);
}
