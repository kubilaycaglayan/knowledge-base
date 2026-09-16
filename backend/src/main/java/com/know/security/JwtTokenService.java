package com.know.security;

import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import javax.crypto.SecretKey;
import org.springframework.stereotype.Component;

@Component
public class JwtTokenService {
  private final SecretKey key;

  public JwtTokenService(org.springframework.core.env.Environment environment) {
    String secret = environment.getProperty("app.jwt-secret", "");
    key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
  }

  public UUID userId(String token) {
    try {
      return UUID.fromString(
          Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload().getSubject());
    } catch (JwtException | IllegalArgumentException ex) {
      throw new IllegalArgumentException("Invalid JWT", ex);
    }
  }
}
