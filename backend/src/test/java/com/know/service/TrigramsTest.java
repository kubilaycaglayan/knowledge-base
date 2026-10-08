package com.know.service;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

/** The Java model of pg_trgm's word_similarity agrees with PostgreSQL 16 on these cases. */
class TrigramsTest {
  private static void similar(double expected, String term, String text) {
    assertEquals(expected, Trigrams.wordSimilarity(term, text), 0.0001, term + " vs " + text);
  }

  @Test
  void matchesPostgresWordSimilarity() {
    // Values from: select word_similarity(term, text) on PostgreSQL 16 with pg_trgm.
    similar(0.8, "kubernets", "kubernetes cluster upgrade");
    similar(0.46666667, "kuberentes", "kubernetes cluster upgrade");
    similar(0.72727275, "photografy", "practised photography at dusk");
    similar(0.8181818, "photograpy", "practised photography at dusk");
    similar(0.5555556, "deepwrok", "deepwork");
    similar(0.25, "kbu", "kubernetes");
    similar(0.8, "word", "two words");
    similar(1, "heron", "mentions a heron in passing");
    similar(0.84615386, "isolatedabcx", "isolatedabcd");
  }

  @Test
  void isCaseInsensitiveAndIgnoresPunctuation() {
    similar(1, "HERON", "the heron, flying");
    similar(1, "heron", "(HERON)");
  }

  @Test
  void emptyAndMissingInputsScoreZero() {
    similar(0, "", "anything");
    similar(0, "   ", "anything");
    similar(0, "!!!", "anything");
    similar(0, "word", "");
    similar(0, null, "word");
    similar(0, "word", null);
  }
}
