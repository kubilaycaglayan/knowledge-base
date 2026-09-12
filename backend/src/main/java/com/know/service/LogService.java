package com.know.service;

import com.know.domain.*;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class LogService {
  private final LogRepository logs;
  private final LogLabelRepository logLabels;
  private final LabelRepository labels;

  public LogService(LogRepository logs, LogLabelRepository logLabels, LabelRepository labels) {
    this.logs = logs; this.logLabels = logLabels; this.labels = labels;
  }

  public record LogView(UUID id, String body, Instant occurredAt, List<UUID> labelIds, Instant createdAt, Instant updatedAt, long version) {}

  public List<LogView> list(UUID userId) {
    return logs.findAllByUserIdOrderByOccurredAtDescIdDesc(userId).stream().map(this::view).toList();
  }

  public LogView get(UUID userId, UUID id) {
    return logs.findByIdAndUserId(id, userId)
        .map(this::view)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Log not found"));
  }

  @Transactional
  public LogView create(UUID userId, String body, Instant occurredAt) {
    return view(logs.save(new Log(userId, cleanBody(body), requiredTimestamp(occurredAt))));
  }

  @Transactional
  public LogView update(UUID userId, UUID id, String body, Instant occurredAt, Long expectedVersion) {
    Log log = logs.findByIdAndUserId(id, userId)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Log not found"));
    if (expectedVersion != null && log.getVersion() != expectedVersion)
      throw new ResponseStatusException(HttpStatus.CONFLICT, "Log changed in another window");
    log.update(cleanBody(body), requiredTimestamp(occurredAt));
    return view(logs.save(log));
  }

  @Transactional
  public void delete(UUID userId, UUID id) {
    Log log = logs.findByIdAndUserId(id, userId)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Log not found"));
    logs.delete(log);
  }

  @Transactional
  public LogView setLabels(UUID userId, UUID id, List<UUID> requestedLabelIds) {
    Log log = logs.findByIdAndUserId(id, userId)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Log not found"));
    List<UUID> requested = requestedLabelIds == null ? List.of() : requestedLabelIds.stream().distinct().toList();
    Set<UUID> available = labels.findAllByUserIdAndScope(userId, LabelScopeType.LOG).stream()
        .map(Label::getId).collect(java.util.stream.Collectors.toSet());
    if (!available.containsAll(requested))
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Log labels must be owned LOG-scoped labels");
    logLabels.deleteAllByIdLogId(id);
    requested.forEach(labelId -> logLabels.save(new LogLabel(new LogLabelId(id, labelId))));
    return view(log);
  }

  private LogView view(Log log) {
    return new LogView(log.getId(), log.getBody(), log.getOccurredAt(), logLabels.findAllByIdLogId(log.getId()).stream().map(value -> value.getId().getLabelId()).toList(), log.getCreatedAt(), log.getUpdatedAt(), log.getVersion());
  }

  private static String cleanBody(String body) {
    if (body == null || body.isBlank()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Log text cannot be blank");
    String cleaned = body.trim();
    if (cleaned.length() > 20000) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Log text is too long");
    return cleaned;
  }

  private static Instant requiredTimestamp(Instant timestamp) {
    if (timestamp == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Log timestamp is required");
    return timestamp;
  }
}
