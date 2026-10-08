package db.migration;

import static org.junit.jupiter.api.Assertions.*;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class V65DeriveNoteContentTextTest {
  private static final String RICH =
      "{\"type\":\"doc\",\"content\":["
          + "{\"type\":\"heading\",\"attrs\":{\"level\":2},\"content\":[{\"type\":\"text\",\"text\":\"Plan\"}]},"
          + "{\"type\":\"bulletList\",\"content\":[{\"type\":\"listItem\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Item\"}]}]}]},"
          + "{\"type\":\"taskList\",\"content\":[{\"type\":\"taskItem\",\"attrs\":{\"checked\":true},\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Done\"}]}]}]}]}";

  private static void insert(Connection connection, UUID id, String content, String copy) throws Exception {
    try (PreparedStatement statement = connection.prepareStatement("insert into note (id, content, content_text) values (?, ?, ?)")) {
      statement.setObject(1, id);
      statement.setString(2, content);
      statement.setString(3, copy);
      statement.executeUpdate();
    }
  }

  private static String copy(Connection connection, UUID id) throws Exception {
    try (PreparedStatement statement = connection.prepareStatement("select content_text from note where id = ?")) {
      statement.setObject(1, id);
      try (ResultSet row = statement.executeQuery()) {
        assertTrue(row.next());
        return row.getString(1);
      }
    }
  }

  @Test
  void rewritesDocumentCopiesAndLeavesLegacyTextAlone() throws Exception {
    try (Connection connection = DriverManager.getConnection("jdbc:h2:mem:v65;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE", "sa", "")) {
      connection.createStatement().execute("create table note (id uuid primary key, content text not null, content_text text)");
      UUID stale = UUID.randomUUID(), markdown = UUID.randomUUID(), current = UUID.randomUUID(), legacy = UUID.randomUUID(), missing = UUID.randomUUID();
      insert(connection, stale, RICH, "Plan\n\n\nItem\n\n\nDone");
      insert(connection, markdown, RICH, "Plan\n- Item\nDone");
      insert(connection, current, RICH, "Plan\nItem\nDone");
      insert(connection, legacy, "Plain legacy text", "Plain legacy text");
      insert(connection, missing, RICH, null);

      assertEquals(3, V65__derive_note_content_text.rewrite(connection));
      assertEquals("Plan\nItem\nDone", copy(connection, stale));
      assertEquals("Plan\nItem\nDone", copy(connection, markdown));
      assertEquals("Plan\nItem\nDone", copy(connection, current));
      assertEquals("Plain legacy text", copy(connection, legacy));
      assertEquals("Plan\nItem\nDone", copy(connection, missing));
      assertTrue(connection.getAutoCommit(), "the connection's auto-commit is restored");
      // Running it again changes nothing.
      assertEquals(0, V65__derive_note_content_text.rewrite(connection));
    }
  }
}
