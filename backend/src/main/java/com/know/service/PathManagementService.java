package com.know.service;

import com.know.domain.Path;
import com.know.domain.PathRepository;
import com.know.domain.TimeEntryRepository;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/** Applies ownership-checked changes that affect a path and its sessions together. */
@Service
public class PathManagementService {
  private final PathRepository paths;
  private final TimeEntryRepository timeEntries;

  public PathManagementService(PathRepository paths, TimeEntryRepository timeEntries) {
    this.paths = paths;
    this.timeEntries = timeEntries;
  }

  @Transactional
  public void merge(UUID userId, UUID sourcePathId, UUID targetPathId) {
    if (sourcePathId.equals(targetPathId))
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a different target path");

    Path source = findOwned(userId, sourcePathId);
    findOwned(userId, targetPathId);
    timeEntries.moveAllByUserIdAndPathId(userId, sourcePathId, targetPathId);
    source.delete();
    paths.save(source);
  }

  private Path findOwned(UUID userId, UUID pathId) {
    return paths
        .findByIdAndUserId(pathId, userId)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Path not found"));
  }
}
