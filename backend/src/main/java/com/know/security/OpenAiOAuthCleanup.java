package com.know.security;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Prunes expired grants and consumed refresh fingerprints on OAuth-enabled deployments. */
@Component
@ConditionalOnProperty(prefix = "app.openai-oauth", name = "enabled", havingValue = "true")
public class OpenAiOAuthCleanup {
  private final JdbcTemplate jdbc;
  private final String clientId;

  public OpenAiOAuthCleanup(JdbcTemplate jdbc,
      @Value("${app.openai-oauth.client-id:knowledge-base-openai}") String clientId) {
    this.jdbc = jdbc;
    this.clientId = clientId;
  }

  @Scheduled(fixedDelayString = "${app.openai-oauth.cleanup-interval-ms:3600000}", initialDelay = 600000)
  public void removeExpiredState() {
    jdbc.update("delete from oauth2_authorization where coalesce(refresh_token_expires_at, access_token_expires_at, authorization_code_expires_at) < now()");
    jdbc.update("delete from oauth2_authorization_consent c "
        + "where c.registered_client_id=(select id from oauth2_registered_client where client_id=?) "
        + "and not exists (select 1 from oauth2_authorization a "
        + "where a.registered_client_id=c.registered_client_id and a.principal_name=c.principal_name "
        + "and coalesce(a.refresh_token_expires_at,a.access_token_expires_at,a.authorization_code_expires_at)>now())",
        clientId);
    // Retain replay fingerprints through the maximum refresh-token lifetime;
    // older fingerprints cannot identify a still-valid refresh credential.
    jdbc.update("delete from oauth2_refresh_token_history where consumed_at < ?",
        OffsetDateTime.now(ZoneOffset.UTC).minusDays(31));
  }
}
