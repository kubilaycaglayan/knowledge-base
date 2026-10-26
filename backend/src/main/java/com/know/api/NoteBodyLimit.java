package com.know.api;

import com.know.domain.LineAttribution;

/** Shared note body length policy for rich-text API requests. */
final class NoteBodyLimit {
  static final int MAX_CHARACTERS = 20_000;
  // Rich-text JSON includes document and mark metadata in addition to the user's text.
  static final int MAX_DOCUMENT_CHARACTERS = 1_000_000;

  private NoteBodyLimit() {}

  static boolean withinLimit(String content) {
    if (content == null) return true;
    String body = LineAttribution.plainText(content);
    return (body == null ? content : body).length() <= MAX_CHARACTERS;
  }
}
