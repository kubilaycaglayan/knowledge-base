package com.know.service;

import static org.junit.jupiter.api.Assertions.*;

import java.util.List;
import org.junit.jupiter.api.Test;

class SearchServiceTextTest {
  @Test
  void termsSplitOnWhitespaceDropDuplicatesAndStopAtTheCap() {
    assertEquals(List.of("Alpha", "beta"), SearchService.terms("  Alpha\tbeta\n alpha  BETA "));
    assertEquals(List.of(), SearchService.terms("   "));
    assertEquals(
        List.of("1", "2", "3", "4", "5", "6", "7", "8"), SearchService.terms("1 2 3 4 5 6 7 8 9 10"));
  }

  @Test
  void likeWildcardsAndTheEscapeCharacterAreEscaped() {
    assertEquals("100\\%", SearchService.escapeLike("100%"));
    assertEquals("snake\\_case", SearchService.escapeLike("snake_case"));
    assertEquals("c:\\\\temp", SearchService.escapeLike("c:\\temp"));
    assertEquals("plain", SearchService.escapeLike("plain"));
  }

  @Test
  void shortTextIsItsOwnSnippetOnOneLine() {
    assertEquals("one two three", SearchService.snippet("one\n\ntwo   three ", List.of("two")));
    assertNull(SearchService.snippet("  \n ", List.of("x")));
  }

  @Test
  void longTextIsCutAroundTheEarliestMatch() {
    String before = "a".repeat(10) + " " + "word ".repeat(60);
    String text = before + "TARGET found here " + "tail ".repeat(60);
    String snippet = SearchService.snippet(text, List.of("missing", "target"));
    assertTrue(snippet.startsWith("…"));
    assertTrue(snippet.endsWith("…"));
    assertTrue(snippet.contains("TARGET found here"));
    assertTrue(snippet.length() <= SearchService.SNIPPET_LENGTH + 2, snippet);
    // Cut at spaces, so no partial words at the ends.
    assertFalse(snippet.startsWith("…ord"), snippet);
  }

  @Test
  void longTextWithoutALiteralMatchStartsAtTheBeginning() {
    String text = "start " + "x ".repeat(200);
    String snippet = SearchService.snippet(text, List.of("absent"));
    assertTrue(snippet.startsWith("start"));
    assertTrue(snippet.endsWith("…"));
  }

  @Test
  void matchNearTheEndKeepsAFullWindow() {
    String text = "word ".repeat(100) + "finale";
    String snippet = SearchService.snippet(text, List.of("finale"));
    assertTrue(snippet.endsWith("finale"), snippet);
    assertTrue(snippet.length() > SearchService.SNIPPET_LENGTH - 10, snippet);
  }

  @Test
  void snippetsNeverSplitASurrogatePair() {
    String text = "🎉".repeat(200);
    String snippet = SearchService.snippet(text, List.of("🎉"));
    for (int i = 0; i < snippet.length(); i++) {
      char c = snippet.charAt(i);
      if (Character.isHighSurrogate(c)) assertTrue(Character.isLowSurrogate(snippet.charAt(i + 1)));
      if (Character.isLowSurrogate(c)) assertTrue(Character.isHighSurrogate(snippet.charAt(i - 1)));
    }
  }

  @Test
  void clipShortensWithAnEllipsis() {
    assertEquals("short", SearchService.clip("short", 10));
    assertEquals("abcdefghi…", SearchService.clip("abcdefghijklmnop", 10));
    String clipped = SearchService.clip("a" + "🎉".repeat(20), 10);
    assertFalse(Character.isHighSurrogate(clipped.charAt(clipped.length() - 2)), clipped);
  }

  @Test
  void firstLineSkipsBlankLines() {
    assertEquals("hello", SearchService.firstLine("\n  \r\n  hello  \nworld"));
    assertEquals("", SearchService.firstLine(" \n "));
    assertEquals("", SearchService.firstLine(null));
  }

  @Test
  void indexOfIgnoreCaseFindsAnyCase() {
    assertEquals(4, SearchService.indexOfIgnoreCase("the Über café", "über"));
    assertEquals(-1, SearchService.indexOfIgnoreCase("abc", "abcd"));
  }
}
