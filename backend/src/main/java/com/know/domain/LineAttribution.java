package com.know.domain;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * Per-line edit times for rich-text bodies, like git blame. A body's lines are its textblocks
 * (paragraphs, headings, code blocks, and the paragraphs inside list and task items) in document
 * order, further split at hard breaks and newlines. Each save aligns the old lines with the new
 * ones; unchanged lines keep their time and every other line takes the save time.
 *
 * <p>frontend/src/lib/line-history.ts mirrors {@link #lines}; docs/fixtures/line-history-cases.json
 * keeps the two in step.
 */
public final class LineAttribution {
  private static final ObjectMapper JSON = new ObjectMapper();
  private static final Set<String> TEXTBLOCKS = Set.of("paragraph", "heading", "codeBlock");
  // Alignment cost is lines x lines; past this, only the common head and tail keep their times.
  private static final long MAX_ALIGNMENT_CELLS = 2_000_000;
  // Longer bodies report no line times: their stamps would outweigh the body itself.
  static final int MAX_LINES = 10_000;

  // Times are stored as ISO-8601 strings so the plain mapper needs no time module.
  record Stamp(String h, String t) {}

  private LineAttribution() {}

  /** The body's lines. Bodies that are not JSON are legacy plain text, one line per newline. */
  public static List<String> lines(String content) {
    if (content == null) return List.of();
    JsonNode root;
    try {
      root = JSON.readTree(content);
    } catch (JsonProcessingException notJson) {
      return List.of(content.split("\n", -1));
    }
    if (root == null || !root.isObject()) return List.of(content.split("\n", -1));
    List<String> out = new ArrayList<>();
    if ("doc".equals(root.path("type").asText())) collect(root, "", out);
    return out;
  }

  private static void collect(JsonNode node, String prefix, List<String> out) {
    String type = node.path("type").asText();
    if (TEXTBLOCKS.contains(type)) {
      StringBuilder text = new StringBuilder(prefix);
      for (JsonNode child : node.path("content")) {
        if ("text".equals(child.path("type").asText())) text.append(child.path("text").asText());
        else if ("hardBreak".equals(child.path("type").asText())) text.append('\n');
      }
      out.addAll(List.of(text.toString().split("\n", -1)));
      return;
    }
    String childPrefix =
        "taskItem".equals(type) ? (node.path("attrs").path("checked").asBoolean() ? "[x] " : "[ ] ") : "";
    for (JsonNode child : node.path("content")) collect(child, childPrefix, out);
  }

  /**
   * A document body's plain-text copy, used for search and excerpts: one line per body line,
   * without task checkboxes. Null for legacy bodies that are not documents, whose copy is the
   * client's own text.
   */
  public static String plainText(String content) {
    if (content == null) return null;
    try {
      JsonNode root = JSON.readTree(content);
      if (root == null || !root.isObject() || !"doc".equals(root.path("type").asText())) return null;
    } catch (JsonProcessingException notJson) {
      return null;
    }
    return String.join("\n", lines(content).stream().map(line -> TASK.matcher(line).replaceFirst("")).toList());
  }

  /**
   * The edit time of each of the body's lines; lines without a stored time take the fallback.
   * Null when the body is too long to track line by line.
   */
  public static List<Instant> times(String content, String stored, Instant fallback) {
    List<String> hashes = hashes(lines(content));
    return hashes.size() > MAX_LINES ? null : times(hashes, stored, fallback);
  }

  private static List<Instant> times(List<String> hashes, String stored, Instant fallback) {
    Instant floor = micros(fallback);
    List<Instant> unknown = hashes.stream().map(ignored -> floor).toList();
    List<Stamp> stamps = parse(stored);
    if (stamps == null || !stamps.stream().map(Stamp::h).toList().equals(hashes)) return unknown;
    try {
      return stamps.stream().map(stamp -> Instant.parse(stamp.t())).toList();
    } catch (RuntimeException corrupt) {
      return unknown;
    }
  }

  /**
   * The stored stamps for a new body, keeping the times of lines that survive the edit. Null when
   * the new body is too long to track line by line.
   */
  public static String next(String oldContent, String stored, Instant fallback, String newContent, Instant now) {
    List<String> newLines = lines(newContent);
    if (newLines.size() > MAX_LINES) return null;
    List<String> newHashes = hashes(newLines);
    List<String> oldLines = lines(oldContent);
    List<Instant> oldTimes = times(hashes(oldLines), stored, fallback);
    Instant[] newTimes = new Instant[newHashes.size()];
    Arrays.fill(newTimes, micros(now));
    align(oldLines, newLines, (oldIndex, newIndex) -> newTimes[newIndex] = oldTimes.get(oldIndex));
    List<Stamp> stamps = new ArrayList<>();
    for (int i = 0; i < newHashes.size(); i++) stamps.add(new Stamp(newHashes.get(i), newTimes[i].toString()));
    try {
      return JSON.writeValueAsString(stamps);
    } catch (JsonProcessingException impossible) {
      throw new IllegalStateException(impossible);
    }
  }

  /** The stored stamps for a brand-new body: every line was written now. */
  public static String fresh(String content, Instant now) {
    return next(null, null, now, content, now);
  }

  /**
   * Stored stamps for a row that has none, dating every line from its last update. Rows call this
   * before any change that moves updated_at, so their lines keep the time they had.
   */
  public static String pin(String content, String stored, Instant updatedAt) {
    return stored != null ? stored : fresh(content, updatedAt);
  }

  // PostgreSQL keeps microseconds, so line times match the row's own timestamps.
  private static Instant micros(Instant value) {
    return value == null ? null : value.truncatedTo(ChronoUnit.MICROS);
  }

  interface Match {
    void at(int oldIndex, int newIndex);
  }

  private static final java.util.regex.Pattern TASK = java.util.regex.Pattern.compile("^\\[[x ]\\] ");

  /**
   * Whether two lines are the same line. A line also matches itself without its task checkbox:
   * iOS and the Chrome extension rebuild bodies from plain text, which drops checkboxes, and that
   * is not an edit. Checking or unchecking a task keeps the checkbox on both sides, so it is.
   */
  static boolean same(String a, String b) {
    if (a.equals(b)) return true;
    boolean taskA = TASK.matcher(a).lookingAt(), taskB = TASK.matcher(b).lookingAt();
    return taskA != taskB && (taskA ? a.substring(4) : a).equals(taskB ? b.substring(4) : b);
  }

  // Longest common subsequence over the lines, after trimming the common head and tail.
  static void align(List<String> a, List<String> b, Match match) {
    int head = 0;
    while (head < a.size() && head < b.size() && same(a.get(head), b.get(head))) {
      match.at(head, head);
      head++;
    }
    int tail = 0;
    while (tail < a.size() - head
        && tail < b.size() - head
        && same(a.get(a.size() - 1 - tail), b.get(b.size() - 1 - tail))) {
      match.at(a.size() - 1 - tail, b.size() - 1 - tail);
      tail++;
    }
    int n = a.size() - head - tail, m = b.size() - head - tail;
    if (n == 0 || m == 0 || (long) n * m > MAX_ALIGNMENT_CELLS) return;
    int[][] lengths = new int[n + 1][m + 1];
    for (int i = n - 1; i >= 0; i--)
      for (int j = m - 1; j >= 0; j--)
        lengths[i][j] =
            same(a.get(head + i), b.get(head + j))
                ? lengths[i + 1][j + 1] + 1
                : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    for (int i = 0, j = 0; i < n && j < m; ) {
      if (same(a.get(head + i), b.get(head + j))) match.at(head + i++, head + j++);
      else if (lengths[i + 1][j] >= lengths[i][j + 1]) i++;
      else j++;
    }
  }

  private static List<Stamp> parse(String stored) {
    if (stored == null) return null;
    try {
      return JSON.readValue(stored, new TypeReference<List<Stamp>>() {});
    } catch (JsonProcessingException | RuntimeException corrupt) {
      return null;
    }
  }

  private static List<String> hashes(List<String> lines) {
    MessageDigest digest = sha256();
    List<String> out = new ArrayList<>(lines.size());
    for (String line : lines) out.add(HexFormat.of().formatHex(digest.digest(line.getBytes(StandardCharsets.UTF_8)), 0, 8));
    return out;
  }

  private static MessageDigest sha256() {
    try {
      return MessageDigest.getInstance("SHA-256");
    } catch (NoSuchAlgorithmException impossible) {
      throw new IllegalStateException(impossible);
    }
  }
}
