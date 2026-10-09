package com.know.integration;

import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

/**
 * Keeps a named PostgreSQL search test in test reports. When PostgreSQL is configured, the shared
 * integration harness runs every integration suite against the same guarded, Flyway-migrated DB.
 */
@EnabledIfEnvironmentVariable(named = "KB_TEST_POSTGRES_URL", matches = ".+")
class SearchPostgresIntegrationTest extends SearchIntegrationTest {
}
