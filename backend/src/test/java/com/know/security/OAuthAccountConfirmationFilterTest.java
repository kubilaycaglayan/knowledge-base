package com.know.security;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

class OAuthAccountConfirmationFilterTest {
  @AfterEach void clear() { SecurityContextHolder.clearContext(); }

  @Test void eachAuthenticatedAuthorizationRequiresConfirmation() throws Exception {
    var request = new MockHttpServletRequest("GET", "/oauth2/authorize");
    request.setServletPath("/oauth2/authorize");
    request.setQueryString("client_id=client&state=state&resource=resource");
    SecurityContextHolder.getContext().setAuthentication(new TestingAuthenticationToken("user", "", "ROLE_USER"));
    var filter = new OAuthAccountConfirmationFilter();
    var response = new MockHttpServletResponse();
    filter.doFilter(request, response, new MockFilterChain());
    assertEquals("/oauth-account", response.getRedirectedUrl());
    String target = (String) request.getSession().getAttribute(OAuthAccountConfirmationFilter.PENDING);
    assertEquals("/oauth2/authorize?client_id=client&state=state&resource=resource", target);
    request.getSession().setAttribute(OAuthAccountConfirmationFilter.APPROVED, target);
    var next = new MockHttpServletRequest("GET", "/oauth2/authorize");
    next.setServletPath("/oauth2/authorize");
    next.setQueryString(request.getQueryString());
    next.setSession((org.springframework.mock.web.MockHttpSession) request.getSession());
    var chain = new MockFilterChain();
    filter.doFilter(next, new MockHttpServletResponse(), chain);
    assertNotNull(chain.getRequest());
    assertNull(next.getSession().getAttribute(OAuthAccountConfirmationFilter.APPROVED));
    var repeated = new MockHttpServletRequest("GET", "/oauth2/authorize");
    repeated.setServletPath("/oauth2/authorize");
    repeated.setQueryString(request.getQueryString());
    repeated.setSession((org.springframework.mock.web.MockHttpSession) request.getSession());
    var repeatedResponse = new MockHttpServletResponse();
    filter.doFilter(repeated, repeatedResponse, new MockFilterChain());
    assertEquals("/oauth-account", repeatedResponse.getRedirectedUrl());
  }
}
