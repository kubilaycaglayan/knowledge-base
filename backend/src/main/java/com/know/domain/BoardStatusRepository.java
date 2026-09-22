package com.know.domain;

import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BoardStatusRepository extends JpaRepository<BoardStatus, UUID> {
  List<BoardStatus> findAllByBoardIdOrderByPosition(UUID boardId);
  Optional<BoardStatus> findByIdAndBoardId(UUID id, UUID boardId);
}
