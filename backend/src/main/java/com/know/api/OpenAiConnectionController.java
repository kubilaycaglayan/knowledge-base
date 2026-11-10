package com.know.api;

import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/openai-connections")
public class OpenAiConnectionController {
  private final JdbcTemplate jdbc;
  public OpenAiConnectionController(JdbcTemplate jdbc) { this.jdbc = jdbc; }
  public record Connection(UUID id, String clientName, String scopes, java.time.Instant expiresAt) {}

  @GetMapping
  public List<Connection> list(Authentication auth) {
    return jdbc.query("select a.id,c.client_name,a.authorized_scopes,a.access_token_expires_at from oauth2_authorization a join oauth2_registered_client c on c.id=a.registered_client_id where a.principal_name=? order by a.access_token_expires_at desc",
        (rs,n) -> new Connection(UUID.fromString(rs.getString(1)),rs.getString(2),rs.getString(3),
          rs.getTimestamp(4)==null?null:rs.getTimestamp(4).toInstant()), auth.getName());
  }

  @DeleteMapping("/{id}")
  public void revoke(Authentication auth, @PathVariable String id) {
    int count = jdbc.update("delete from oauth2_authorization where id=? and principal_name=?", id, auth.getName());
    if (count == 0) throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND);
  }
}
