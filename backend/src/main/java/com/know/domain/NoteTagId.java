package com.know.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;

@Embeddable
public class NoteTagId implements Serializable {
  @Column(name = "note_id") private UUID noteId;
  @Column(name = "label_id") private UUID labelId;

  protected NoteTagId() {}

  public NoteTagId(UUID noteId, UUID labelId) {
    this.noteId = noteId;
    this.labelId = labelId;
  }

  public UUID getNoteId() { return noteId; }
  public UUID getLabelId() { return labelId; }

  @Override public boolean equals(Object other) {
    return other instanceof NoteTagId value
        && Objects.equals(noteId, value.noteId)
        && Objects.equals(labelId, value.labelId);
  }

  @Override public int hashCode() { return Objects.hash(noteId, labelId); }
}
