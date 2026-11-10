package com.know.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.net.InetAddress;
import java.net.UnknownHostException;
import org.springframework.web.filter.OncePerRequestFilter;

/** Bounds credential and token probes at the public OAuth token endpoint. */
public final class OAuthTokenRateLimitFilter extends OncePerRequestFilter {
  private final AuthAttemptLimiter limiter;
  private final String clientId;

  OAuthTokenRateLimitFilter(AuthAttemptLimiter limiter, String clientId) {
    this.limiter = limiter;
    this.clientId = clientId;
  }

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
      FilterChain chain) throws ServletException, IOException {
    if (!"POST".equalsIgnoreCase(request.getMethod()) || !"/oauth2/token".equals(request.getServletPath())) {
      chain.doFilter(request, response);
      return;
    }
    String key = "openai-oauth-token|" + clientId + "|" + clientAddress(request);
    if (limiter.isBlocked(key)) {
      response.setStatus(429);
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Pragma", "no-cache");
      response.setHeader("Retry-After", "60");
      response.setContentType("application/json;charset=UTF-8");
      response.getWriter().write("{\"error\":\"temporarily_unavailable\",\"error_description\":\"Too many failed token requests; try again shortly.\"}");
      return;
    }
    chain.doFilter(request, response);
    int status = response.getStatus();
    if (status == HttpServletResponse.SC_BAD_REQUEST || status == HttpServletResponse.SC_UNAUTHORIZED)
      limiter.recordFailure(key);
  }

  private static String clientAddress(HttpServletRequest request) {
    // Production traffic reaches the private API only through Cloudflare Tunnel;
    // Cloudflare sets CF-Connecting-IP at its edge. Ignore generic X-Forwarded-For,
    // which an untrusted caller could otherwise choose. Local/direct requests use
    // the socket address when the Cloudflare header is absent or malformed.
    String candidate = request.getHeader("CF-Connecting-IP");
    if (candidate == null) return request.getRemoteAddr();
    candidate = candidate.trim();
    boolean ipv4 = candidate.matches("[0-9]{1,3}(\\.[0-9]{1,3}){3}");
    boolean ipv6 = candidate.contains(":") && candidate.matches("[0-9a-fA-F:.]+");
    if (!ipv4 && !ipv6) return request.getRemoteAddr();
    try {
      return InetAddress.getByName(candidate).getHostAddress();
    } catch (UnknownHostException malformed) {
      return request.getRemoteAddr();
    }
  }
}
