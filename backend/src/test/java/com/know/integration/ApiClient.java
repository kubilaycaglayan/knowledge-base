package com.know.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.UUID;

/**
 * Minimal JSON client for integration tests. It uses the JDK client so every method (and a 401
 * answer to a request with a body) behaves as it would from a browser.
 */
final class ApiClient {
  record Reply(int status, String body) {
    JsonNode json() {
      try {
        return MAPPER.readTree(body);
      } catch (Exception ex) {
        throw new AssertionError("Not JSON (" + status + "): " + body, ex);
      }
    }

    String id() {
      return json().get("id").asText();
    }
  }

  static final ObjectMapper MAPPER = new ObjectMapper();
  private final HttpClient http = HttpClient.newHttpClient();
  private final String base;

  ApiClient(int port) {
    base = "http://localhost:" + port;
  }

  Reply send(String method, String path, String token, String body) {
    try {
      HttpRequest.Builder request =
          HttpRequest.newBuilder(URI.create(base + path))
              .method(
                  method,
                  body == null
                      ? HttpRequest.BodyPublishers.noBody()
                      : HttpRequest.BodyPublishers.ofString(body));
      if (body != null) request.header("Content-Type", "application/json");
      if (token != null) request.header("Authorization", "Bearer " + token);
      HttpResponse<String> response =
          http.send(request.build(), HttpResponse.BodyHandlers.ofString());
      return new Reply(response.statusCode(), response.body());
    } catch (Exception ex) {
      throw new AssertionError(method + " " + path + " failed: " + ex, ex);
    }
  }

  Reply get(String path, String token) {
    return send("GET", path, token, null);
  }

  Reply post(String path, String token, String body) {
    return send("POST", path, token, body);
  }

  Reply put(String path, String token, String body) {
    return send("PUT", path, token, body);
  }

  Reply delete(String path, String token) {
    return send("DELETE", path, token, null);
  }

  /** Creates and returns a JSON body, failing the test unless the request succeeded. */
  JsonNode created(String method, String path, String token, String body) {
    Reply reply = send(method, path, token, body);
    assertTrue(reply.status() / 100 == 2, method + " " + path + " -> " + reply);
    return reply.json();
  }

  /** Registers a fresh, randomly named account and returns its token. */
  String register() {
    Reply reply =
        post(
            "/api/v1/auth/register",
            null,
            "{\"email\":\"" + UUID.randomUUID() + "@test.example\",\"password\":\"SecurePassword123!\"}");
    assertEquals(200, reply.status(), reply.body());
    return reply.json().get("token").asText();
  }
}
