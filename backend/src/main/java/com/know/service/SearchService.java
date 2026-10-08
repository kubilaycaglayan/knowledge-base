package com.know.service;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.QueryTimeoutException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Global search across everything a user owns. Every term of the query has to match each result,
 * either directly (a case-insensitive substring of the record's own text) or through the path or
 * a label the record is filed under. When nothing matches literally, the search runs once more
 * accepting near-miss spellings of terms of four or more characters, and says so. Results are
 * ranked in SQL among each type's most recent matches, so pages of one type stay consistent.
 */
@Service
public class SearchService {
  public static final int MAX_QUERY_LENGTH = 200;
  public static final int MAX_TERMS = 8;
  public static final int DEFAULT_LIMIT = 5;
  public static final int MAX_LIMIT = 50;
  public static final int MAX_OFFSET = 1000;
  /** Each type ranks at most this many of its most recent matches; larger totals are capped. */
  public static final int CANDIDATE_LIMIT = 1000;
  /** Labels or paths per term that can stand in for a record's own text. */
  static final int VIA_LIMIT = 500;
  /** Shorter terms give too many accidental near-misses, so they only match as substrings. */
  static final int FUZZY_MIN_LENGTH = 4;
  /** pg_trgm's default word_similarity_threshold, which its {@code <%} operator applies. */
  static final double FUZZY_THRESHOLD = 0.6;

  static final int SNIPPET_LENGTH = 160;
  static final int TITLE_LENGTH = 120;

  /** Groups with equally strong matches are listed in this order. */
  public enum Type {
    PATH,
    BOARD,
    LABEL,
    NOTE,
    CARD,
    LOG,
    SESSION,
    CALENDAR_DAY
  }

  public enum Via {
    PATH,
    LABEL
  }

  /**
   * One match. {@code at} is the moment the record is about (a session's start, a log's time, or
   * a note, card, board or path's last update); calendar days carry their {@code date} instead.
   * {@code via}/{@code viaName} say which path or label matched when the record's own text did not.
   */
  public record Result(
      Type type,
      UUID id,
      String title,
      String snippet,
      Instant at,
      LocalDate date,
      boolean archived,
      Via via,
      String viaName,
      String color,
      UUID pathId,
      String pathName,
      String pathColor,
      UUID boardId,
      String boardName,
      String statusName,
      Instant endedAt,
      Long durationSeconds) {}

  /** {@code total} counts matches up to {@link #CANDIDATE_LIMIT}; {@code capped} says there are more. */
  public record Group(Type type, long total, boolean capped, List<Result> results) {}

  /**
   * {@code fuzzy} says the results are near-miss matches because nothing matched literally;
   * {@code incomplete} that a type took too long and was left out.
   */
  public record Response(List<Group> groups, boolean fuzzy, boolean incomplete) {}

  private static final Logger LOG = LoggerFactory.getLogger(SearchService.class);

  private final NamedParameterJdbcTemplate jdbc;
  private final DataSource dataSource;
  private volatile Boolean postgres;

  public SearchService(
      DataSource dataSource, @Value("${app.search.query-timeout-seconds:3}") int queryTimeoutSeconds) {
    JdbcTemplate template = new JdbcTemplate(dataSource);
    // A runaway query gives up instead of holding a connection; its type is left out.
    template.setQueryTimeout(queryTimeoutSeconds);
    this.jdbc = new NamedParameterJdbcTemplate(template);
    this.dataSource = dataSource;
  }

  /** Splits a query into at most {@link #MAX_TERMS} distinct whitespace-separated terms. */
  static List<String> terms(String query) {
    Map<String, String> distinct = new LinkedHashMap<>();
    for (String term : query.trim().split("\\s+")) {
      if (term.isEmpty()) continue;
      distinct.putIfAbsent(term.toLowerCase(Locale.ROOT), term);
      if (distinct.size() == MAX_TERMS) break;
    }
    return List.copyOf(distinct.values());
  }

  static boolean fuzzyEligible(String term) {
    return term.codePointCount(0, term.length()) >= FUZZY_MIN_LENGTH;
  }

  /**
   * Searches the given types (all when empty). {@code fuzzy} null picks the mode: literal, then
   * near misses when nothing matched literally on the first page. Later pages pass the mode the
   * first page reported, so they continue the same result list.
   */
  public Response search(UUID user, String query, Set<Type> types, int limit, int offset, Boolean fuzzy) {
    List<String> terms = terms(query);
    if (terms.isEmpty()) return new Response(List.of(), false, false);
    Set<Type> wanted = types == null || types.isEmpty() ? EnumSet.allOf(Type.class) : types;
    boolean canBeFuzzy = terms.stream().anyMatch(SearchService::fuzzyEligible);
    if (Boolean.TRUE.equals(fuzzy)) return run(user, terms, wanted, limit, offset, canBeFuzzy);
    Response literal = run(user, terms, wanted, limit, offset, false);
    if (fuzzy != null || offset > 0 || !literal.groups().isEmpty() || literal.incomplete() || !canBeFuzzy)
      return literal;
    return run(user, terms, wanted, limit, offset, true);
  }

  private Response run(UUID user, List<String> terms, Set<Type> wanted, int limit, int offset, boolean fuzzy) {
    boolean postgres = isPostgres();
    ViaMatches via = ViaMatches.resolve(jdbc, user, terms, fuzzy, postgres);
    record Ranked(Group group, int topScore) {}
    List<Ranked> ranked = new ArrayList<>();
    boolean incomplete = false;
    for (Type type : Type.values()) {
      if (!wanted.contains(type)) continue;
      Spec spec = spec(type);
      Query sql = new Query(spec, terms, via, fuzzy, postgres);
      MapSqlParameterSource params =
          sql.params.addValue("user", user).addValue("limit", limit).addValue("offset", offset)
              .addValue("cap", CANDIDATE_LIMIT + 1);
      long[] total = {0};
      int[] top = {0};
      List<Result> results;
      try {
        results =
            jdbc.query(
                sql.text,
                params,
                (row, index) -> {
                  total[0] = row.getLong("total");
                  if (index == 0) top[0] = row.getInt("score");
                  return spec.map(row, terms);
                });
      } catch (QueryTimeoutException slow) {
        LOG.warn("Search of {} timed out for {} terms (fuzzy={})", type, terms.size(), fuzzy);
        incomplete = true;
        continue;
      }
      if (total[0] > 0)
        ranked.add(
            new Ranked(
                new Group(type, Math.min(total[0], CANDIDATE_LIMIT), total[0] > CANDIDATE_LIMIT, results),
                top[0]));
    }
    // Strongest matches first; equal groups keep the fixed type order.
    ranked.sort(Comparator.comparingInt(Ranked::topScore).reversed());
    List<Group> groups = ranked.stream().map(Ranked::group).toList();
    return new Response(groups, fuzzy && !groups.isEmpty(), incomplete);
  }

  private boolean isPostgres() {
    Boolean known = postgres;
    if (known == null) {
      try (Connection connection = dataSource.getConnection()) {
        known = connection.getMetaData().getDatabaseProductName().toLowerCase(Locale.ROOT).contains("postgres");
      } catch (SQLException unavailable) {
        throw new IllegalStateException("Search could not inspect the database", unavailable);
      }
      postgres = known;
    }
    return known;
  }

  // ---------------------------------------------------------------------------------------------
  // Per-type definitions

  /**
   * How one type is searched. {@code title} and {@code body} are lower-cased SQL expressions that
   * match the trigram indexes; {@code pathRef} is the column naming the record's own path, and
   * {@code labelJoin}/{@code labelKey} the label assignment table and its record column.
   */
  private record Spec(
      Type type,
      String select,
      String from,
      String where,
      String title,
      String body,
      String recency,
      String pathRef,
      String cardPaths,
      String labelJoin,
      String labelKey,
      String alias,
      Mapper mapper) {
    Result map(ResultSet row, List<String> terms) throws SQLException {
      boolean direct = row.getInt("direct") == 1;
      Via via = null;
      String viaName = null;
      if (!direct) {
        viaName = row.getString("via_path");
        if (viaName != null) via = Via.PATH;
        else {
          viaName = row.getString("via_label");
          if (viaName != null) via = Via.LABEL;
        }
      }
      return mapper.map(row, terms, via, viaName);
    }
  }

  @FunctionalInterface
  private interface Mapper {
    Result map(ResultSet row, List<String> terms, Via via, String viaName) throws SQLException;
  }

  private static Spec spec(Type type) {
    return switch (type) {
      case SESSION ->
          new Spec(
              type,
              "t.id, t.description, t.started_at, t.ended_at, t.duration_seconds, t.path_id,"
                  + " sp.name as path_name, sp.color as path_color",
              "time_entry t left join path sp on sp.id = t.path_id and sp.user_id = t.user_id",
              "t.user_id = :user and t.deleted_at is null",
              "lower(coalesce(t.description, ''))",
              null,
              "t.started_at",
              "t.path_id",
              null,
              "time_entry_label",
              "time_entry_id",
              "t",
              (row, terms, via, viaName) -> {
                String description = blankToNull(row.getString("description"));
                String pathName = row.getString("path_name");
                return new Result(
                    type,
                    uuid(row, "id"),
                    description != null ? clip(oneLine(description), TITLE_LENGTH) : pathName != null ? pathName : "Untitled session",
                    description != null && oneLine(description).length() > TITLE_LENGTH ? snippet(description, terms) : null,
                    instant(row, "started_at"),
                    null,
                    false,
                    via,
                    viaName,
                    null,
                    (UUID) row.getObject("path_id"),
                    pathName,
                    row.getString("path_color"),
                    null,
                    null,
                    null,
                    instant(row, "ended_at"),
                    (Long) row.getObject("duration_seconds"));
              });
      case LOG ->
          new Spec(
              type,
              "l.id, l.body, l.occurred_at",
              "logs l",
              "l.user_id = :user",
              null,
              "lower(l.body)",
              "l.occurred_at",
              null,
              null,
              "log_label",
              "log_id",
              "l",
              (row, terms, via, viaName) -> {
                String body = row.getString("body");
                String first = firstLine(body);
                String title = clip(first, TITLE_LENGTH);
                // The first line is the title; the snippet shows what follows it.
                // body.strip() starts with its first non-blank line.
                String rest = body == null ? "" : body.strip().substring(first.length());
                return new Result(
                    type, uuid(row, "id"), title.isEmpty() ? "Empty log" : title,
                    snippet(rest, terms),
                    instant(row, "occurred_at"), null, false, via, viaName, null,
                    null, null, null, null, null, null, null, null);
              });
      case NOTE ->
          new Spec(
              type,
              "n.id, n.title, n.content_text, n.updated_at, n.deleted_at",
              "note n",
              "n.user_id = :user",
              "lower(n.title)",
              "lower(coalesce(n.content_text, ''))",
              "n.updated_at",
              "n.path_id",
              null,
              "note_label",
              "note_id",
              "n",
              (row, terms, via, viaName) -> {
                String title = blankToNull(row.getString("title"));
                String text = row.getString("content_text");
                return new Result(
                    type, uuid(row, "id"), title == null ? "Untitled note" : clip(oneLine(title), TITLE_LENGTH),
                    blankToNull(text) == null ? null : snippet(text, terms),
                    instant(row, "updated_at"), null, row.getTimestamp("deleted_at") != null,
                    via, viaName, null, null, null, null, null, null, null, null, null);
              });
      case CARD ->
          new Spec(
              type,
              "c.id, c.title, c.body_text, c.updated_at, c.archived_at, c.board_id,"
                  + " cb.name as board_name, cb.archived_at as board_archived_at, cs.name as status_name",
              "board_cards c join boards cb on cb.id = c.board_id"
                  + " left join board_statuses cs on cs.id = c.status_id",
              "cb.user_id = :user and (cb.path_id is null or exists (select 1 from path bp where bp.id"
                  + " = cb.path_id and bp.deleted_at is null))",
              "lower(c.title)",
              "lower(c.body_text)",
              "c.updated_at",
              null,
              "board_card_paths",
              "board_card_labels",
              "card_id",
              "c",
              (row, terms, via, viaName) -> {
                String title = blankToNull(row.getString("title"));
                String text = row.getString("body_text");
                return new Result(
                    type, uuid(row, "id"), title == null ? "Untitled card" : clip(oneLine(title), TITLE_LENGTH),
                    blankToNull(text) == null ? null : snippet(text, terms),
                    instant(row, "updated_at"), null,
                    row.getTimestamp("archived_at") != null || row.getTimestamp("board_archived_at") != null,
                    via, viaName, null, null, null, null, uuid(row, "board_id"), row.getString("board_name"),
                    row.getString("status_name"), null, null);
              });
      case BOARD ->
          new Spec(
              type,
              "b.id, b.name, b.updated_at, b.archived_at, b.path_id, bp.color as path_color",
              "boards b left join path bp on bp.id = b.path_id",
              "b.user_id = :user and (b.path_id is null or bp.deleted_at is null)",
              "lower(b.name)",
              null,
              "b.updated_at",
              null,
              null,
              null,
              null,
              "b",
              (row, terms, via, viaName) ->
                  new Result(
                      type, uuid(row, "id"), clip(oneLine(row.getString("name")), TITLE_LENGTH), null,
                      instant(row, "updated_at"), null, row.getTimestamp("archived_at") != null,
                      via, viaName, null, (UUID) row.getObject("path_id"), null, row.getString("path_color"),
                      null, null, null, null, null));
      case PATH ->
          new Spec(
              type,
              "p.id, p.name, p.description, p.color, p.updated_at, p.archived_at",
              "path p",
              "p.user_id = :user and p.deleted_at is null",
              "lower(p.name)",
              "lower(coalesce(p.description, ''))",
              "p.updated_at",
              null,
              null,
              null,
              null,
              "p",
              (row, terms, via, viaName) -> {
                String description = row.getString("description");
                return new Result(
                    type, uuid(row, "id"), clip(oneLine(row.getString("name")), TITLE_LENGTH),
                    blankToNull(description) == null ? null : snippet(description, terms),
                    instant(row, "updated_at"), null, row.getTimestamp("archived_at") != null,
                    via, viaName, row.getString("color"), null, null, null, null, null, null, null, null);
              });
      case LABEL ->
          new Spec(
              type,
              "lb.id, lb.name, lb.color, lb.created_at",
              "labels lb",
              "lb.user_id = :user",
              "lower(lb.name)",
              null,
              "lb.created_at",
              null,
              null,
              null,
              null,
              "lb",
              (row, terms, via, viaName) ->
                  new Result(
                      type, uuid(row, "id"), clip(oneLine(row.getString("name")), TITLE_LENGTH), null,
                      instant(row, "created_at"), null, false, via, viaName, row.getString("color"),
                      null, null, null, null, null, null, null, null));
      case CALENDAR_DAY ->
          new Spec(
              type,
              "d.id, d.note, d.record_date, d.updated_at",
              "daily_record d",
              "d.user_id = :user",
              null,
              "lower(coalesce(d.note, ''))",
              "d.record_date",
              null,
              null,
              "daily_record_label",
              "daily_record_id",
              "d",
              (row, terms, via, viaName) -> {
                String note = row.getString("note");
                LocalDate date = row.getObject("record_date", LocalDate.class);
                return new Result(
                    type, uuid(row, "id"), date.toString(),
                    blankToNull(note) == null ? null : snippet(note, terms),
                    instant(row, "updated_at"), date, false, via, viaName, null,
                    null, null, null, null, null, null, null, null);
              });
    };
  }

  // ---------------------------------------------------------------------------------------------
  // SQL

  /**
   * The user's labels and paths whose names match each term. A record filed under one of them
   * matches that term even when its own text does not.
   */
  private record ViaMatches(List<List<UUID>> labels, List<List<UUID>> paths) {
    static ViaMatches resolve(
        NamedParameterJdbcTemplate jdbc, UUID user, List<String> terms, boolean fuzzy, boolean postgres) {
      List<List<UUID>> labels = new ArrayList<>(), paths = new ArrayList<>();
      for (String term : terms) {
        MapSqlParameterSource params =
            new MapSqlParameterSource("user", user)
                .addValue("t", term)
                .addValue("c", "%" + escapeLike(term) + "%")
                .addValue("limit", VIA_LIMIT);
        boolean nearMiss = fuzzy && fuzzyEligible(term);
        labels.add(
            jdbc.queryForList(
                "select id from labels where user_id = :user and "
                    + nameMatch("name", nearMiss, postgres)
                    + " order by name, id limit :limit",
                params,
                UUID.class));
        paths.add(
            jdbc.queryForList(
                "select id from path where user_id = :user and deleted_at is null and "
                    + nameMatch("name", nearMiss, postgres)
                    + " order by name, id limit :limit",
                params,
                UUID.class));
      }
      return new ViaMatches(labels, paths);
    }

    private static String nameMatch(String column, boolean nearMiss, boolean postgres) {
      String lowered = "lower(" + column + ")";
      return "(" + like(lowered, ":c") + (nearMiss ? " or " + similar(":t", lowered, postgres) : "") + ")";
    }

    List<UUID> allLabels() {
      return labels.stream().flatMap(List::stream).distinct().toList();
    }

    List<UUID> allPaths() {
      return paths.stream().flatMap(List::stream).distinct().toList();
    }
  }

  /**
   * The ranked, paged query for one type, with all values bound as parameters. The most recent
   * {@link #CANDIDATE_LIMIT} matches (plus one, to tell that there are more) are found first with
   * cheap predicates the trigram indexes serve; only those are scored and ranked.
   */
  private static final class Query {
    final String text;
    final MapSqlParameterSource params = new MapSqlParameterSource();

    Query(Spec spec, List<String> terms, ViaMatches via, boolean fuzzy, boolean postgres) {
      String id = spec.alias + ".id";
      List<String> matches = new ArrayList<>();
      List<String> directs = new ArrayList<>();
      List<String> scores = new ArrayList<>();
      for (int i = 0; i < terms.size(); i++) {
        String term = terms.get(i);
        String t = ":t" + i, contains = ":c" + i, prefix = ":s" + i;
        params.addValue("t" + i, term);
        params.addValue("c" + i, "%" + escapeLike(term) + "%");
        params.addValue("s" + i, escapeLike(term) + "%");
        boolean nearMiss = fuzzy && fuzzyEligible(term);
        String viaPath = null, viaLabel = null;
        if (!via.paths().get(i).isEmpty()) {
          params.addValue("vp" + i, via.paths().get(i));
          if (spec.pathRef != null) viaPath = spec.pathRef + " in (:vp" + i + ")";
          else if (spec.cardPaths != null)
            viaPath = id + " in (select vpj.card_id from " + spec.cardPaths + " vpj where vpj.path_id in (:vp" + i + "))";
        }
        if (spec.labelJoin != null && !via.labels().get(i).isEmpty()) {
          params.addValue("vl" + i, via.labels().get(i));
          viaLabel = id + " in (select vlj." + spec.labelKey + " from " + spec.labelJoin
              + " vlj where vlj.label_id in (:vl" + i + "))";
        }
        List<String> direct = new ArrayList<>();
        if (spec.title != null) direct.add(like(spec.title, contains));
        if (spec.body != null) direct.add(like(spec.body, contains));
        if (nearMiss) {
          if (spec.title != null) direct.add(similar(t, spec.title, postgres));
          if (spec.body != null) direct.add(similar(t, spec.body, postgres));
        }
        String directMatch = "(" + String.join(" or ", direct) + ")";
        directs.add(directMatch);
        StringBuilder match = new StringBuilder("(").append(directMatch);
        if (viaPath != null) match.append(" or ").append(viaPath);
        if (viaLabel != null) match.append(" or ").append(viaLabel);
        matches.add(match.append(")").toString());

        StringBuilder score = new StringBuilder("case");
        if (spec.title != null) {
          score.append(" when ").append(spec.title).append(" = lower(").append(t).append(") then 100");
          score.append(" when ").append(like(spec.title, prefix)).append(" then 70");
          score.append(" when ").append(like(spec.title, contains)).append(" then 50");
        }
        if (spec.body != null) score.append(" when ").append(like(spec.body, contains)).append(" then 30");
        if (nearMiss) {
          if (spec.title != null) score.append(" when ").append(similar(t, spec.title, postgres)).append(" then 25");
          if (spec.body != null) score.append(" when ").append(similar(t, spec.body, postgres)).append(" then 15");
        }
        if (viaPath != null) score.append(" when ").append(viaPath).append(" then 10");
        if (viaLabel != null) score.append(" when ").append(viaLabel).append(" then 10");
        scores.add(score.append(" else 0 end").toString());
      }
      if (terms.size() > 1 && (spec.title != null || spec.body != null)) {
        // Reward the whole phrase appearing in order.
        String phrase = String.join(" ", terms);
        params.addValue("q", phrase);
        params.addValue("qc", "%" + escapeLike(phrase) + "%");
        params.addValue("qs", escapeLike(phrase) + "%");
        StringBuilder score = new StringBuilder("case");
        if (spec.title != null) {
          score.append(" when ").append(spec.title).append(" = lower(:q) then 100");
          score.append(" when ").append(like(spec.title, ":qs")).append(" then 60");
          score.append(" when ").append(like(spec.title, ":qc")).append(" then 40");
        }
        if (spec.body != null) score.append(" when ").append(like(spec.body, ":qc")).append(" then 20");
        scores.add(score.append(" else 0 end").toString());
      }
      String viaPathName = "cast(null as varchar)", viaLabelName = "cast(null as varchar)";
      List<UUID> allPaths = via.allPaths(), allLabels = via.allLabels();
      if (!allPaths.isEmpty() && (spec.pathRef != null || spec.cardPaths != null)) {
        params.addValue("vpAll", allPaths);
        viaPathName =
            spec.pathRef != null
                ? "(select vp.name from path vp where vp.id = " + spec.pathRef + " and vp.id in (:vpAll))"
                : "(select min(vp.name) from " + spec.cardPaths + " vpj join path vp on vp.id = vpj.path_id"
                    + " where vpj.card_id = " + id + " and vp.id in (:vpAll))";
      }
      if (!allLabels.isEmpty() && spec.labelJoin != null) {
        params.addValue("vlAll", allLabels);
        viaLabelName =
            "(select min(vl.name) from " + spec.labelJoin + " vlj join labels vl on vl.id = vlj.label_id"
                + " where vlj." + spec.labelKey + " = " + id + " and vl.id in (:vlAll))";
      }
      text =
          "with candidates as (select " + id + " as candidate_id from " + spec.from
              + " where " + spec.where + " and " + String.join(" and ", matches)
              + " order by " + spec.recency + " desc, " + id + " limit :cap)"
              + " select * from (select " + spec.select
              + ", case when " + String.join(" and ", directs) + " then 1 else 0 end as direct, "
              + viaPathName + " as via_path, " + viaLabelName + " as via_label, ("
              + String.join(" + ", scores) + ") as score, "
              + spec.recency + " as recency, count(*) over () as total from " + spec.from
              + " where " + id + " in (select candidate_id from candidates)) ranked"
              + " order by score desc, recency desc, id limit :limit offset :offset";
    }
  }

  private static String like(String lowered, String pattern) {
    return lowered + " like lower(" + pattern + ") escape '\\'";
  }

  /** A near-miss match; PostgreSQL's operator form can use the trigram indexes. */
  private static String similar(String term, String lowered, boolean postgres) {
    return postgres
        ? "lower(" + term + ") <% " + lowered
        : "word_similarity(lower(" + term + "), " + lowered + ") >= " + FUZZY_THRESHOLD;
  }

  static String escapeLike(String value) {
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
  }

  // ---------------------------------------------------------------------------------------------
  // Text

  /**
   * About {@link #SNIPPET_LENGTH} characters of {@code text} on one line, centred near the first
   * place any term appears, with an ellipsis wherever text was cut. Starts at the beginning when
   * no term appears literally (near-miss and path/label matches).
   */
  static String snippet(String text, List<String> terms) {
    String flat = flatten(text);
    if (flat.isEmpty()) return null;
    int at = -1;
    for (String term : terms) {
      int found = indexOfIgnoreCase(flat, term);
      if (found >= 0 && (at < 0 || found < at)) at = found;
    }
    if (flat.length() <= SNIPPET_LENGTH) return flat;
    int start = at < 0 ? 0 : Math.max(0, at - SNIPPET_LENGTH / 3);
    int end = Math.min(flat.length(), start + SNIPPET_LENGTH);
    start = Math.max(0, end - SNIPPET_LENGTH);
    // Cut at word boundaries where possible.
    if (start > 0) {
      int space = flat.indexOf(' ', start);
      if (space >= 0 && space < (at < 0 ? end : at)) start = space + 1;
    }
    if (end < flat.length()) {
      int space = flat.lastIndexOf(' ', end);
      if (space > Math.max(start, at)) end = space;
    }
    if (Character.isLowSurrogate(flat.charAt(start))) start++;
    if (end < flat.length() && Character.isLowSurrogate(flat.charAt(end))) end--;
    return (start > 0 ? "…" : "") + flat.substring(start, end).strip() + (end < flat.length() ? "…" : "");
  }

  static int indexOfIgnoreCase(String text, String term) {
    int length = term.length();
    for (int i = 0; i + length <= text.length(); i++) if (text.regionMatches(true, i, term, 0, length)) return i;
    return -1;
  }

  /** Text on one line, with " · " where its lines (blank ones dropped) were. */
  static String flatten(String text) {
    if (text == null) return "";
    StringBuilder out = new StringBuilder();
    for (String line : text.split("\\R")) {
      String flat = oneLine(line);
      if (flat.isEmpty()) continue;
      if (out.length() > 0) out.append(" · ");
      out.append(flat);
    }
    return out.toString();
  }

  static String oneLine(String text) {
    return text == null ? "" : text.replaceAll("\\s+", " ").strip();
  }

  static String firstLine(String text) {
    if (text == null) return "";
    for (String line : text.split("\\R")) if (!line.isBlank()) return line.strip();
    return "";
  }

  static String clip(String text, int length) {
    if (text.length() <= length) return text;
    int end = length - 1;
    if (Character.isHighSurrogate(text.charAt(end - 1))) end--;
    return text.substring(0, end).stripTrailing() + "…";
  }

  private static String blankToNull(String value) {
    return value == null || value.isBlank() ? null : value;
  }

  private static UUID uuid(ResultSet row, String column) throws SQLException {
    return row.getObject(column, UUID.class);
  }

  private static Instant instant(ResultSet row, String column) throws SQLException {
    Timestamp value = row.getTimestamp(column);
    return value == null ? null : value.toInstant();
  }
}
