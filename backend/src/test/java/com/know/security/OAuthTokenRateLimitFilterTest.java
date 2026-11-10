package com.know.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class OAuthTokenRateLimitFilterTest {
  @Test
  void rejectsExcessTokenRequestsWithNoStore429() throws Exception {
    AuthAttemptLimiter limiter = mock(AuthAttemptLimiter.class);
    when(limiter.allow(anyString())).thenReturn(false);
    FilterChain chain = mock(FilterChain.class);
    MockHttpServletRequest request = new MockHttpServletRequest("POST", "/oauth2/token");
    request.setServletPath("/oauth2/token");
    MockHttpServletResponse response = new MockHttpServletResponse();

    new OAuthTokenRateLimitFilter(limiter).doFilter(request, response, chain);

    assertEquals(429, response.getStatus());
    assertEquals("no-store", response.getHeader("Cache-Control"));
    assertTrue(response.getContentAsString().contains("slow_down"));
    verify(chain, never()).doFilter(request, response);
  }
}
