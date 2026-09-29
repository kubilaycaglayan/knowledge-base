package com.know.security;

import static org.junit.jupiter.api.Assertions.*;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;
import javax.crypto.SecretKey;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

/** Token subject parsing used by the timer WebSocket (docs/test-hardening-plan.md, TH-12). */
class JwtTokenServiceTest {
  static final String SECRET = "unit-test-secret-with-at-least-32-characters";
  final JwtTokenService service =
      new JwtTokenService(new MockEnvironment().withProperty("app.jwt-secret", SECRET));

  static SecretKey key(String secret) {
    return Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
  }

  static String token(String subject, Instant expiresAt, SecretKey key) {
    return Jwts.builder().subject(subject).expiration(Date.from(expiresAt)).signWith(key).compact();
  }

  @Test
  void readsTheUserIdOfAValidToken() {
    UUID user = UUID.randomUUID();
    assertEquals(user, service.userId(token(user.toString(), Instant.now().plusSeconds(60), key(SECRET))));
  }

  @Test
  void rejectsForgedExpiredAndMalformedTokens() {
    String user = UUID.randomUUID().toString();
    Instant future = Instant.now().plusSeconds(60);
    for (String bad :
        new String[] {
          token(user, future, key("some-other-secret-with-at-least-32-chars")),
          token(user, Instant.now().minusSeconds(60), key(SECRET)),
          token("not-a-uuid", future, key(SECRET)),
          Jwts.builder().expiration(Date.from(future)).signWith(key(SECRET)).compact(),
          "not-a-jwt",
          "",
          null
        })
      assertThrows(IllegalArgumentException.class, () -> service.userId(bad), String.valueOf(bad));
  }
}
