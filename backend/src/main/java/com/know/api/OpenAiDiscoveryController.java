package com.know.api;

import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class OpenAiDiscoveryController {
  private final String issuer;
  private final String challenge;
  public OpenAiDiscoveryController(
      @Value("${app.openai-oauth.issuer:https://knowledgebase.blaqc.space}") String issuer,
      @Value("${app.openai-oauth.domain-challenge:}") String challenge) {
    this.issuer = issuer;
    this.challenge = challenge;
  }

  @GetMapping("/.well-known/oauth-protected-resource")
  public Map<String, Object> protectedResource() {
    return Map.of("resource", issuer + "/mcp", "authorization_servers", List.of(issuer),
        "scopes_supported", List.of("kb:notes:read", "kb:logs:read",
            "kb:calendar:read", "kb:sessions:read", "kb:activity:read", "kb:reports:read",
            "kb:paths:read", "kb:labels:read", "kb:boards:read"));
  }

  @GetMapping(value = "/.well-known/openai-apps-challenge", produces = MediaType.TEXT_PLAIN_VALUE)
  public String challenge() {
    if (challenge.isBlank()) throw new org.springframework.web.server.ResponseStatusException(
        org.springframework.http.HttpStatus.NOT_FOUND);
    return challenge;
  }
}
