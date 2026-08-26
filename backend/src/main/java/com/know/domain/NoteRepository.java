package com.know.domain;

import java.util.*;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface NoteRepository extends JpaRepository<Note, UUID> {
  List<Note> findAllByUserIdOrderByUpdatedAtDesc(UUID userId, Pageable page);

  Optional<Note> findByIdAndUserId(UUID id, UUID userId);

  List<Note> findAllByUserIdAndTitleContainingIgnoreCaseOrUserIdAndContentContainingIgnoreCase(
      UUID userId, String title, UUID sameUserId, String content, Pageable page);
}
