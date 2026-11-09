package com.know.api;

import static org.junit.jupiter.api.Assertions.*;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.Test;

class McpTokenControllerTest {
  @Test
  void threeHourExpiryEndsExactlyThreeHoursAfterCreation() {
    Instant createdAt = Instant.parse("2026-11-09T10:15:30Z");

    assertEquals(createdAt.plus(3, ChronoUnit.HOURS), McpTokenController.expiryAt("three_hours", createdAt));
  }

  @Test
  void rejectsUnknownExpiryChoices() {
    assertThrows(IllegalArgumentException.class, () -> McpTokenController.expiryAt("three_days", Instant.now()));
  }
}
