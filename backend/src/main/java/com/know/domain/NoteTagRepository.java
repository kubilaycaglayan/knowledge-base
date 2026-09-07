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

  @Query("select t from Tag t join NoteTag nt on nt.id.tagId=t.id where nt.id.noteId=:noteId")
  List<Tag> findTags(UUID noteId);
}
