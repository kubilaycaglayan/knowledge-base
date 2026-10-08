package com.know.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.know.domain.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** Log text rules and label ownership (docs/test-hardening-plan.md, TH-11). */
class LogServiceTest {
  private final LogRepository logs = mock(LogRepository.class);
  private final LogLabelRepository logLabels = mock(LogLabelRepository.class);
  private final LabelRepository labels = mock(LabelRepository.class);
  private final LogService service = new LogService(logs, logLabels, labels);
  private final UUID user = UUID.randomUUID();
  private final Instant at = Instant.parse("2026-09-01T09:00:00Z");

  LogServiceTest() {
    when(logs.save(any(Log.class))).thenAnswer(invocation -> invocation.getArgument(0));
  }

  private static HttpStatus status(Runnable action) {
    return HttpStatus.valueOf(
        assertThrows(ResponseStatusException.class, action::run).getStatusCode().value());
  }

  private Log stored() {
    Log log = new Log(user, "Stored", at);
    when(logs.findByIdAndUserId(log.getId(), user)).thenReturn(Optional.of(log));
    when(logs.findByIdAndUserIdForUpdate(log.getId(), user)).thenReturn(Optional.of(log));
    return log;
  }

  @Test
  void createTrimsTheBody() {
    assertEquals("Wrote tests", service.create(user, "  Wrote tests \n", at).body());
  }

  @Test
  void createRejectsBlankOversizedAndUndatedLogs() {
    assertEquals(HttpStatus.BAD_REQUEST, status(() -> service.create(user, null, at)));
    assertEquals(HttpStatus.BAD_REQUEST, status(() -> service.create(user, " \t\n", at)));
    assertEquals(HttpStatus.BAD_REQUEST, status(() -> service.create(user, "x".repeat(20001), at)));
    assertEquals(HttpStatus.BAD_REQUEST, status(() -> service.create(user, "Body", null)));
    assertEquals(20000, service.create(user, "x".repeat(20000), at).body().length());
    assertEquals(
        20000, service.create(user, " " + "x".repeat(20000) + " ", at).body().length(),
        "The limit applies after trimming");
    verify(logs, times(2)).save(any(Log.class));
  }

  @Test
  void unknownOrForeignLogsAreNotFound() {
    UUID id = UUID.randomUUID();
    when(logs.findByIdAndUserId(id, user)).thenReturn(Optional.empty());
    when(logs.findByIdAndUserIdForUpdate(id, user)).thenReturn(Optional.empty());
    assertEquals(HttpStatus.NOT_FOUND, status(() -> service.get(user, id)));
    assertEquals(HttpStatus.NOT_FOUND, status(() -> service.update(user, id, "Body", at, null)));
    assertEquals(HttpStatus.NOT_FOUND, status(() -> service.delete(user, id)));
    assertEquals(HttpStatus.NOT_FOUND, status(() -> service.setLabels(user, id, List.of())));
    verify(logs, never()).delete(any());
    verify(logLabels, never()).deleteAllByIdLogId(any());
  }

  @Test
  void staleVersionIsAConflictAndLeavesTheLogUnchanged() {
    Log log = stored();
    assertEquals(
        HttpStatus.CONFLICT,
        status(() -> service.update(user, log.getId(), "Changed", at, log.getVersion() + 1)));
    assertEquals("Stored", log.getBody());
    assertEquals("Changed", service.update(user, log.getId(), " Changed ", at, log.getVersion()).body());
    assertEquals("Again", service.update(user, log.getId(), "Again", at, null).body());
  }

  @Test
  void labelsMustBeOwnedLogScopedLabelsAndCollapseDuplicates() {
    Log log = stored();
    Label logLabel = new Label(user, "Work", null);
    when(labels.findAllByUserIdAndScope(user, LabelScopeType.LOG)).thenReturn(List.of(logLabel));

    assertEquals(
        HttpStatus.BAD_REQUEST,
        status(() -> service.setLabels(user, log.getId(), List.of(UUID.randomUUID()))));
    verify(logLabels, never()).deleteAllByIdLogId(any());

    service.setLabels(user, log.getId(), List.of(logLabel.getId(), logLabel.getId()));
    verify(logLabels).deleteAllByIdLogId(log.getId());
    verify(logLabels, times(1)).save(any(LogLabel.class));

    service.setLabels(user, log.getId(), null);
    verify(logLabels, times(2)).deleteAllByIdLogId(log.getId());
    verify(logLabels, times(1)).save(any(LogLabel.class));
  }
}
