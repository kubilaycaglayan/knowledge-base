package com.know.service;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.*;

import com.know.domain.Path;
import com.know.domain.PathRepository;
import com.know.domain.TimeEntryRepository;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class PathManagementServiceTest {
  private final PathRepository paths = mock(PathRepository.class);
  private final TimeEntryRepository timeEntries = mock(TimeEntryRepository.class);
  private final PathManagementService service = new PathManagementService(paths, timeEntries);

  @Test
  void mergeMovesOnlyOwnedSessionsThenSoftDeletesTheSource() {
    UUID user = UUID.randomUUID(), sourceId = UUID.randomUUID(), targetId = UUID.randomUUID();
    Path source = new Path(user, "Source", null);
    Path target = new Path(user, "Target", null);
    when(paths.findByIdAndUserId(sourceId, user)).thenReturn(Optional.of(source));
    when(paths.findByIdAndUserId(targetId, user)).thenReturn(Optional.of(target));

    service.merge(user, sourceId, targetId);

    verify(timeEntries).moveAllByUserIdAndPathId(user, sourceId, targetId);
    verify(paths).save(source);
  }

  @Test
  void mergeRejectsAPathAsItsOwnTargetBeforeChangingAnything() {
    UUID user = UUID.randomUUID(), path = UUID.randomUUID();

    assertThrows(ResponseStatusException.class, () -> service.merge(user, path, path));

    verifyNoInteractions(paths, timeEntries);
  }

  @Test
  void mergeRejectsAnUnownedTargetWithoutMovingOrDeletingTheSource() {
    UUID user = UUID.randomUUID(), sourceId = UUID.randomUUID(), targetId = UUID.randomUUID();
    when(paths.findByIdAndUserId(sourceId, user)).thenReturn(Optional.of(new Path(user, "Source", null)));
    when(paths.findByIdAndUserId(targetId, user)).thenReturn(Optional.empty());

    assertThrows(ResponseStatusException.class, () -> service.merge(user, sourceId, targetId));

    verifyNoInteractions(timeEntries);
    verify(paths, never()).save(any());
  }
}
