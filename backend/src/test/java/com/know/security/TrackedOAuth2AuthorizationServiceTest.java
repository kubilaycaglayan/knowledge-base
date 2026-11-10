package com.know.security;

import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.ResultSetExtractor;
import org.springframework.security.oauth2.core.endpoint.OAuth2ParameterNames;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest;
import org.springframework.security.oauth2.server.authorization.OAuth2Authorization;
import org.springframework.security.oauth2.server.authorization.OAuth2AuthorizationService;
import org.springframework.security.oauth2.server.authorization.OAuth2TokenType;

class TrackedOAuth2AuthorizationServiceTest {
  @Test
  void redeemedCodeWithoutStoredPkceRequestIsRejectedAndAuthorizationRemoved() {
    JdbcTemplate jdbc = mock(JdbcTemplate.class);
    OAuth2AuthorizationService delegate = mock(OAuth2AuthorizationService.class);
    OAuth2Authorization authorization = mock(OAuth2Authorization.class);
    when(delegate.findByToken("redeemed-code", new OAuth2TokenType(OAuth2ParameterNames.CODE)))
        .thenReturn(authorization);
    when(authorization.getAttribute(OAuth2AuthorizationRequest.class.getName())).thenReturn(null);

    var service = new TrackedOAuth2AuthorizationService(delegate, jdbc);
    var result = service.findByToken("redeemed-code", new OAuth2TokenType(OAuth2ParameterNames.CODE));

    assertNull(result);
    verify(delegate).remove(authorization);
  }

  @Test
  void consumedRefreshTokenRevokesItsAuthorization() throws Exception {
    JdbcTemplate jdbc = mock(JdbcTemplate.class);
    OAuth2AuthorizationService delegate = mock(OAuth2AuthorizationService.class);
    String token = "consumed-refresh-token";
    String hash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
        .digest(token.getBytes(StandardCharsets.UTF_8)));
    when(jdbc.query(anyString(), any(ResultSetExtractor.class), eq(hash))).thenReturn("grant-1");

    var service = new TrackedOAuth2AuthorizationService(delegate, jdbc);
    var result = service.findByToken(token, OAuth2TokenType.REFRESH_TOKEN);

    assertNull(result);
    verify(jdbc).update("delete from oauth2_authorization where id=?", "grant-1");
  }
}
