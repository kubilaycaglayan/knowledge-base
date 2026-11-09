package com.know.api;

import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/mcp-tokens")
public class McpTokenController {
  public static final List<String> CATEGORIES = List.of("notes", "logs", "calendar", "sessions", "activity", "reports", "paths", "labels", "boards");
  private static final SecureRandom RANDOM = new SecureRandom();
  private final JdbcTemplate jdbc;

  public McpTokenController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

  public record TokenView(UUID id, String name, List<String> categories, Instant createdAt,
                          Instant expiresAt, Instant lastUsedAt) {}
  public record CreateRequest(String name, List<String> categories, String expiry) {}
  public record CreatedToken(TokenView token, String secret) {}

  @GetMapping
  public List<TokenView> list(Authentication auth) {
    return jdbc.query("select id,name,categories,created_at,expires_at,last_used_at from mcp_access_token where user_id=? and revoked_at is null order by created_at desc",
        (rs, n) -> new TokenView(rs.getObject("id", UUID.class), rs.getString("name"), Arrays.asList((String[])rs.getArray("categories").getArray()), rs.getTimestamp("created_at").toInstant(), rs.getTimestamp("expires_at").toInstant(), rs.getTimestamp("last_used_at") == null ? null : rs.getTimestamp("last_used_at").toInstant()), UUID.fromString(auth.getName()));
  }

  @PostMapping
  public CreatedToken create(Authentication auth, @RequestBody CreateRequest request) throws Exception {
    String name = request.name() == null ? "" : request.name().trim();
    if (name.isEmpty() || name.length() > 100) throw new IllegalArgumentException("Token name must be between 1 and 100 characters");
    List<String> categories = request.categories() == null ? CATEGORIES : request.categories().stream().distinct().toList();
    if (!CATEGORIES.containsAll(categories)) throw new IllegalArgumentException("Select valid categories");
    int months = switch (Objects.toString(request.expiry(), "one_month")) {
      case "one_week" -> 0; case "one_month" -> 1; case "four_months" -> 4; case "one_year" -> 12;
      default -> throw new IllegalArgumentException("Invalid expiry choice");
    };
    Instant now = Instant.now();
    Instant expires = months == 0 ? now.plus(7, ChronoUnit.DAYS) : now.plus(months, ChronoUnit.MONTHS);
    byte[] bytes = new byte[32]; RANDOM.nextBytes(bytes);
    String secret = "kb_mcp_" + Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    String hash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(secret.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
    UUID id = UUID.randomUUID();
    jdbc.execute((org.springframework.jdbc.core.ConnectionCallback<Void>) connection -> {
      try (var statement = connection.prepareStatement("insert into mcp_access_token(id,user_id,name,token_hash,categories,expires_at) values(?,?,?,?,?,?)")) {
        statement.setObject(1,id); statement.setObject(2,UUID.fromString(auth.getName())); statement.setString(3,name); statement.setString(4,hash);
        statement.setArray(5,connection.createArrayOf("text",categories.toArray())); statement.setTimestamp(6,java.sql.Timestamp.from(expires)); statement.executeUpdate();
      }
      return null;
    });
    return new CreatedToken(new TokenView(id,name,categories,now,expires,null),secret);
  }

  @DeleteMapping("/{id}")
  public void revoke(Authentication auth, @PathVariable UUID id) {
    jdbc.update("update mcp_access_token set revoked_at=now() where id=? and user_id=? and revoked_at is null", id, UUID.fromString(auth.getName()));
  }
}
