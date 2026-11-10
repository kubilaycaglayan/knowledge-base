package com.know.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import jakarta.servlet.FilterChain;
import jakarta.servlet.http.HttpServletResponse;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class OAuthTokenRateLimitFilterTest {
  @Test
  void countsOnlyFailuresAndPartitionsTheBudgetByClientAndCloudflareAddress() throws Exception {
    AtomicLong now = new AtomicLong();
    AuthAttemptLimiter limiter = new AuthAttemptLimiter(now::get);
    OAuthTokenRateLimitFilter filter = new OAuthTokenRateLimitFilter(limiter, "plugin-client");

    for (int i = 0; i < 20; i++) {
      MockHttpServletResponse success = new MockHttpServletResponse();
      filter.doFilter(request("198.51.100.10"), success, (req, res) -> {});
      assertEquals(200, success.getStatus());
    }

    for (int i = 0; i < 10; i++) {
      MockHttpServletResponse failure = new MockHttpServletResponse();
      filter.doFilter(request("198.51.100.10"), failure,
          (req, res) -> ((HttpServletResponse) res).setStatus(401));
      assertEquals(401, failure.getStatus());
    }

    MockHttpServletResponse blocked = new MockHttpServletResponse();
    boolean[] continued = {false};
    filter.doFilter(request("198.51.100.10"), blocked, (req, res) -> continued[0] = true);
    assertEquals(429, blocked.getStatus());
    assertEquals("no-store", blocked.getHeader("Cache-Control"));
    assertEquals("60", blocked.getHeader("Retry-After"));
    assertTrue(blocked.getContentAsString().contains("temporarily_unavailable"));
    assertFalse(continued[0]);

    MockHttpServletResponse otherAddress = new MockHttpServletResponse();
    filter.doFilter(request("198.51.100.11"), otherAddress, (req, res) -> {});
    assertEquals(200, otherAddress.getStatus());

    MockHttpServletResponse otherClient = new MockHttpServletResponse();
    new OAuthTokenRateLimitFilter(limiter, "another-client")
        .doFilter(request("198.51.100.10"), otherClient, (req, res) -> {});
    assertEquals(200, otherClient.getStatus());
  }

  @Test
  void ignoresCallerControlledForwardedForWhenNoCloudflareAddressIsPresent() throws Exception {
    AuthAttemptLimiter limiter = new AuthAttemptLimiter(() -> 0L);
    OAuthTokenRateLimitFilter filter = new OAuthTokenRateLimitFilter(limiter, "plugin-client");
    for (int i = 0; i < 10; i++) {
      MockHttpServletRequest failedRequest = request(null);
      failedRequest.addHeader("X-Forwarded-For", "198.51.100." + (i + 1));
      MockHttpServletResponse failure = new MockHttpServletResponse();
      filter.doFilter(failedRequest, failure,
          (req, res) -> ((HttpServletResponse) res).setStatus(401));
    }

    MockHttpServletRequest spoofedAddress = request(null);
    spoofedAddress.addHeader("X-Forwarded-For", "203.0.113.77");
    MockHttpServletResponse blocked = new MockHttpServletResponse();
    filter.doFilter(spoofedAddress, blocked, (req, res) -> {});

    assertEquals(429, blocked.getStatus());
  }

  private static MockHttpServletRequest request(String cloudflareAddress) {
    MockHttpServletRequest request = new MockHttpServletRequest("POST", "/oauth2/token");
    request.setServletPath("/oauth2/token");
    request.setRemoteAddr("172.20.0.5");
    if (cloudflareAddress != null) {
      request.addHeader("CF-Connecting-IP", cloudflareAddress);
      request.addHeader("X-Forwarded-For", "203.0.113.99");
    }
    return request;
  }
}
