package db.migration;

import static org.junit.jupiter.api.Assertions.*;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class V67DeriveBoardCardBodyTextTest {
  private static final String RICH =
      "{\"type\":\"doc\",\"content\":["
          + "{\"type\":\"heading\",\"attrs\":{\"level\":2},\"content\":[{\"type\":\"text\",\"text\":\"Plan\"}]},"
          + "{\"type\":\"taskList\",\"content\":[{\"type\":\"taskItem\",\"attrs\":{\"checked\":true},\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Done\"}]}]}]}]}";

  private static void insert(Connection connection, UUID id, String body) throws Exception {
    try (PreparedStatement statement =
        connection.prepareStatement("insert into board_cards (id, body) values (?, ?)")) {
      statement.setObject(1, id);
      statement.setString(2, body);
      statement.executeUpdate();
    }
  }

  private static String text(Connection connection, UUID id) throws Exception {
    try (PreparedStatement statement =
        connection.prepareStatement("select body_text from board_cards where id = ?")) {
      statement.setObject(1, id);
      try (ResultSet row = statement.executeQuery()) {
        assertTrue(row.next());
        return row.getString(1);
      }
    }
  }

  @Test
  void fillsThePlainTextOfEveryCardBody() throws Exception {
    try (Connection connection =
        DriverManager.getConnection("jdbc:h2:mem:v67;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE", "sa", "")) {
      connection
          .createStatement()
          .execute("create table board_cards (id uuid primary key, body text not null, body_text text not null default '')");
      UUID rich = UUID.randomUUID(), empty = UUID.randomUUID(), legacy = UUID.randomUUID(), other = UUID.randomUUID();
      insert(connection, rich, RICH);
      insert(connection, empty, "{}");
      insert(connection, legacy, "  Legacy plain body\nsecond line ");
      insert(connection, other, "{\"type\":\"paragraph\"}");

      assertEquals(2, V67__derive_board_card_body_text.rewrite(connection));
      assertEquals("Plan\nDone", text(connection, rich));
      assertEquals("", text(connection, empty));
      assertEquals("Legacy plain body\nsecond line", text(connection, legacy));
      assertEquals("", text(connection, other));
      assertTrue(connection.getAutoCommit(), "the connection's auto-commit is restored");
    }
  }
}
