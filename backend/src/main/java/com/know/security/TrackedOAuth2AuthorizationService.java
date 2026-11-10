package com.know.security;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.server.authorization.OAuth2Authorization;
import org.springframework.security.oauth2.server.authorization.OAuth2AuthorizationService;
import org.springframework.security.oauth2.server.authorization.OAuth2TokenType;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest;
import org.springframework.transaction.annotation.Transactional;

/** Tracks consumed refresh-token fingerprints and revokes a grant if one is replayed. */
public class TrackedOAuth2AuthorizationService implements OAuth2AuthorizationService {
  private final OAuth2AuthorizationService delegate;
  private final JdbcTemplate jdbc;
  public TrackedOAuth2AuthorizationService(OAuth2AuthorizationService delegate, JdbcTemplate jdbc) {
    this.delegate = delegate; this.jdbc = jdbc;
  }

  @Override
  @Transactional
  public void save(OAuth2Authorization authorization) {
    String previous = jdbc.query("select refresh_token_value from oauth2_authorization where id=?",
        rs -> rs.next() ? rs.getString(1) : null, authorization.getId());
    String current = authorization.getRefreshToken() == null ? null : authorization.getRefreshToken().getToken().getTokenValue();
    if (previous != null && !previous.equals(current)) {
      jdbc.update("insert into oauth2_refresh_token_history(token_hash,authorization_id) values(?,?) on conflict do nothing",
          fingerprint(previous), authorization.getId());
    }
    String resource = authorizationResource(authorization);
    OAuth2Authorization persisted = authorization;
    // The original request is needed for PKCE while redeeming the code. Once
    // an access token exists, its audience is persisted separately and refresh
    // grants no longer need the request object. Dropping it also avoids
    // serializing JDK immutable collection implementation classes that Spring's
    // secure JDBC mapper intentionally refuses to deserialize.
    if (authorization.getAccessToken() != null
        && authorization.getAttribute(OAuth2AuthorizationRequest.class.getName()) != null) {
      persisted = OAuth2Authorization.from(authorization).attributes(attributes -> {
        attributes.remove(OAuth2AuthorizationRequest.class.getName());
      }).build();
    }
    delegate.save(persisted);
    if (resource != null) {
      jdbc.update(
          "insert into oauth2_authorization_resource(authorization_id,resource) values(?,?) "
              + "on conflict (authorization_id) do update set resource=excluded.resource",
          authorization.getId(),
          resource);
    }
  }

  @Override public void remove(OAuth2Authorization authorization) { delegate.remove(authorization); }
  @Override public OAuth2Authorization findById(String id) { return delegate.findById(id); }

  @Override
  @Transactional
  public OAuth2Authorization findByToken(String token, OAuth2TokenType tokenType) {
    if (tokenType == null || OAuth2TokenType.REFRESH_TOKEN.equals(tokenType)) {
      String grant = jdbc.query("select authorization_id from oauth2_refresh_token_history where token_hash=?",
          rs -> rs.next() ? rs.getString(1) : null, fingerprint(token));
      if (grant != null) {
        // Fail closed: replaying an old bearer credential is indistinguishable
        // from theft. Since only its fingerprint is retained, we cannot return
        // the rotated token after a successful refresh response was lost.
        jdbc.update("delete from oauth2_authorization where id=?", grant);
        return null;
      }
    }
    OAuth2Authorization authorization = delegate.findByToken(token, tokenType);
    if (authorization != null && tokenType != null
        && org.springframework.security.oauth2.core.endpoint.OAuth2ParameterNames.CODE.equals(tokenType.getValue())) {
      // Once redeemed, the PKCE request is intentionally removed from storage.
      // Hide an already-redeemed code from the client-authenticator so Spring
      // Authorization Server reports invalid_grant instead of trying to read
      // the missing request and returning HTTP 500. Leave expiry and other
      // authorization-code validation to Spring's normal grant validator.
      if (authorization.getAttribute(OAuth2AuthorizationRequest.class.getName()) == null) {
        // RFC 6749 §4.1.2 recommends revoking tokens issued from a replayed
        // code; deleting this authorization also invalidates its active tokens.
        delegate.remove(authorization);
        return null;
      }
    }
    return authorization;
  }

  private static String fingerprint(String token) {
    try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8))); }
    catch (Exception e) { throw new IllegalStateException("SHA-256 unavailable", e); }
  }

  private static String authorizationResource(OAuth2Authorization authorization) {
    OAuth2AuthorizationRequest request =
        authorization.getAttribute(OAuth2AuthorizationRequest.class.getName());
    if (request == null) return null;
    Object resource = request.getAdditionalParameters().get("resource");
    return resource instanceof String value && !value.isBlank() ? value : null;
  }
}
