package com.know.domain;

import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

@Entity
@Table(name = "note_tag")
public class NoteTag {
  @EmbeddedId private NoteTagId id;

  protected NoteTag() {}

  public NoteTag(NoteTagId id) { this.id = id; }

  public NoteTagId getId() { return id; }
}
