package com.know.domain;

import java.time.LocalDate;
import java.util.*;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface BoardCardRepository extends JpaRepository<BoardCard, UUID> {
  List<BoardCard> findAllByBoardIdAndArchivedAtIsNullOrderByStatusIdAscPositionAsc(UUID boardId);
  List<BoardCard> findAllByBoardIdAndStatusIdAndArchivedAtIsNullOrderByPositionAsc(UUID boardId, UUID statusId);
  List<BoardCard> findAllByBoardIdAndStatusIdAndArchivedAtIsNullAndPositionGreaterThanOrderByPositionAsc(UUID boardId, UUID statusId, int position, Pageable pageable);
  List<BoardCard> findAllByBoardIdAndArchivedAtNotNullOrderByUpdatedAtDesc(UUID boardId);
  Optional<BoardCard> findByIdAndBoardId(UUID id, UUID boardId);
  @Query("select c from BoardCard c where c.boardId = :boardId and c.archivedAt is null and (c.startDate is not null or c.dueDate is not null) and coalesce(c.startDate, c.dueDate) <= :to and coalesce(c.dueDate, c.startDate) >= :from order by coalesce(c.startDate, c.dueDate), c.position")
  List<BoardCard> findGanttCards(@Param("boardId") UUID boardId, @Param("from") LocalDate from, @Param("to") LocalDate to);
}
