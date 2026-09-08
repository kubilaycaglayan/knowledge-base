package com.know.domain;

import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface NoteTagRepository extends JpaRepository<NoteTag, NoteTagId> {
  List<NoteTag> findAllByIdNoteId(UUID noteId);

  List<NoteTag> findAllByIdNoteIdIn(Collection<UUID> noteIds);

  void deleteAllByIdNoteId(UUID noteId);
  boolean existsByIdLabelId(UUID labelId);

  @Query("select l from Label l join NoteTag nt on nt.id.labelId=l.id where nt.id.noteId=:noteId")
  List<Label> findTags(UUID noteId);
}
