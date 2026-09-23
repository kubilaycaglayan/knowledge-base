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
  // Priority-sorted columns page by offset: Urgent, High, Medium, Low, then manual position.
  @Query(value = "select * from board_cards c where c.board_id = :boardId and c.status_id = :statusId and c.archived_at is null order by case c.priority when 'URGENT' then 0 when 'HIGH' then 1 when 'MEDIUM' then 2 else 3 end, c.position, c.id limit :limit offset :offset", nativeQuery = true)
  List<BoardCard> findPriorityPage(@Param("boardId") UUID boardId, @Param("statusId") UUID statusId, @Param("offset") int offset, @Param("limit") int limit);
  Optional<BoardCard> findByIdAndBoardId(UUID id, UUID boardId);
  @Query("select c from BoardCard c where c.boardId = :boardId and c.archivedAt is null and (c.startDate is not null or c.dueDate is not null) and coalesce(c.startDate, c.dueDate) <= :to and coalesce(c.dueDate, c.startDate) >= :from and not exists (select s.id from BoardStatus s where s.id = c.statusId and s.archivedAt is not null) order by coalesce(c.startDate, c.dueDate), c.position")
  List<BoardCard> findGanttCards(@Param("boardId") UUID boardId, @Param("from") LocalDate from, @Param("to") LocalDate to);
}
