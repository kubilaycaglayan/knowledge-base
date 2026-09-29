package com.know.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.know.domain.NoteRepository;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/** Archived notes are purged after 30 days (docs/test-hardening-plan.md, TH-13). */
class NoteArchiveCleanupTest {
  @Test
  void purgesNotesArchivedMoreThanThirtyDaysAgo() {
    NoteRepository notes = mock(NoteRepository.class);
    Instant before = Instant.now();
    new NoteArchiveCleanup(notes).purgeExpiredNotes();
    Instant after = Instant.now();

    ArgumentCaptor<Instant> cutoff = ArgumentCaptor.forClass(Instant.class);
    verify(notes).purgeArchivedBefore(cutoff.capture());
    Duration retention = Duration.ofDays(30);
    assertFalse(cutoff.getValue().isBefore(before.minus(retention)));
    assertFalse(cutoff.getValue().isAfter(after.minus(retention)));
  }
}
