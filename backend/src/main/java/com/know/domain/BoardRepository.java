package com.know.domain;

import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BoardRepository extends JpaRepository<Board, UUID> {
  List<Board> findAllByUserIdOrderByUpdatedAtDesc(UUID userId);
  Optional<Board> findByIdAndUserId(UUID id, UUID userId);
}
