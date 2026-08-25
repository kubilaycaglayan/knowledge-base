package com.know.domain;
import org.springframework.data.domain.Pageable;import org.springframework.data.jpa.repository.JpaRepository;import java.util.*;
public interface NoteRepository extends JpaRepository<Note,UUID>{List<Note> findAllByUserIdOrderByUpdatedAtDesc(UUID userId);Optional<Note> findByIdAndUserId(UUID id,UUID userId);List<Note> findAllByUserIdAndTitleContainingIgnoreCaseOrUserIdAndContentContainingIgnoreCase(UUID userId,String title,UUID sameUserId,String content,Pageable page);}
