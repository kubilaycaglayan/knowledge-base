package com.know.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;
import javax.crypto.SecretKey;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

/** Authentication hardening (docs/test-hardening-plan.md, TH-01 to TH-06). */
class SecurityHardeningIntegrationTest extends IntegrationTestSupport {
  static final String SECRET = "integration-test-secret-with-enough-chars-123";
  static final Set<String> PUBLIC_ROUTES =
      Set.of(
          "/api/v1/auth/google/config",
          "/api/v1/auth/register",
          "/api/v1/auth/login",
          "/api/v1/auth/google");

  @LocalServerPort int port;

  @Autowired
  @Qualifier("requestMappingHandlerMapping")
  RequestMappingHandlerMapping mappings;

  final HttpClient http = HttpClient.newHttpClient();
  final ObjectMapper json = new ObjectMapper();

  record Route(String method, String pattern) {}

  record Reply(int status, Map<String, List<String>> headers, String body) {
    String header(String name) {
      return headers.entrySet().stream()
          .filter(e -> e.getKey().equalsIgnoreCase(name))
          .flatMap(e -> e.getValue().stream())
          .findFirst()
          .orElse(null);
    }
  }

  @BeforeEach
  void checkMappings() {
    assertFalse(routes().isEmpty(), "Spring MVC routes must be discoverable");
  }

  Reply send(String method, String path, Map<String, String> headers, String body) {
    try {
      HttpRequest.Builder request =
          HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
              .method(
                  method,
                  body == null
                      ? HttpRequest.BodyPublishers.noBody()
                      : HttpRequest.BodyPublishers.ofString(body));
      if (body != null) request.header("Content-Type", "application/json");
      headers.forEach(request::header);
      HttpResponse<String> response =
          http.send(request.build(), HttpResponse.BodyHandlers.ofString());
      return new Reply(response.statusCode(), response.headers().map(), response.body());
    } catch (Exception ex) {
      throw new AssertionError(method + " " + path + " failed: " + ex, ex);
    }
  }

  Reply send(String method, String path, String token, String body) {
    Map<String, String> headers = new LinkedHashMap<>();
    if (token != null) headers.put("Authorization", "Bearer " + token);
    return send(method, path, headers, body);
  }

  JsonNode register() throws Exception {
    Reply reply =
        send(
            "POST",
            "/api/v1/auth/register",
            (String) null,
            "{\"email\":\"" + UUID.randomUUID() + "@test.example\",\"password\":\"SecurePassword123!\"}");
    assertEquals(200, reply.status(), reply.body());
    return json.readTree(reply.body());
  }

  List<Route> routes() {
    Set<Route> routes = new java.util.LinkedHashSet<>();
    mappings
        .getHandlerMethods()
        .forEach(
            (info, handler) -> {
              if (!handler.getBeanType().getPackageName().startsWith("com.know")) return;
              Set<RequestMethod> methods = info.getMethodsCondition().getMethods();
              for (String pattern : info.getPatternValues())
                for (RequestMethod method : methods.isEmpty() ? Set.of(RequestMethod.GET) : methods)
                  routes.add(new Route(method.name(), pattern));
            });
    return new ArrayList<>(routes);
  }

  static String concrete(String pattern) {
    return pattern.replaceAll("\\{[^}]+}", UUID.randomUUID().toString());
  }

  static SecretKey key(String secret) {
    return Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
  }

  static String token(String subject, Instant expiresAt, SecretKey key) {
    var builder = Jwts.builder().issuedAt(new Date()).expiration(Date.from(expiresAt));
    if (subject != null) builder.subject(subject);
    return builder.signWith(key).compact();
  }

  static String unsignedToken(String subject) {
    Base64.Encoder encoder = Base64.getUrlEncoder().withoutPadding();
    String header = encoder.encodeToString("{\"alg\":\"none\"}".getBytes(StandardCharsets.UTF_8));
    String payload =
        encoder.encodeToString(("{\"sub\":\"" + subject + "\"}").getBytes(StandardCharsets.UTF_8));
    return header + "." + payload + ".";
  }

  // TH-01
  @Test
  void everyProtectedRouteRejectsAnonymousRequests() {
    List<String> failures = new ArrayList<>();
    Set<String> checked = new TreeSet<>();
    for (Route route : routes()) {
      if (PUBLIC_ROUTES.contains(route.pattern())) continue;
      String body = route.method().equals("GET") || route.method().equals("DELETE") ? null : "{}";
      Reply reply = send(route.method(), concrete(route.pattern()), (String) null, body);
      checked.add(route.method() + " " + route.pattern());
      if (reply.status() != 401)
        failures.add(route.method() + " " + route.pattern() + " -> " + reply.status());
    }
    assertTrue(checked.size() > 80, "Expected to check every API route, checked " + checked);
    assertTrue(failures.isEmpty(), "Routes reachable without a token: " + failures);
  }

  // TH-02
  @Test
  void publicRoutesDoNotRequireAToken() {
    assertEquals(200, send("GET", "/api/v1/auth/google/config", (String) null, null).status());
    assertEquals(200, send("GET", "/actuator/health", (String) null, null).status());
    assertEquals(200, send("GET", "/v3/api-docs", (String) null, null).status());
    for (String path : List.of("/api/v1/auth/register", "/api/v1/auth/login", "/api/v1/auth/google")) {
      int status = send("POST", path, (String) null, "{}").status();
      assertNotEquals(401, status, path);
      assertTrue(status < 500, path + " -> " + status);
    }
  }

  // TH-03
  @Test
  void malformedTokensAreRejectedWithoutServerErrors() throws Exception {
    String userId = register().get("id").asText();
    Instant future = Instant.now().plusSeconds(3600);
    Map<String, String> tokens = new LinkedHashMap<>();
    tokens.put("empty", "");
    tokens.put("garbage", "not-a-jwt");
    tokens.put("three garbage parts", "a.b.c");
    tokens.put("wrong key", token(userId, future, key("another-secret-that-is-at-least-32-chars")));
    tokens.put("expired", token(userId, Instant.now().minusSeconds(60), key(SECRET)));
    tokens.put("unsigned", unsignedToken(userId));
    tokens.put("missing subject", token(null, future, key(SECRET)));
    tokens.put("non-UUID subject", token("not-a-uuid", future, key(SECRET)));
    List<String> failures = new ArrayList<>();
    for (var entry : tokens.entrySet())
      for (String path : List.of("/api/v1/auth/me", "/api/v1/paths", "/api/v1/logs")) {
        int status = send("GET", path, entry.getValue(), null).status();
        if (status != 401) failures.add(entry.getKey() + " " + path + " -> " + status);
      }
    int basic =
        send("GET", "/api/v1/paths", Map.of("Authorization", "Basic dXNlcjpwYXNz"), null).status();
    if (basic != 401) failures.add("Basic scheme -> " + basic);
    assertTrue(failures.isEmpty(), "Tokens not rejected with 401: " + failures);
  }

  // TH-04
  @Test
  void tokenForUnknownUserSeesNothing() throws Exception {
    JsonNode owner = register();
    String ownerToken = owner.get("token").asText();
    Reply created =
        send("POST", "/api/v1/paths", ownerToken, "{\"name\":\"Owner path\"}");
    assertEquals(201, created.status(), created.body());
    String ghost = token(UUID.randomUUID().toString(), Instant.now().plusSeconds(3600), key(SECRET));
    Reply paths = send("GET", "/api/v1/paths", ghost, null);
    assertTrue(paths.status() == 401 || paths.status() == 404 || "[]".equals(paths.body()),
        "Ghost user saw " + paths.status() + " " + paths.body());
    String pathId = json.readTree(created.body()).get("id").asText();
    int read = send("GET", "/api/v1/paths/" + pathId, ghost, null).status();
    assertTrue(read == 401 || read == 404, "Ghost read owner's path -> " + read);
    assertEquals(200, send("GET", "/api/v1/paths/" + pathId, ownerToken, null).status());
  }

  // TH-05
  @Test
  void responsesCarrySecurityHeadersAndNoSession() throws Exception {
    String token = register().get("token").asText();
    for (Reply reply :
        List.of(
            send("GET", "/api/v1/paths", token, null),
            send("GET", "/api/v1/paths", (String) null, null),
            send(
                "POST",
                "/api/v1/auth/login",
                (String) null,
                "{\"email\":\"nobody@test.example\",\"password\":\"WrongPassword123!\"}"))) {
      assertEquals("DENY", reply.header("X-Frame-Options"));
      assertEquals("nosniff", reply.header("X-Content-Type-Options"));
      String cookie = reply.header("Set-Cookie");
      assertTrue(cookie == null || !cookie.contains("JSESSIONID"), "Session cookie: " + cookie);
    }
  }

  // TH-06
  @Test
  void corsAllowsOnlyConfiguredOrigins() {
    Map<String, String> allowed =
        Map.of(
            "Origin", "http://localhost",
            "Access-Control-Request-Method", "PUT",
            "Access-Control-Request-Headers", "authorization,content-type");
    Reply ok = send("OPTIONS", "/api/v1/paths", allowed, null);
    assertEquals(200, ok.status());
    assertEquals("http://localhost", ok.header("Access-Control-Allow-Origin"));

    Map<String, String> foreign = new LinkedHashMap<>(allowed);
    foreign.put("Origin", "https://evil.example");
    Reply refused = send("OPTIONS", "/api/v1/paths", foreign, null);
    assertEquals(403, refused.status());
    assertEquals(null, refused.header("Access-Control-Allow-Origin"));

    Reply simple =
        send("GET", "/api/v1/auth/google/config", Map.of("Origin", "https://evil.example"), null);
    assertEquals(null, simple.header("Access-Control-Allow-Origin"));
  }
}
