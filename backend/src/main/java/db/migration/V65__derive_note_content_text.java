package db.migration;

import com.know.domain.LineAttribution;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.Objects;
import java.util.UUID;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

/**
 * Rewrites each document note's plain-text copy (content_text, used for search and excerpts) as
 * the server now derives it: one line per body line, without task checkboxes. Older web clients
 * stored copies with blank lines between blocks, and the extension stored Markdown. Legacy
 * plain-text bodies keep their copy; only rows whose copy changes are written.
 */
public class V65__derive_note_content_text extends BaseJavaMigration {
  private static final int BATCH = 500;

  @Override
  public void migrate(Context context) throws Exception {
    rewrite(context.getConnection());
  }

  /** Returns how many rows were rewritten. */
  static int rewrite(Connection connection) throws Exception {
    int rewritten = 0;
    boolean autoCommit = connection.getAutoCommit();
    try (PreparedStatement select =
            connection.prepareStatement(
                "select id, content, content_text from note where content like '{%'");
        PreparedStatement update =
            connection.prepareStatement("update note set content_text = ? where id = ?")) {
      // A cursor keeps memory flat on large tables; PostgreSQL needs a transaction for it.
      connection.setAutoCommit(false);
      select.setFetchSize(BATCH);
      int pending = 0;
      try (ResultSet rows = select.executeQuery()) {
        while (rows.next()) {
          String derived = LineAttribution.plainText(rows.getString("content"));
          if (derived == null || Objects.equals(derived, rows.getString("content_text"))) continue;
          update.setString(1, derived);
          update.setObject(2, rows.getObject("id", UUID.class));
          update.addBatch();
          rewritten++;
          if (++pending == BATCH) {
            update.executeBatch();
            pending = 0;
          }
        }
      }
      if (pending > 0) update.executeBatch();
    } finally {
      if (autoCommit) connection.setAutoCommit(true);
    }
    return rewritten;
  }
}
