package com.know.api;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.mockito.ArgumentMatchers;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.web.server.ResponseStatusException;

class OpenAiConnectionControllerTest {
  @Test
  void statusReportsOAuthFeatureAvailability() {
    var enabled = new OpenAiConnectionController(mock(JdbcTemplate.class), true);
    var disabled = new OpenAiConnectionController(mock(JdbcTemplate.class), false);

    assertTrue(enabled.status().enabled());
    assertFalse(disabled.status().enabled());
  }

  @Test
  void listScopesOAuthGrantsToTheAuthenticatedPrincipal() {
    JdbcTemplate jdbc = mock(JdbcTemplate.class);
    var expected = new OpenAiConnectionController.Connection(
        UUID.randomUUID(), "Recall Personal Knowledge Base", "kb:notes:read", List.of("Notes"), Instant.now());
    when(jdbc.query(anyString(), ArgumentMatchers.<RowMapper<OpenAiConnectionController.Connection>>any(),
        eq("owner-1"))).thenReturn(List.of(expected));
    var controller = new OpenAiConnectionController(jdbc, true);

    var result = controller.list(new TestingAuthenticationToken("owner-1", ""));

    assertEquals(List.of(expected), result);
    verify(jdbc).query(contains("where a.principal_name=?"),
        ArgumentMatchers.<RowMapper<OpenAiConnectionController.Connection>>any(), eq("owner-1"));
  }

  @Test
  void revokeDeletesOnlyTheAuthenticatedUsersGrant() {
    JdbcTemplate jdbc = mock(JdbcTemplate.class);
    UUID grantId = UUID.randomUUID();
    when(jdbc.query(contains("select registered_client_id"),
        ArgumentMatchers.<RowMapper<String>>any(), eq(grantId.toString()), eq("owner-1")))
        .thenReturn(List.of("registered-client-1"));
    when(jdbc.update(anyString(), eq(grantId.toString()), eq("owner-1"))).thenReturn(1);
    var controller = new OpenAiConnectionController(jdbc, true);

    controller.revoke(new TestingAuthenticationToken("owner-1", ""), grantId.toString());

    verify(jdbc).update(contains("where id=? and principal_name=?"),
        eq(grantId.toString()), eq("owner-1"));
    verify(jdbc).update(contains("delete from oauth2_authorization_consent"),
        eq("registered-client-1"), eq("owner-1"));
  }

  @Test
  void revokeHidesUnknownOrForeignGrantsAsNotFound() {
    JdbcTemplate jdbc = mock(JdbcTemplate.class);
    when(jdbc.query(anyString(), ArgumentMatchers.<RowMapper<String>>any(), any(), any()))
        .thenReturn(List.of());
    var controller = new OpenAiConnectionController(jdbc, true);

    var error = assertThrows(ResponseStatusException.class,
        () -> controller.revoke(new TestingAuthenticationToken("owner-1", ""), UUID.randomUUID().toString()));

    assertEquals(404, error.getStatusCode().value());
  }
}
