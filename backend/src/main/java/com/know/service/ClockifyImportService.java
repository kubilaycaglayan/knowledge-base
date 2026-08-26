package com.know.service;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.know.domain.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.*;

@Service
public class ClockifyImportService {
    private final PathRepository paths;
    private final TimeEntryRepository entries;
    private final ActivityRepository activities;

    public ClockifyImportService(PathRepository paths, TimeEntryRepository entries, ActivityRepository activities) {
        this.paths = paths; this.entries = entries; this.activities = activities;
    }

    public record ClockifyImportRequest(List<ClockifyEntry> timeentries) {}
    public record ClockifyEntry(@JsonProperty("_id") String id, String description, ClockifyInterval timeInterval, String projectName) {}
    public record ClockifyInterval(Instant start, Instant end, Long duration) {}
    public record ImportSummary(int imported, int skipped, int createdPaths) {}

    @Transactional
    public ImportSummary importEntries(UUID userId, ClockifyImportRequest request) {
        if (request == null || request.timeentries() == null || request.timeentries().size() > 2000) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Clockify import must contain at most 2000 time entries");
        }
        Map<String, Path> pathCache = new HashMap<>();
        int imported = 0, skipped = 0;
        Set<String> createdPathKeys = new HashSet<>();
        for (ClockifyEntry source : request.timeentries()) {
            if (source == null || source.timeInterval() == null || source.timeInterval().start() == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Each Clockify entry needs a start time");
            }
            Instant start = source.timeInterval().start();
            Instant end = source.timeInterval().end();
            if (end == null && source.timeInterval().duration() != null && source.timeInterval().duration() >= 0) {
                end = start.plusSeconds(source.timeInterval().duration());
            }
            if (end == null || end.isBefore(start)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Each Clockify entry needs a valid time interval");
            }
            String externalId = normalize(source.id());
            if (externalId != null && entries.findByUserIdAndSourceAndExternalId(userId, TimeSource.IMPORT, externalId).isPresent()) {
                skipped++; continue;
            }
            Path path = resolvePath(userId, source.projectName(), pathCache, createdPathKeys);
            String description = source.description() == null ? null : source.description().trim();
            if (description != null && description.length() > 500) description = description.substring(0, 500);
            TimeEntry entry = new TimeEntry(userId, path == null ? null : path.getId(), null, start, description, TimeSource.IMPORT, externalId);
            entry.stop(end);
            entries.save(entry);
            String activityDetail = "Session: " + start + " – " + end;
            if (description != null && !description.isBlank()) activityDetail = description + " · " + activityDetail;
            activities.save(new Activity(userId, path == null ? null : path.getId(), null, ActivityType.TIME_TRACKED, "Imported Clockify session", activityDetail, start));
            imported++;
        }
        return new ImportSummary(imported, skipped, createdPathKeys.size());
    }

    private Path resolvePath(UUID userId, String rawName, Map<String, Path> cache, Set<String> createdPathKeys) {
        String name = normalize(rawName);
        if (name == null) return null;
        String key = cacheKey(name);
        if (cache.containsKey(key)) return cache.get(key);
        Path path = paths.findByUserIdAndNameIgnoreCase(userId, name).stream().findFirst().orElse(null);
        if (path == null) {
            if (name.length() > 160) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Clockify project name is too long");
            path = paths.save(new Path(userId, name, "Imported from Clockify"));
            createdPathKeys.add(key);
        }
        cache.put(key, path);
        return path;
    }

    private static String normalize(String value) { if (value == null || value.trim().isBlank()) return null; return value.trim(); }
    private static String cacheKey(String value) { return value == null ? "" : value.trim().toLowerCase(Locale.ROOT); }
}
