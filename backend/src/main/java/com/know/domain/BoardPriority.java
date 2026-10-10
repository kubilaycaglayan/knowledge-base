package com.know.domain;

import com.fasterxml.jackson.annotation.JsonCreator;

public enum BoardPriority {
  LOW,
  MEDIUM,
  HIGH,
  URGENT;

  @JsonCreator
  public static BoardPriority fromJson(String value) {
    try {
      return value == null ? null : valueOf(value);
    } catch (IllegalArgumentException exception) {
      throw new IllegalArgumentException("Unknown board priority: " + value, exception);
    }
  }
}
