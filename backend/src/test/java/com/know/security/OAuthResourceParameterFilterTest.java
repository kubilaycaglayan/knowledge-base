package com.know.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import jakarta.servlet.http.HttpServletResponse;

class OAuthResourceParameterFilterTest {
  private static final String ISSUER = "https://kb.example.test";
  private static final String RESOURCE = ISSUER + "/mcp";
  private static final String CALLBACK = "https://chatgpt.com/connector_platform_oauth_redirect";

  private final OAuthResourceParameterFilter filter =
      new OAuthResourceParameterFilter(ISSUER, CALLBACK);

  @Test
  void initialAuthorizationMustNameTheProtectedResource() throws Exception {
    MockHttpServletRequest request = new MockHttpServletRequest("GET", "/oauth2/authorize");
    request.setServletPath("/oauth2/authorize");
    MockHttpServletResponse response = new MockHttpServletResponse();

    filter.doFilter(request, response, (req, res) -> { throw new AssertionError("Unexpected continuation"); });

    assertEquals(400, response.getStatus());
    assertTrue(response.getContentAsString().contains("invalid_target"));
  }

  @Test
  void consentRedirectStateKeepsInitialScopesBoundAndAddsIssuerToCallback() throws Exception {
    MockHttpServletRequest initial = new MockHttpServletRequest("GET", "/oauth2/authorize");
    initial.setServletPath("/oauth2/authorize");
    initial.addParameter("resource", RESOURCE);
    initial.addParameter("client_id", "client-1");
    initial.addParameter("state", "state-1");
    initial.addParameter("scope", "kb:notes:read kb:logs:read");
    filter.doFilter(initial, new MockHttpServletResponse(), (req, res) ->
        ((HttpServletResponse) res).sendRedirect(
            "/connect/openai/consent?client_id=client-1&state=server-consent-state"));

    MockHttpServletRequest request = new MockHttpServletRequest("POST", "/oauth2/authorize");
    request.setServletPath("/oauth2/authorize");
    request.setSession(initial.getSession());
    request.addParameter("client_id", "client-1");
    request.addParameter("state", "server-consent-state");
    request.addParameter("scope", "kb:notes:read");
    MockHttpServletResponse response = new MockHttpServletResponse();

    filter.doFilter(request, response,
        (req, res) -> ((HttpServletResponse) res).setHeader(
            "Location", CALLBACK + "?code=abc&state=xyz"));

    assertEquals(CALLBACK + "?code=abc&state=xyz&iss=https%3A%2F%2Fkb.example.test",
        response.getHeader("Location"));
  }

  @Test
  void tokenExchangeRejectsDifferentResourceAndAcceptsConfiguredResource() throws Exception {
    MockHttpServletRequest wrong = new MockHttpServletRequest("POST", "/oauth2/token");
    wrong.setServletPath("/oauth2/token");
    wrong.addParameter("resource", ISSUER + "/else");
    MockHttpServletResponse rejected = new MockHttpServletResponse();
    filter.doFilter(wrong, rejected, (req, res) -> { throw new AssertionError("Unexpected continuation"); });
    assertEquals(400, rejected.getStatus());

    MockHttpServletRequest correct = new MockHttpServletRequest("POST", "/oauth2/token");
    correct.setServletPath("/oauth2/token");
    correct.addParameter("resource", RESOURCE);
    MockHttpServletResponse accepted = new MockHttpServletResponse();
    filter.doFilter(correct, accepted, (req, res) -> { });
    assertFalse(accepted.getStatus() >= 400);
  }
}
