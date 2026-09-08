package com.know.service;

import com.know.domain.Activity;
import com.know.domain.ActivityRepository;
import com.know.domain.ActivityType;
import com.know.domain.Note;
import com.know.domain.NoteRepository;
import com.know.domain.NoteTag;
import com.know.domain.NoteTagId;
import com.know.domain.NoteTagRepository;
import com.know.domain.Path;
import com.know.domain.PathRepository;
import com.know.domain.Tag;
import com.know.domain.TagRepository;
import com.know.domain.TimeEntry;
import com.know.domain.TimeEntryRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.Comparator;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class KnowledgeService {
  private final PathRepository paths;
  private final TagRepository tags;
  private final ActivityRepository activityRepository;
  private final NoteRepository notes;
  private final NoteTagRepository noteTags;
  private final TimeEntryRepository timeEntries;

  public KnowledgeService(
      PathRepository paths,
      TagRepository tags,
      ActivityRepository activityRepository,
      NoteRepository notes,
      TimeEntryRepository timeEntries,
      NoteTagRepository noteTags) {
    this.paths = paths;
    this.tags = tags;
    this.activityRepository = activityRepository;
    this.notes = notes;
    this.noteTags = noteTags;
    this.timeEntries = timeEntries;
  }

  public record NoteView(
      UUID id,
      UUID pathId,
      UUID activityId,
      UUID timeEntryId,
      String title,
      String content,
      Instant createdAt,
      Instant updatedAt,
      Instant deletedAt,
      long version,
      String contentText,
      List<String> tags) {}

  public record NotePage(
      List<NoteView> items, int page, int size, long totalItems, int totalPages) {}

  public record TagView(UUID id, String name) {}


  @Transactional
  public NoteView createNote(
      UUID userId, UUID pathId, UUID activityId, String title, String content) {
    return createNote(userId, pathId, activityId, null, title, content, null, null);
  }

  @Transactional
  public NoteView createNote(
      UUID userId, UUID pathId, UUID activityId, UUID timeEntryId,
      String title, String content) {
    return createNote(userId, pathId, activityId, timeEntryId, title, content, null, null);
  }

  @Transactional
  public NoteView createNote(
      UUID userId, UUID pathId, UUID activityId, UUID timeEntryId,
      String title, String content, String contentText, List<String> tagNames) {
    int targets =
        (pathId != null ? 1 : 0)
            + (activityId != null ? 1 : 0)
            + (timeEntryId != null ? 1 : 0);
    if (targets > 1) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A note can have only one target");
    }
    if (pathId != null) {
      paths
          .findByIdAndUserId(pathId, userId)
          .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Path not found"));
    }
    if (activityId != null) {
      activityRepository
          .findByIdAndUserId(activityId, userId)
          .orElseThrow(
              () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Activity not found"));
    }
    if (timeEntryId != null && timeEntries != null) {
      timeEntries
          .findByIdAndUserId(timeEntryId, userId)
          .orElseThrow(
              () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Time entry not found"));
    }
    Note n = notes.save(new Note(userId, pathId, activityId, timeEntryId, title, content));
    if (contentText != null) {
      n.update(title, content, contentText);
      n = notes.save(n);
    }
    replaceTags(userId, n, tagNames);
    activityRepository.save(
        new Activity(userId, pathId, ActivityType.NOTE_CREATED, "Added note: " + title, null));
    return noteView(n);
  }

  public List<NoteView> listNotes(UUID userId) {
    return notes.findAllActiveByUserIdOrderByUpdatedAtDesc(userId, PageRequest.of(0, 100)).stream()
        .map(this::noteView)
        .toList();
  }

  public NotePage pageNotes(UUID userId, int page, int size, String query) {
    return pageNotes(userId, page, size, query, false);
  }

  public NotePage pageNotes(UUID userId, int page, int size, String query, boolean archived) {
    int safeSize = Math.min(Math.max(size, 1), 100);
    int safePage = Math.max(page, 0);
    PageRequest request = PageRequest.of(safePage, safeSize);
    Page<Note> result = query == null || query.isBlank()
        ? (archived ? notes.findArchivedByUserId(userId, request)
            : notes.findAllActiveByUserIdOrderByUpdatedAtDescIdDesc(userId, request))
        : (archived ? notes.findArchivedByUserIdAndQuery(userId, query.trim(), request)
            : notes.findActiveByUserIdAndQuery(userId, query.trim(), request));
    return new NotePage(result.getContent().stream().map(this::noteView).toList(), result.getNumber(),
        result.getSize(), result.getTotalElements(), result.getTotalPages());
  }

  public List<TagView> noteTags(UUID userId) {
    return tags.findAllByUserIdOrderByName(userId).stream()
        .map(tag -> new TagView(tag.getId(), tag.getName())).toList();
  }

  public NoteView getNote(UUID userId, UUID id) {
    return noteView(notes.findByIdAndUserId(id, userId)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Note not found")));
  }

  @Transactional
  public void archiveNote(UUID userId, UUID id) {
    Note note = notes.findActiveByIdAndUserId(id, userId)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Note not found"));
    note.delete();
    notes.save(note);
  }

  @Transactional
  public void restoreNote(UUID userId, UUID id) {
    Note note = notes.findByIdAndUserIdIncludingArchived(id, userId)
        .filter(value -> value.getDeletedAt() != null)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Archived note not found"));
    note.restore();
    notes.save(note);
  }

  @Transactional
  public NoteView updateNote(UUID userId, UUID id, String title, String content) {
    return updateNote(userId, id, title, content, null, null, null);
  }

  @Transactional
  public NoteView updateNote(
      UUID userId, UUID id, String title, String content, String contentText,
      List<String> tagNames, Long expectedVersion) {
    Note note =
        notes
            .findByIdAndUserId(id, userId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Note not found"));
    if (expectedVersion != null && note.getVersion() != expectedVersion) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "Note changed in another window");
    }
    if (contentText == null) note.update(title, content); else note.update(title, content, contentText);
    Note saved = notes.save(note);
    if (tagNames != null) replaceTags(userId, saved, tagNames);
    return noteView(saved);
  }

  private NoteView noteView(Note n) {
    return new NoteView(
        n.getId(),
        n.getPathId(),
        n.getActivityId(),
        n.getTimeEntryId(),
        n.getTitle(),
        n.getContent(),
        n.getCreatedAt(),
        n.getUpdatedAt(),
        n.getDeletedAt(),
        n.getVersion(),
        n.getContentText(),
        noteTags == null ? List.of() : noteTags.findTags(n.getId()).stream()
            .map(Tag::getName).sorted().toList());
  }

  private void replaceTags(UUID userId, Note note, List<String> rawNames) {
    if (noteTags == null || rawNames == null) return;
    noteTags.deleteAllByIdNoteId(note.getId());
    Set<String> names = new java.util.TreeSet<>(String.CASE_INSENSITIVE_ORDER);
    rawNames.stream().filter(java.util.Objects::nonNull).map(String::trim)
        .filter(value -> !value.isBlank()).forEach(names::add);
    for (String name : names) {
      Tag tag = tags.findByUserIdAndNameIgnoreCase(userId, name)
          .orElseGet(() -> tags.save(new Tag(userId, name)));
      noteTags.save(new NoteTag(new NoteTagId(note.getId(), tag.getId())));
    }
  }

  public List<Activity> activities(UUID userId) {
    return timeline(userId, null, null, null, null);
  }

  public List<Activity> filteredActivities(
      UUID userId, Instant from, Instant to, UUID pathId, ActivityType type) {
    return timeline(userId, from, to, pathId, type);
  }

  private List<Activity> timeline(
      UUID userId, Instant from, Instant to, UUID pathId, ActivityType type) {
    List<Activity> result = new ArrayList<>(
        activityRepository.findTop100ByUserIdOrderByOccurredAtDesc(userId));
    result.removeIf(
        activity ->
            activity.getType() == ActivityType.TIMER_STARTED
                || activity.getType() == ActivityType.TIMER_STOPPED
                || activity.getType() == ActivityType.TIME_TRACKED);
    if (timeEntries != null) {
      timeEntries
          .findAllByUserIdOrderByStartedAtDesc(userId, PageRequest.of(0, 100))
          .stream()
          .map(this::sessionActivity)
          .forEach(result::add);
    }
    return result.stream()
        .filter(activity -> from == null || !activity.getOccurredAt().isBefore(from))
        .filter(activity -> to == null || !activity.getOccurredAt().isAfter(to))
        .filter(activity -> pathId == null || pathId.equals(activity.getPathId()))
        .filter(activity -> type == null || type == activity.getType())
        .sorted(Comparator.comparing(Activity::getOccurredAt).reversed())
        .limit(100)
        .toList();
  }

  private Activity sessionActivity(TimeEntry entry) {
    long seconds = entry.getDurationSeconds() == null
        ? Math.max(0, java.time.Duration.between(entry.getStartedAt(), Instant.now()).toSeconds())
        : entry.getDurationSeconds();
    return Activity.session(
        entry.getUserId(), entry.getPathId(), entry.getId(),
        "Tracked " + seconds + " seconds", entry.getDescription(),
        entry.getEndedAt() == null ? entry.getStartedAt() : entry.getEndedAt());
  }

}
