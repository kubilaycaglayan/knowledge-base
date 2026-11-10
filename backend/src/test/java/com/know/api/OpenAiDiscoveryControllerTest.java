package com.know.api;

import static org.junit.jupiter.api.Assertions.*;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class OpenAiDiscoveryControllerTest {
  @Test
  void protectedResourceMetadataUsesTheConfiguredIssuerAndMcpResource() {
    var controller = new OpenAiDiscoveryController("https://kb.example", "challenge-value");

    var metadata = controller.protectedResource();

    assertEquals("https://kb.example/mcp", metadata.get("resource"));
    assertEquals(List.of("https://kb.example"), metadata.get("authorization_servers"));
    assertTrue(((List<?>) metadata.get("scopes_supported")).contains("kb:notes:read"));
  }

  @Test
  void challengeReturnsTheExactConfiguredPlainTextValue() {
    var controller = new OpenAiDiscoveryController("https://kb.example", "challenge-value");

    assertEquals("challenge-value", controller.challenge());
  }

  @Test
  void challengeIsNotFoundWhenNoTokenIsConfigured() {
    var controller = new OpenAiDiscoveryController("https://kb.example", " ");

    var error = assertThrows(ResponseStatusException.class, controller::challenge);

    assertEquals(404, error.getStatusCode().value());
  }
}
