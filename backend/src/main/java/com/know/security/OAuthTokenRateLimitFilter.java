package com.know.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.web.filter.OncePerRequestFilter;

/** Bounds credential and token probes at the public OAuth token endpoint. */
public final class OAuthTokenRateLimitFilter extends OncePerRequestFilter {
  private final AuthAttemptLimiter limiter;

  OAuthTokenRateLimitFilter(AuthAttemptLimiter limiter) {
    this.limiter = limiter;
  }

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
      FilterChain chain) throws ServletException, IOException {
    if (!"POST".equalsIgnoreCase(request.getMethod()) || !"/oauth2/token".equals(request.getServletPath())) {
      chain.doFilter(request, response);
      return;
    }
    if (!limiter.allow("openai-oauth-token|" + request.getRemoteAddr())) {
      response.setStatus(429);
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Pragma", "no-cache");
      response.setContentType("application/json;charset=UTF-8");
      response.getWriter().write("{\"error\":\"slow_down\",\"error_description\":\"Too many token requests; try again shortly.\"}");
      return;
    }
    chain.doFilter(request, response);
  }
}
