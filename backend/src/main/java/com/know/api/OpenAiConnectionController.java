package com.know.api;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.session.Session;
import org.springframework.session.SessionRepository;
import org.springframework.session.web.http.CookieSerializer;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/openai-connections")
public class OpenAiConnectionController {
  private final JdbcTemplate jdbc;
  private final boolean enabled;
  private final ObjectProvider<SessionRepository<? extends Session>> sessionRepositories;
  private final ObjectProvider<CookieSerializer> cookieSerializers;

  @Autowired
  public OpenAiConnectionController(JdbcTemplate jdbc,
      @Value("${app.openai-oauth.enabled:false}") boolean enabled,
      ObjectProvider<SessionRepository<? extends Session>> sessionRepositories,
      ObjectProvider<CookieSerializer> cookieSerializers) {
    this.jdbc = jdbc;
    this.enabled = enabled;
    this.sessionRepositories = sessionRepositories;
    this.cookieSerializers = cookieSerializers;
  }

  public OpenAiConnectionController(JdbcTemplate jdbc, boolean enabled) {
    this.jdbc = jdbc;
    this.enabled = enabled;
    this.sessionRepositories = null;
    this.cookieSerializers = null;
  }
  public record Connection(UUID id, String clientName, String scopes, java.util.List<String> scopeLabels,
      java.time.Instant expiresAt, String label) {}
  public record Availability(boolean enabled) {}

  @io.swagger.v3.oas.annotations.Operation(summary = "Report OpenAI OAuth connection availability")
  @GetMapping("/status")
  public Availability status() { return new Availability(enabled); }

  @DeleteMapping("/browser-session")
  public ResponseEntity<Void> endBrowserSession(jakarta.servlet.http.HttpServletRequest request,
      jakarta.servlet.http.HttpServletResponse response) {
    CookieSerializer cookieSerializer = cookieSerializers == null ? null : cookieSerializers.getIfAvailable();
    List<String> sessionIds = cookieSerializer == null
        ? new ArrayList<>() : new ArrayList<>(cookieSerializer.readCookieValues(request));
    var session = request.getSession(false);
    if (session != null) {
      sessionIds.add(session.getId());
      session.invalidate();
    }
    SessionRepository<? extends Session> sessionRepository =
        sessionRepositories == null ? null : sessionRepositories.getIfAvailable();
    if (sessionRepository != null) sessionIds.stream().filter(Objects::nonNull).distinct()
        .forEach(sessionRepository::deleteById);
    if (cookieSerializer != null) {
      var cookieValue = new CookieSerializer.CookieValue(request, response, "");
      cookieValue.setCookieMaxAge(0);
      cookieSerializer.writeCookieValue(cookieValue);
    }
    return ResponseEntity.noContent().build();
  }

  @GetMapping
  public List<Connection> list(Authentication auth) {
    return jdbc.query("select a.id,c.client_name,a.authorized_scopes,coalesce(a.refresh_token_expires_at,a.access_token_expires_at),a.connection_label from oauth2_authorization a join oauth2_registered_client c on c.id=a.registered_client_id where a.principal_name=? and coalesce(a.refresh_token_expires_at,a.access_token_expires_at)>now() order by coalesce(a.refresh_token_expires_at,a.access_token_expires_at) desc",
        (rs,n) -> {
          String scopes = rs.getString(3);
          java.util.List<String> labels = scopes == null ? java.util.List.of()
              : java.util.Arrays.stream(scopes.split("[,\\s]+"))
                  .map(com.know.security.OpenAiScope::fromValue).flatMap(java.util.Optional::stream)
                  .map(com.know.security.OpenAiScope::label).toList();
          return new Connection(UUID.fromString(rs.getString(1)), rs.getString(2), scopes, labels,
              rs.getTimestamp(4)==null?null:rs.getTimestamp(4).toInstant(), rs.getString(5));
        }, auth.getName());
  }

  public record LabelRequest(String label) {}

  @PatchMapping("/{id}/label")
  @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
  public void label(Authentication auth, @PathVariable String id, @RequestBody LabelRequest body) {
    String label = body.label() == null ? "" : body.label().trim();
    if (label.length() > 100)
      throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, "Label must be at most 100 characters");
    int count = jdbc.update("update oauth2_authorization set connection_label=? where id=? and principal_name=? and coalesce(refresh_token_expires_at,access_token_expires_at)>now()",
        label.isEmpty() ? null : label, id, auth.getName());
    if (count == 0) throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND);
  }

  @DeleteMapping("/{id}")
  @org.springframework.transaction.annotation.Transactional
  public void revoke(Authentication auth, @PathVariable String id) {
    List<String> clientIds = jdbc.query("select registered_client_id from oauth2_authorization where id=? and principal_name=?",
        (rs,n) -> rs.getString(1), id, auth.getName());
    if (clientIds.isEmpty())
      throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND);
    int count = jdbc.update("delete from oauth2_authorization where id=? and principal_name=?", id, auth.getName());
    if (count == 0) throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND);
    jdbc.update("delete from oauth2_authorization_consent where registered_client_id=? and principal_name=?",
        clientIds.get(0), auth.getName());
  }
}
