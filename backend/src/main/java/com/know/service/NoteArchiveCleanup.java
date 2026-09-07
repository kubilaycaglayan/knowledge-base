package com.know.service;

import com.know.domain.NoteRepository;
import java.time.Duration;
import java.time.Instant;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class NoteArchiveCleanup {
  private static final Duration RETENTION = Duration.ofDays(30);
  private final NoteRepository notes;

  public NoteArchiveCleanup(NoteRepository notes) {
    this.notes = notes;
  }

  @Scheduled(cron = "0 15 3 * * *", zone = "UTC")
  @Transactional
  public void purgeExpiredNotes() {
    notes.purgeArchivedBefore(Instant.now().minus(RETENTION));
  }
}
