package com.know.service;

import java.time.Instant;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.know.domain.Activity;
import com.know.domain.ActivityRepository;
import com.know.domain.ActivityType;
import com.know.domain.ImportBatch;
import com.know.domain.ImportBatchRepository;
import com.know.domain.Path;
import com.know.domain.PathRepository;
import com.know.domain.TimeEntry;
import com.know.domain.TimeEntryRepository;
import com.know.domain.TimeSource;

@Service
public class ClockifyImportService {
  private final PathRepository paths;
  private final TimeEntryRepository entries;
  private final ActivityRepository activities;
  private final ImportBatchRepository batches;

  public ClockifyImportService(
      PathRepository paths,
      TimeEntryRepository entries,
      ActivityRepository activities,
      ImportBatchRepository batches) {
    this.paths = paths;
    this.entries = entries;
    this.activities = activities;
    this.batches = batches;
  }

  public record ClockifyImportRequest(List<ClockifyEntry> timeentries) {}

  public record ClockifyEntry(
      @JsonProperty("_id") String id,
      String description,
      ClockifyInterval timeInterval,
      String projectName) {}

  public record ClockifyInterval(Instant start, Instant end, Long duration) {}

  public record ImportSummary(UUID batchId, int imported, int skipped, int createdPaths) {}

  public record ImportBatchView(
      UUID id,
      TimeSource source,
      int imported,
      int skipped,
      int createdPaths,
      Instant createdAt,
      Instant undoneAt) {
    static ImportBatchView of(ImportBatch batch) {
      return new ImportBatchView(
          batch.getId(),
          batch.getSource(),
          batch.getImportedCount(),
          batch.getSkippedCount(),
          batch.getCreatedPathsCount(),
          batch.getCreatedAt(),
          batch.getUndoneAt());
    }
  }

  public record UndoSummary(UUID batchId, long deletedEntries, long deletedActivities) {}

  @Transactional
  public ImportSummary importEntries(UUID userId, ClockifyImportRequest request) {
    if (request == null || request.timeentries() == null || request.timeentries().size() > 2000) {
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST, "Clockify import must contain at most 2000 time entries");
    }
    Map<String, Path> pathCache = new HashMap<>();
    int imported = 0, skipped = 0;
    Set<String> createdPathKeys = new HashSet<>();
    ImportBatch batch = batches.save(new ImportBatch(userId, TimeSource.IMPORT));
    for (ClockifyEntry source : request.timeentries()) {
      if (source == null
          || source.timeInterval() == null
          || source.timeInterval().start() == null) {
        throw new ResponseStatusException(
            HttpStatus.BAD_REQUEST, "Each Clockify entry needs a start time");
      }
      Instant start = source.timeInterval().start();
      Instant end = source.timeInterval().end();
      if (end == null
          && source.timeInterval().duration() != null
          && source.timeInterval().duration() >= 0) {
        end = start.plusSeconds(source.timeInterval().duration());
      }
      if (end == null || end.isBefore(start)) {
        throw new ResponseStatusException(
            HttpStatus.BAD_REQUEST, "Each Clockify entry needs a valid time interval");
      }
      String externalId = normalize(source.id());
      if (externalId != null
          && entries
              .findByUserIdAndSourceAndExternalId(userId, TimeSource.IMPORT, externalId)
              .isPresent()) {
        skipped++;
        continue;
      }
      Path path =
          resolvePath(userId, source.projectName(), pathCache, createdPathKeys, batch.getId());
      String description = source.description() == null ? null : source.description().trim();
      if (description != null && description.length() > 500)
        description = description.substring(0, 500);
      TimeEntry entry =
          new TimeEntry(
              userId,
              path == null ? null : path.getId(),
              null,
              start,
              description,
              TimeSource.IMPORT,
              externalId);
      entry.assignImportBatch(batch.getId());
      entry.stop(end);
      entries.save(entry);
      imported++;
    }
    batch.complete(imported, skipped, createdPathKeys.size());
    batches.save(batch);
    return new ImportSummary(batch.getId(), imported, skipped, createdPathKeys.size());
  }

  public List<ImportBatchView> listBatches(UUID userId) {
    return batches.findAllByUserIdOrderByCreatedAtDesc(userId, PageRequest.of(0, 100)).stream()
        .map(ImportBatchView::of)
        .toList();
  }

  @Transactional
  public UndoSummary undoBatch(UUID userId, UUID batchId) {
    ImportBatch batch =
        batches
            .findByIdAndUserId(batchId, userId)
            .orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Import batch not found"));
    if (batch.getUndoneAt() != null) {
      return new UndoSummary(batch.getId(), 0, 0);
    }
    long deletedActivities = activities.deleteByUserIdAndImportBatchId(userId, batch.getId());
    long deletedEntries = entries.deleteByUserIdAndImportBatchId(userId, batch.getId());
    batch.undo();
    batches.save(batch);
    return new UndoSummary(batch.getId(), deletedEntries, deletedActivities);
  }

  private Path resolvePath(
      UUID userId,
      String rawName,
      Map<String, Path> cache,
      Set<String> createdPathKeys,
      UUID batchId) {
    String name = normalize(rawName);
    if (name == null) return null;
    String key = cacheKey(name);
    if (cache.containsKey(key)) return cache.get(key);
    Path path = paths.findByUserIdAndNameIgnoreCase(userId, name).stream().findFirst().orElse(null);
    if (path == null) {
      if (name.length() > 160)
        throw new ResponseStatusException(
            HttpStatus.BAD_REQUEST, "Clockify project name is too long");
      path = paths.save(new Path(userId, name, "Imported from Clockify"));
      path.assignImportBatch(batchId);
      path = paths.save(path);
      createdPathKeys.add(key);
    }
    cache.put(key, path);
    return path;
  }

  private static String normalize(String value) {
    if (value == null || value.trim().isBlank()) return null;
    return value.trim();
  }

  private static String cacheKey(String value) {
    return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
  }
}
