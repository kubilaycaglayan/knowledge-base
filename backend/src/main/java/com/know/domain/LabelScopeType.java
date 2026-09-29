package com.know.domain;

import java.util.EnumSet;

public enum LabelScopeType {
  NOTE,
  CALENDAR,
  TIME_ENTRY,
  LOG,
  BOARD;

  /** New labels show everywhere except the Calendar unless the user picks otherwise. */
  public static EnumSet<LabelScopeType> defaults() {
    return EnumSet.complementOf(EnumSet.of(CALENDAR));
  }
}
