package com.know.security;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

class OpenAiOAuthCleanupTest {
  @Test
  void prunesConsentOnlyWhenTheOpenAiClientHasNoLiveGrantForThatPrincipal() {
    DriverManagerDataSource dataSource = new DriverManagerDataSource(
        "jdbc:h2:mem:openai_oauth_cleanup;MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "sa", "");
    JdbcTemplate jdbc = new JdbcTemplate(dataSource);
    jdbc.execute("create table oauth2_registered_client (id varchar(100) primary key, client_id varchar(100) not null)");
    jdbc.execute("create table oauth2_authorization (id varchar(100) primary key, registered_client_id varchar(100) not null, "
        + "principal_name varchar(200) not null, refresh_token_expires_at timestamp with time zone, "
        + "access_token_expires_at timestamp with time zone, authorization_code_expires_at timestamp with time zone)");
    jdbc.execute("create table oauth2_authorization_consent (registered_client_id varchar(100) not null, "
        + "principal_name varchar(200) not null, authorities varchar(1000) not null, "
        + "primary key (registered_client_id, principal_name))");
    jdbc.execute("create table oauth2_refresh_token_history (consumed_at timestamp with time zone not null)");
    jdbc.update("insert into oauth2_registered_client(id,client_id) values('registered-plugin','plugin-client')");
    jdbc.update("insert into oauth2_authorization values(?,?,?,?,?,?)", "expired-grant",
        "registered-plugin", "expired-user", OffsetDateTime.now(ZoneOffset.UTC).minusDays(1), null, null);
    jdbc.update("insert into oauth2_authorization values(?,?,?,?,?,?)", "active-grant",
        "registered-plugin", "active-user", OffsetDateTime.now(ZoneOffset.UTC).plusDays(1), null, null);
    jdbc.update("insert into oauth2_authorization_consent values('registered-plugin','expired-user','notes')");
    jdbc.update("insert into oauth2_authorization_consent values('registered-plugin','active-user','notes')");
    jdbc.update("insert into oauth2_authorization_consent values('registered-plugin','orphan-user','notes')");

    new OpenAiOAuthCleanup(jdbc, "plugin-client").removeExpiredState();

    assertEquals(0, jdbc.queryForObject("select count(*) from oauth2_authorization where principal_name='expired-user'", Integer.class));
    assertEquals(1, jdbc.queryForObject("select count(*) from oauth2_authorization where principal_name='active-user'", Integer.class));
    assertEquals(0, jdbc.queryForObject("select count(*) from oauth2_authorization_consent where principal_name='expired-user'", Integer.class));
    assertEquals(1, jdbc.queryForObject("select count(*) from oauth2_authorization_consent where principal_name='active-user'", Integer.class));
    assertEquals(0, jdbc.queryForObject("select count(*) from oauth2_authorization_consent where principal_name='orphan-user'", Integer.class));
  }
}
