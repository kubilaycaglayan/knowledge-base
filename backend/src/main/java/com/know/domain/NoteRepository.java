package com.know.domain;

import java.util.*;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface NoteRepository extends JpaRepository<Note, UUID> {
  @Query("select n from Note n where n.userId = :userId and n.deletedAt is null")
  List<Note> findAllActiveByUserId(@Param("userId") UUID userId);
  @Query("select n from Note n where n.userId = :userId and n.deletedAt is null order by n.updatedAt desc")
  List<Note> findAllActiveByUserIdOrderByUpdatedAtDesc(@Param("userId") UUID userId, Pageable page);

  @Query("select n from Note n where n.userId = :userId and n.deletedAt is null order by n.updatedAt desc, n.id desc")
  Page<Note> findAllActiveByUserIdOrderByUpdatedAtDescIdDesc(@Param("userId") UUID userId, Pageable page);

  @Query("select n from Note n where n.id = :id and n.userId = :userId and n.deletedAt is null")
  Optional<Note> findActiveByIdAndUserId(@Param("id") UUID id, @Param("userId") UUID userId);

  @Query("select n from Note n where n.id = :id and n.userId = :userId and n.deletedAt is null")
  Optional<Note> findByIdAndUserId(UUID id, UUID userId);

  @Query("select n from Note n where n.userId = :userId and n.deletedAt is null and "
      + "(lower(n.title) like lower(concat('%', :title, '%')) or (n.userId = :sameUserId and lower(n.content) like lower(concat('%', :content, '%')))) "
      + "order by n.updatedAt desc")
  List<Note> findAllByUserIdAndTitleContainingIgnoreCaseOrUserIdAndContentContainingIgnoreCase(
      @Param("userId") UUID userId, @Param("title") String title,
      @Param("sameUserId") UUID sameUserId, @Param("content") String content, Pageable page);

  @Query("select n from Note n where n.userId = :userId and n.deletedAt is null and "
      + "(lower(n.title) like lower(concat('%', :query, '%')) or lower(n.contentText) like lower(concat('%', :query, '%')) "
      + "or exists (select 1 from NoteTag nt join Label t on t.id = nt.id.labelId "
      + "where nt.id.noteId = n.id and lower(t.name) like lower(concat('%', :query, '%')))) "
      + "order by n.updatedAt desc, n.id desc")
  Page<Note> findActiveByUserIdAndQuery(@Param("userId") UUID userId, @Param("query") String query, Pageable page);

  @Query("select n from Note n where n.userId = :userId and n.deletedAt is not null order by n.deletedAt desc, n.id desc")
  Page<Note> findArchivedByUserId(@Param("userId") UUID userId, Pageable page);

  @Query("select n from Note n where n.userId = :userId and n.deletedAt is not null and "
      + "(lower(n.title) like lower(concat('%', :query, '%')) or lower(n.contentText) like lower(concat('%', :query, '%')) "
      + "or exists (select 1 from NoteTag nt join Label t on t.id = nt.id.labelId "
      + "where nt.id.noteId = n.id and lower(t.name) like lower(concat('%', :query, '%')))) "
      + "order by n.deletedAt desc, n.id desc")
  Page<Note> findArchivedByUserIdAndQuery(@Param("userId") UUID userId, @Param("query") String query, Pageable page);

  @Query("select n from Note n where n.id = :id and n.userId = :userId")
  Optional<Note> findByIdAndUserIdIncludingArchived(@Param("id") UUID id, @Param("userId") UUID userId);

  @Modifying
  @Query("delete from Note n where n.deletedAt is not null and n.deletedAt < :cutoff")
  int purgeArchivedBefore(@Param("cutoff") java.time.Instant cutoff);
}
