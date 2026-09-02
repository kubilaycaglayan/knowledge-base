package com.know.api;

import com.know.domain.*;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.*;
import javax.crypto.SecretKey;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
  private final UserRepository users;
  private final PasswordEncoder encoder;
  private final com.know.security.AuthAttemptLimiter limiter;
  private final com.know.security.GoogleIdentityVerifier google;
  private final SecretKey key;
  private static final SecureRandom RANDOM = new SecureRandom();

  public AuthController(
      UserRepository users,
      PasswordEncoder encoder,
      com.know.security.AuthAttemptLimiter limiter,
      com.know.security.GoogleIdentityVerifier google,
      @Value("${app.jwt-secret}") String secret) {
    this.users = users;
    this.encoder = encoder;
    this.limiter = limiter;
    this.google = google;
    this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
  }

  record Credentials(
      @Email @NotBlank String email, @NotBlank @Size(min = 12, max = 200) String password) {}

  record GoogleRequest(@NotBlank @Size(max = 10000) String idToken) {}

  record GoogleConfig(String clientId) {}

  record AuthResponse(String token, UUID userId, String email, String displayName) {}

  @GetMapping("/google/config")
  public GoogleConfig googleConfig(@Value("${app.google-client-id:}") String clientId) {
    return new GoogleConfig(clientId == null ? "" : clientId.trim());
  }

  @PostMapping("/register")
  public AuthResponse register(
      @Valid @RequestBody Credentials c, jakarta.servlet.http.HttpServletRequest request) {
    String email = c.email().trim().toLowerCase(Locale.ROOT);
    checkRate(request, email);
    if (users.findByEmailIgnoreCase(email).isPresent())
      throw new ResponseStatusException(HttpStatus.CONFLICT, "Email already registered");
    User u =
        users.save(
            new User(email, encoder.encode(c.password()), email.substring(0, email.indexOf('@'))));
    return response(u);
  }

  @PostMapping("/login")
  public AuthResponse login(
      @Valid @RequestBody Credentials c, jakarta.servlet.http.HttpServletRequest request) {
    String email = c.email().trim().toLowerCase(Locale.ROOT);
    checkRate(request, email);
    User u =
        users
            .findByEmailIgnoreCase(email)
            .filter(x -> encoder.matches(c.password(), x.getPasswordHash()))
            .orElseThrow(
                () -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid credentials"));
    return response(u);
  }

  @PostMapping("/google")
  public AuthResponse google(
      @Valid @RequestBody GoogleRequest request,
      jakarta.servlet.http.HttpServletRequest httpRequest) {
    checkRate(httpRequest, "google");
    var identity =
        google
            .verify(request.idToken())
            .orElseThrow(
                () ->
                    new ResponseStatusException(
                        HttpStatus.UNAUTHORIZED, "Invalid Google identity token"));
    User user =
        users
            .findByGoogleSubject(identity.subject())
            .orElseGet(() -> users.findByEmailIgnoreCase(identity.email()).orElse(null));
    if (user == null) {
      byte[] random = new byte[32];
      RANDOM.nextBytes(random);
      user =
          new User(
              identity.email(),
              encoder.encode(Base64.getUrlEncoder().withoutPadding().encodeToString(random)),
              identity.displayName());
    } else if (user.getGoogleSubject() != null
        && !user.getGoogleSubject().equals(identity.subject())) {
      throw new ResponseStatusException(
          HttpStatus.UNAUTHORIZED, "Google account is already linked");
    }
    user.linkGoogleSubject(identity.subject());
    return response(users.save(user));
  }

  private void checkRate(jakarta.servlet.http.HttpServletRequest request, String email) {
    if (!limiter.allow(request.getRemoteAddr() + "|" + email))
      throw new ResponseStatusException(
          HttpStatus.TOO_MANY_REQUESTS, "Too many authentication attempts; try again shortly");
  }

  private AuthResponse response(User u) {
    String token =
        Jwts.builder()
            .subject(u.getId().toString())
            .claim("email", u.getEmail())
            .issuedAt(new Date())
            .expiration(Date.from(Instant.now().plusSeconds(86400 * 30)))
            .signWith(key)
            .compact();
    return new AuthResponse(token, u.getId(), u.getEmail(), u.getDisplayName());
  }
}
