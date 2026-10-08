package db.migration;

import com.know.domain.BoardCard;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.UUID;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

/**
 * Fills the plain-text copy of every board card body (body_text, added by V66 for search) the
 * way the server now derives it on save. Cards whose body has no text keep the empty default.
 */
public class V67__derive_board_card_body_text extends BaseJavaMigration {
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
            connection.prepareStatement("select id, body from board_cards");
        PreparedStatement update =
            connection.prepareStatement("update board_cards set body_text = ? where id = ?")) {
      // A cursor keeps memory flat on large tables; PostgreSQL needs a transaction for it.
      connection.setAutoCommit(false);
      select.setFetchSize(BATCH);
      int pending = 0;
      try (ResultSet rows = select.executeQuery()) {
        while (rows.next()) {
          String derived = BoardCard.bodyText(rows.getString("body"));
          if (derived.isEmpty()) continue;
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
