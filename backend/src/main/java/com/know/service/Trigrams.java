package com.know.service;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * A Java model of pg_trgm's word similarity, used where PostgreSQL is not available (the H2
 * integration tests register it as {@code word_similarity}). Like pg_trgm, text is lower-cased and
 * split into alphanumeric words, and each word is padded with two leading spaces and one trailing
 * space before it is cut into trigrams.
 */
public final class Trigrams {
  private Trigrams() {}

  /**
   * How well {@code term} matches the best-matching part of a word of {@code text}, from 0 to 1:
   * the Jaccard similarity between the term's trigrams and the best contiguous run of the word's
   * trigrams, as pg_trgm computes it. pg_trgm also lets that run cross word boundaries; a single
   * search term rarely needs that.
   */
  public static double wordSimilarity(String term, String text) {
    if (term == null || text == null) return 0;
    Set<String> wanted = trigrams(term);
    if (wanted.isEmpty()) return 0;
    double best = 0;
    for (String word : words(text)) {
      List<String> ordered = orderedTrigrams(word);
      for (int from = 0; from < ordered.size(); from++) {
        Set<String> extent = new HashSet<>();
        int common = 0;
        for (int to = from; to < ordered.size(); to++) {
          String trigram = ordered.get(to);
          if (extent.add(trigram) && wanted.contains(trigram)) common++;
          best = Math.max(best, (double) common / (wanted.size() + extent.size() - common));
        }
      }
      if (best == 1) break;
    }
    return best;
  }

  static Set<String> trigrams(String text) {
    Set<String> out = new HashSet<>();
    for (String word : words(text)) out.addAll(trigramsOfWord(word));
    return out;
  }

  private static Set<String> trigramsOfWord(String word) {
    return new HashSet<>(orderedTrigrams(word));
  }

  private static List<String> orderedTrigrams(String word) {
    String padded = "  " + word + " ";
    List<String> out = new ArrayList<>();
    for (int i = 0; i + 3 <= padded.length(); i++) out.add(padded.substring(i, i + 3));
    return out;
  }

  private static String[] words(String text) {
    String lower = text.toLowerCase(Locale.ROOT);
    StringBuilder normalized = new StringBuilder(lower.length());
    lower.codePoints().forEach(c -> normalized.appendCodePoint(Character.isLetterOrDigit(c) ? c : ' '));
    String trimmed = normalized.toString().trim();
    return trimmed.isEmpty() ? new String[0] : trimmed.split("\\s+");
  }
}
