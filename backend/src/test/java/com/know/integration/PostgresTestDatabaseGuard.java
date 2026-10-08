package com.know.integration;

import java.sql.DriverManager;
import java.sql.ResultSet;
import java.util.concurrent.atomic.AtomicBoolean;

/** Refuses to let an opt-in PostgreSQL suite migrate or seed an unverified database. */
final class PostgresTestDatabaseGuard {
  private static final AtomicBoolean VERIFIED = new AtomicBoolean();
  private static final String DISPOSABLE_FLAG = "KB_TEST_POSTGRES_DISPOSABLE";
  private static final String MODE_FLAG = "KB_TEST_POSTGRES_MODE";

  private PostgresTestDatabaseGuard() {}

  static synchronized void verifyFreshDisposableDatabase(String url) {
    if (VERIFIED.get()) return;
    if (!"true".equalsIgnoreCase(System.getenv(DISPOSABLE_FLAG))) {
      throw new IllegalStateException(
          "PostgreSQL integration tests require " + DISPOSABLE_FLAG + "=true for a disposable target");
    }

    String database = databaseName(url);
    if (!database.matches("kb_test_[a-z0-9_]{8,}")) {
      throw new IllegalStateException(
          "PostgreSQL integration tests require a unique database named kb_test_<unique-suffix>; found " + database);
    }
    String host = hostName(url);
    if (!"localhost".equals(host) && !"127.0.0.1".equals(host) && !"::1".equals(host)) {
      throw new IllegalStateException(
          "PostgreSQL integration tests only connect to a loopback host; found " + host);
    }

    String user = System.getenv().getOrDefault("KB_TEST_POSTGRES_USER", "postgres");
    String password = System.getenv().getOrDefault("KB_TEST_POSTGRES_PASSWORD", "");
    String mode = System.getenv().getOrDefault(MODE_FLAG, "empty");
    if (!mode.equals("empty") && !mode.equals("migrated")) {
      throw new IllegalStateException(MODE_FLAG + " must be either empty or migrated");
    }

    try (var connection = DriverManager.getConnection(url, user, password)) {
      try (var statement = connection.createStatement();
          ResultSet result = statement.executeQuery("select current_database(), version()")) {
        result.next();
        if (!database.equals(result.getString(1))) {
          throw new IllegalStateException("Configured PostgreSQL URL resolved to a different database");
        }
        System.out.println("PostgreSQL test target: " + result.getString(1));
        System.out.println("PostgreSQL version: " + result.getString(2));
      }
      if (mode.equals("empty")) {
        try (var statement = connection.createStatement();
            ResultSet result = statement.executeQuery(
                "select nspname from pg_namespace "
                    + "where nspname not in ('pg_catalog', 'information_schema', 'public') "
                    + "and nspname not like 'pg_toast%' and nspname not like 'pg_temp%' limit 1")) {
          if (result.next()) {
            throw new IllegalStateException(
                "PostgreSQL test database is not empty; found schema " + result.getString(1));
          }
        }
        try (var statement = connection.createStatement();
            ResultSet result = statement.executeQuery(
                "select n.nspname, c.relname from pg_class c "
                    + "join pg_namespace n on n.oid = c.relnamespace "
                    + "where n.nspname not in ('pg_catalog', 'information_schema') "
                    + "and n.nspname not like 'pg_toast%' "
                    + "and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f') limit 1")) {
          if (result.next()) {
            throw new IllegalStateException(
                "PostgreSQL test database is not empty; found "
                    + result.getString(1)
                    + "."
                    + result.getString(2));
          }
        }
        System.out.println("PostgreSQL empty-database check: passed");
      } else {
        try (var statement = connection.createStatement();
            ResultSet result = statement.executeQuery(
                "select version, success from public.flyway_schema_history order by installed_rank desc limit 1")) {
          if (!result.next() || !result.getBoolean(2)) {
            throw new IllegalStateException(
                "Migrated PostgreSQL test database requires a successful Flyway history");
          }
          System.out.println("PostgreSQL migrated-database check: Flyway version v" + result.getString(1));
        } catch (java.sql.SQLException missingHistory) {
          throw new IllegalStateException(
              "Migrated PostgreSQL test database has no readable Flyway history", missingHistory);
        }
      }
      VERIFIED.set(true);
    } catch (IllegalStateException failure) {
      throw failure;
    } catch (Exception failure) {
      throw new IllegalStateException("Could not verify disposable PostgreSQL test database", failure);
    }
  }

  private static String databaseName(String url) {
    if (url == null || !url.startsWith("jdbc:postgresql://")) {
      throw new IllegalStateException("KB_TEST_POSTGRES_URL must be a PostgreSQL JDBC URL");
    }
    int slash = url.lastIndexOf('/');
    if (slash < 0 || slash == url.length() - 1) {
      throw new IllegalStateException("KB_TEST_POSTGRES_URL must include a database name");
    }
    String name = url.substring(slash + 1).split("[?;]", 2)[0];
    if (name.isBlank()) throw new IllegalStateException("KB_TEST_POSTGRES_URL must include a database name");
    return name;
  }

  private static String hostName(String url) {
    try {
      return java.net.URI.create(url.substring("jdbc:".length())).getHost();
    } catch (RuntimeException failure) {
      throw new IllegalStateException("KB_TEST_POSTGRES_URL must contain a valid local host", failure);
    }
  }
}
