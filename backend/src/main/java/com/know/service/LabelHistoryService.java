package com.know.service;

import com.know.domain.*;
import jakarta.persistence.EntityManager;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * How one label has been used: when, how often, for how long, and alongside which other labels.
 * A use is one labelled session (at its start), log (at its time), note or board card (at its
 * creation), or calendar day (at the start of the day).
 */
@Service
public class LabelHistoryService {
  static final int MAX_MONTHS = 36;
  static final int MAX_RELATED = 12;

  private final LabelRepository labels;
  private final EntityManager entityManager;

  public LabelHistoryService(LabelRepository labels, EntityManager entityManager) {
    this.labels = labels;
    this.entityManager = entityManager;
  }

  public record Uses(long sessions, long logs, long notes, long calendarDays, long cards) {}

  public record Month(String month, long uses, long trackedSeconds) {}

  public record Hour(int hour, long uses, long trackedSeconds) {}

  public record Related(UUID id, String name, String color, long together, long trackedSeconds) {}

  public record History(
      UUID labelId,
      String name,
      String color,
      Instant firstUsedAt,
      Instant lastUsedAt,
      long totalUses,
      long trackedSeconds,
      Uses uses,
      List<Month> timeline,
      List<Hour> hours,
      List<Related> related) {}

  private static final String SESSIONS =
      "select t from TimeEntry t where t.userId = :userId and exists (select 1 from TimeEntryLabel"
          + " m where m.id.timeEntryId = t.id and m.id.labelId = :labelId)";
  private static final String SESSION_LABELS =
      "select x.id.timeEntryId, x.id.labelId from TimeEntryLabel x where x.id.labelId <> :labelId"
          + " and x.id.timeEntryId in (" + SESSIONS.replace("select t ", "select t.id ") + ")";
  private static final String LOGS =
      "select g.id, g.occurredAt from Log g where g.userId = :userId and exists (select 1 from"
          + " LogLabel m where m.id.logId = g.id and m.id.labelId = :labelId)";
  private static final String LOG_LABELS =
      "select x.id.logId, x.id.labelId from LogLabel x where x.id.labelId <> :labelId and"
          + " x.id.logId in (" + LOGS.replace("select g.id, g.occurredAt ", "select g.id ") + ")";
  private static final String NOTES =
      "select n.id, n.createdAt from Note n where n.userId = :userId and n.deletedAt is null and"
          + " exists (select 1 from NoteTag m where m.id.noteId = n.id and m.id.labelId = :labelId)";
  private static final String NOTE_LABELS =
      "select x.id.noteId, x.id.labelId from NoteTag x where x.id.labelId <> :labelId and"
          + " x.id.noteId in (" + NOTES.replace("select n.id, n.createdAt ", "select n.id ") + ")";
  private static final String DAYS =
      "select d.id, d.recordDate from DailyRecord d where d.userId = :userId and exists (select 1"
          + " from DailyRecordLabel m where m.id.dailyRecordId = d.id and m.id.labelId = :labelId)";
  private static final String DAY_LABELS =
      "select x.id.dailyRecordId, x.id.labelId from DailyRecordLabel x where x.id.labelId <>"
          + " :labelId and x.id.dailyRecordId in ("
          + DAYS.replace("select d.id, d.recordDate ", "select d.id ")
          + ")";
  private static final String CARDS =
      "select c.id, c.createdAt from BoardCard c join c.labels l where l.id = :labelId and exists"
          + " (select 1 from Board b where b.id = c.boardId and b.userId = :userId)";
  private static final String CARD_LABELS =
      "select c.id, o.id from BoardCard c join c.labels l join c.labels o where l.id = :labelId"
          + " and o.id <> :labelId and exists (select 1 from Board b where b.id = c.boardId and"
          + " b.userId = :userId)";

  @Transactional(readOnly = true)
  public History history(UUID userId, UUID labelId, String zoneName) {
    ZoneId zone = zone(zoneName);
    Label label =
        labels
            .findByIdAndUserId(labelId, userId)
            .orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Label not found"));
    Instant now = Instant.now();

    List<TimeEntry> sessions =
        entityManager
            .createQuery(SESSIONS, TimeEntry.class)
            .setParameter("userId", userId)
            .setParameter("labelId", labelId)
            .getResultList();
    List<Object[]> logs = rows(LOGS, userId, labelId);
    List<Object[]> notes = rows(NOTES, userId, labelId);
    List<Object[]> days = rows(DAYS, userId, labelId);
    List<Object[]> cards = rows(CARDS, userId, labelId);

    // Uses with a time of day; calendar days only have a date.
    List<Instant> timedUses = new ArrayList<>();
    List<Instant> allUses = new ArrayList<>();
    Map<UUID, Long> secondsBySession = new HashMap<>();
    Map<YearMonth, long[]> months = new HashMap<>();
    long[][] hours = new long[24][2];
    long trackedSeconds = 0;
    for (TimeEntry session : sessions) {
      Instant end = session.getEndedAt() == null ? now : session.getEndedAt();
      long seconds = Math.max(0, Duration.between(session.getStartedAt(), end).toSeconds());
      secondsBySession.put(session.getId(), seconds);
      trackedSeconds += seconds;
      timedUses.add(session.getStartedAt());
      spread(session.getStartedAt(), end, zone, months, hours);
    }
    for (List<Object[]> timed : List.of(logs, notes, cards))
      for (Object[] row : timed) timedUses.add((Instant) row[1]);
    allUses.addAll(timedUses);
    for (Object[] row : days) allUses.add(((LocalDate) row[1]).atStartOfDay(zone).toInstant());

    for (Instant use : timedUses) hours[use.atZone(zone).getHour()][0]++;
    for (Instant use : allUses)
      months.computeIfAbsent(YearMonth.from(use.atZone(zone)), ignored -> new long[2])[0]++;

    Instant first = allUses.stream().min(Comparator.naturalOrder()).orElse(null);
    Instant last = allUses.stream().max(Comparator.naturalOrder()).orElse(null);
    List<Hour> hourViews = new ArrayList<>();
    for (int hour = 0; hour < 24; hour++)
      hourViews.add(new Hour(hour, hours[hour][0], hours[hour][1]));

    return new History(
        label.getId(),
        label.getName(),
        label.getColor(),
        first,
        last,
        allUses.size(),
        trackedSeconds,
        new Uses(sessions.size(), logs.size(), notes.size(), days.size(), cards.size()),
        timeline(first, last, now, zone, months),
        hourViews,
        related(userId, labelId, secondsBySession));
  }

  private List<Object[]> rows(String query, UUID userId, UUID labelId) {
    return entityManager
        .createQuery(query, Object[].class)
        .setParameter("userId", userId)
        .setParameter("labelId", labelId)
        .getResultList();
  }

  /** Adds a session's time to the months and hours of day it covers. */
  private static void spread(
      Instant start, Instant end, ZoneId zone, Map<YearMonth, long[]> months, long[][] hours) {
    ZonedDateTime slot = start.atZone(zone).truncatedTo(ChronoUnit.HOURS);
    while (slot.toInstant().isBefore(end)) {
      ZonedDateTime next = slot.plusHours(1);
      Instant from = slot.toInstant().isBefore(start) ? start : slot.toInstant();
      Instant to = next.toInstant().isAfter(end) ? end : next.toInstant();
      long seconds = Duration.between(from, to).toSeconds();
      if (seconds > 0) {
        months.computeIfAbsent(YearMonth.from(slot), ignored -> new long[2])[1] += seconds;
        hours[slot.getHour()][1] += seconds;
      }
      slot = next;
    }
  }

  private static List<Month> timeline(
      Instant first, Instant last, Instant now, ZoneId zone, Map<YearMonth, long[]> months) {
    if (first == null) return List.of();
    YearMonth end = YearMonth.from(now.atZone(zone));
    YearMonth lastUse = YearMonth.from(last.atZone(zone));
    if (lastUse.isAfter(end)) end = lastUse;
    YearMonth start = YearMonth.from(first.atZone(zone));
    YearMonth earliest = end.minusMonths(MAX_MONTHS - 1);
    if (start.isBefore(earliest)) start = earliest;
    List<Month> timeline = new ArrayList<>();
    for (YearMonth month = start; !month.isAfter(end); month = month.plusMonths(1)) {
      long[] totals = months.getOrDefault(month, new long[2]);
      timeline.add(new Month(month.toString(), totals[0], totals[1]));
    }
    return timeline;
  }

  private List<Related> related(UUID userId, UUID labelId, Map<UUID, Long> secondsBySession) {
    Map<UUID, long[]> totals = new HashMap<>();
    for (Object[] row : rows(SESSION_LABELS, userId, labelId)) {
      long[] total = totals.computeIfAbsent((UUID) row[1], ignored -> new long[2]);
      total[0]++;
      total[1] += secondsBySession.getOrDefault((UUID) row[0], 0L);
    }
    for (String query : List.of(LOG_LABELS, NOTE_LABELS, DAY_LABELS, CARD_LABELS))
      for (Object[] row : rows(query, userId, labelId))
        totals.computeIfAbsent((UUID) row[1], ignored -> new long[2])[0]++;
    if (totals.isEmpty()) return List.of();
    return labels.findAllByUserIdAndIdIn(userId, totals.keySet()).stream()
        .map(
            other -> {
              long[] total = totals.get(other.getId());
              return new Related(
                  other.getId(), other.getName(), other.getColor(), total[0], total[1]);
            })
        .sorted(
            Comparator.comparingLong(Related::together)
                .reversed()
                .thenComparing(Comparator.comparingLong(Related::trackedSeconds).reversed())
                .thenComparing(Related::name, String.CASE_INSENSITIVE_ORDER))
        .limit(MAX_RELATED)
        .toList();
  }

  private static ZoneId zone(String name) {
    if (name == null || name.isBlank()) return ZoneOffset.UTC;
    try {
      return ZoneId.of(name);
    } catch (DateTimeException invalid) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown time zone");
    }
  }
}
