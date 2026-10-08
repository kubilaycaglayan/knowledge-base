package com.know.integration;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * Shared configuration for the full-application integration tests. Every subclass reuses one
 * cached Spring context (one server and one database) instead of booting its own. Local tests use
 * in-memory H2; the opt-in profile uses guarded PostgreSQL. Tests stay independent because each
 * one registers fresh, randomly named users and scopes data to its owner.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
abstract class IntegrationTestSupport {
  @DynamicPropertySource
  static void configureDataSource(DynamicPropertyRegistry registry) {
    String postgresUrl = System.getenv("KB_TEST_POSTGRES_URL");
    if (postgresUrl != null && !postgresUrl.isBlank()) {
      PostgresTestDatabaseGuard.verifyFreshDisposableDatabase(postgresUrl);
      registry.add("spring.datasource.url", () -> postgresUrl);
      registry.add("spring.datasource.driver-class-name", () -> "org.postgresql.Driver");
      registry.add(
          "spring.datasource.username",
          () -> System.getenv().getOrDefault("KB_TEST_POSTGRES_USER", "postgres"));
      registry.add(
          "spring.datasource.password",
          () -> System.getenv().getOrDefault("KB_TEST_POSTGRES_PASSWORD", ""));
      registry.add("spring.jpa.hibernate.ddl-auto", () -> "validate");
      registry.add("spring.flyway.enabled", () -> "true");
    } else {
      registry.add(
          "spring.datasource.url",
          () ->
              "jdbc:h2:mem:know_integration;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1"
                  // Stands in for pg_trgm's word_similarity, which global search uses for near misses.
                  + ";INIT=CREATE ALIAS IF NOT EXISTS word_similarity FOR 'com.know.service.Trigrams.wordSimilarity'");
      registry.add("spring.datasource.driver-class-name", () -> "org.h2.Driver");
      registry.add("spring.datasource.username", () -> "sa");
      registry.add("spring.datasource.password", () -> "");
      registry.add("spring.jpa.hibernate.ddl-auto", () -> "create-drop");
      registry.add("spring.flyway.enabled", () -> "false");
    }
    registry.add("app.jwt-secret", () -> "integration-test-secret-with-enough-chars-123");
    registry.add("app.cors-origins", () -> "http://localhost");
    registry.add("app.google-client-id", () -> "");
  }
}
