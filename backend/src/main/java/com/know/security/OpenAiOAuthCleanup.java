package com.know.security;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Prunes expired grants and consumed refresh fingerprints on OAuth-enabled deployments. */
@Component
@ConditionalOnProperty(prefix = "app.openai-oauth", name = "enabled", havingValue = "true")
public class OpenAiOAuthCleanup {
  private final JdbcTemplate jdbc;

  public OpenAiOAuthCleanup(JdbcTemplate jdbc) { this.jdbc = jdbc; }

  @Scheduled(fixedDelayString = "${app.openai-oauth.cleanup-interval-ms:3600000}", initialDelay = 600000)
  public void removeExpiredState() {
    jdbc.update("delete from oauth2_authorization where coalesce(refresh_token_expires_at, access_token_expires_at, authorization_code_expires_at) < now()");
    // Retain replay fingerprints through the maximum refresh-token lifetime;
    // older fingerprints cannot identify a still-valid refresh credential.
    jdbc.update("delete from oauth2_refresh_token_history where consumed_at < now() - interval '31 days'");
  }
}
