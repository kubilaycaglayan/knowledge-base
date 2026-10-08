package com.know.domain;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
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

  /** The edit time of each of the body's lines; lines without a stored time take the fallback. */
  public static List<Instant> times(String content, String stored, Instant fallback) {
    List<String> hashes = lines(content).stream().map(LineAttribution::hash).toList();
    List<Stamp> stamps = parse(stored);
    List<Instant> unknown = hashes.stream().map(ignored -> fallback).toList();
    if (stamps == null || !stamps.stream().map(Stamp::h).toList().equals(hashes)) return unknown;
    try {
      return stamps.stream().map(stamp -> Instant.parse(stamp.t())).toList();
    } catch (RuntimeException corrupt) {
      return unknown;
    }
  }

  /** The stored stamps for a new body, keeping the times of lines that survive the edit. */
  public static String next(String oldContent, String stored, Instant fallback, String newContent, Instant now) {
    List<String> oldHashes = lines(oldContent).stream().map(LineAttribution::hash).toList();
    List<Instant> oldTimes = times(oldContent, stored, fallback);
    List<String> newHashes = lines(newContent).stream().map(LineAttribution::hash).toList();
    Instant[] newTimes = new Instant[newHashes.size()];
    Arrays.fill(newTimes, now);
    align(oldHashes, newHashes, (oldIndex, newIndex) -> newTimes[newIndex] = oldTimes.get(oldIndex));
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

  interface Match {
    void at(int oldIndex, int newIndex);
  }

  // Longest common subsequence over the line hashes, after trimming the common head and tail.
  static void align(List<String> a, List<String> b, Match match) {
    int head = 0;
    while (head < a.size() && head < b.size() && a.get(head).equals(b.get(head))) {
      match.at(head, head);
      head++;
    }
    int tail = 0;
    while (tail < a.size() - head
        && tail < b.size() - head
        && a.get(a.size() - 1 - tail).equals(b.get(b.size() - 1 - tail))) {
      match.at(a.size() - 1 - tail, b.size() - 1 - tail);
      tail++;
    }
    int n = a.size() - head - tail, m = b.size() - head - tail;
    if (n == 0 || m == 0 || (long) n * m > MAX_ALIGNMENT_CELLS) return;
    int[][] lengths = new int[n + 1][m + 1];
    for (int i = n - 1; i >= 0; i--)
      for (int j = m - 1; j >= 0; j--)
        lengths[i][j] =
            a.get(head + i).equals(b.get(head + j))
                ? lengths[i + 1][j + 1] + 1
                : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    for (int i = 0, j = 0; i < n && j < m; ) {
      if (a.get(head + i).equals(b.get(head + j))) match.at(head + i++, head + j++);
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

  static String hash(String line) {
    try {
      byte[] digest = MessageDigest.getInstance("SHA-256").digest(line.getBytes(StandardCharsets.UTF_8));
      return HexFormat.of().formatHex(digest, 0, 8);
    } catch (NoSuchAlgorithmException impossible) {
      throw new IllegalStateException(impossible);
    }
  }
}
