package com.know.security;

import java.util.Arrays;
import java.util.List;
import java.util.Optional;

/** The canonical server-side definition of OpenAI OAuth read scopes. */
public enum OpenAiScope {
  NOTES("kb:notes:read", "Notes", "notes"),
  LOGS("kb:logs:read", "Logs", "logs"),
  CALENDAR("kb:calendar:read", "Calendar days", "calendar"),
  SESSIONS("kb:sessions:read", "Tracked sessions", "sessions"),
  ACTIVITY("kb:activity:read", "Recent activity", "activity"),
  REPORTS("kb:reports:read", "Time reports", "reports"),
  PATHS("kb:paths:read", "Paths", "paths"),
  LABELS("kb:labels:read", "Labels", "labels"),
  BOARDS("kb:boards:read", "Boards and cards", "boards");

  private final String value;
  private final String label;
  private final String category;

  OpenAiScope(String value, String label, String category) {
    this.value = value;
    this.label = label;
    this.category = category;
  }

  public String value() { return value; }
  public String label() { return label; }
  public String category() { return category; }

  public static Optional<OpenAiScope> fromValue(String value) {
    return Arrays.stream(values()).filter(scope -> scope.value.equals(value)).findFirst();
  }

  public static List<String> valuesList() {
    return Arrays.stream(values()).map(OpenAiScope::value).toList();
  }
}
