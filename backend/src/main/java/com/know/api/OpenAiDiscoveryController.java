package com.know.api;

import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import com.know.security.OpenAiScope;

@RestController
public class OpenAiDiscoveryController {
  private final String issuer;
  private final String challenge;
  public OpenAiDiscoveryController(
      @Value("${app.openai-oauth.issuer}") String issuer,
      @Value("${app.openai-oauth.domain-challenge:}") String challenge) {
    this.issuer = issuer;
    this.challenge = challenge;
  }

  @GetMapping("/.well-known/oauth-protected-resource")
  public Map<String, Object> protectedResource() {
    return Map.of("resource", issuer + "/mcp", "authorization_servers", List.of(issuer),
        "scopes_supported", OpenAiScope.valuesList());
  }

  @GetMapping(value = "/.well-known/openai-apps-challenge", produces = MediaType.TEXT_PLAIN_VALUE)
  public String challenge() {
    if (challenge.isBlank()) throw new org.springframework.web.server.ResponseStatusException(
        org.springframework.http.HttpStatus.NOT_FOUND);
    return challenge;
  }
}
