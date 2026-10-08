package com.know.integration;

import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * Runs the global search suite against a real PostgreSQL database migrated by Flyway, so the
 * pg_trgm operators and trigram indexes are exercised as in production. Opt in by pointing
 * KB_TEST_POSTGRES_URL (plus KB_TEST_POSTGRES_USER and KB_TEST_POSTGRES_PASSWORD) at an empty,
 * disposable database; see docs/testing.md.
 */
@EnabledIfEnvironmentVariable(named = "KB_TEST_POSTGRES_URL", matches = ".+")
class SearchPostgresIntegrationTest extends SearchIntegrationTest {
  @DynamicPropertySource
  static void usePostgres(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", () -> System.getenv("KB_TEST_POSTGRES_URL"));
    registry.add("spring.datasource.driver-class-name", () -> "org.postgresql.Driver");
    registry.add("spring.datasource.username", () -> System.getenv().getOrDefault("KB_TEST_POSTGRES_USER", "postgres"));
    registry.add("spring.datasource.password", () -> System.getenv().getOrDefault("KB_TEST_POSTGRES_PASSWORD", ""));
    registry.add("spring.jpa.hibernate.ddl-auto", () -> "validate");
    registry.add("spring.flyway.enabled", () -> "true");
  }
}
