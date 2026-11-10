package com.know.logging;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/** Logs one concise access-log line for every completed HTTP request. */
@Component
@Order(Ordered.LOWEST_PRECEDENCE)
public class HttpRequestLoggingFilter extends OncePerRequestFilter {
  private static final Logger log = LoggerFactory.getLogger(HttpRequestLoggingFilter.class);

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
      throws ServletException, IOException {
    long startedAt = System.nanoTime();
    try {
      filterChain.doFilter(request, response);
    } finally {
      long durationMillis = (System.nanoTime() - startedAt) / 1_000_000;
      if ("/mcp".equals(request.getRequestURI())) {
        log.info(
            "MCP request method={} path={} status={} contentType={} accept={} contentLength={} authorization={} userAgent={} responseContentType={} wwwAuthenticate={} ({} ms)",
            request.getMethod(),
            request.getRequestURI(),
            response.getStatus(),
            safe(request.getContentType()),
            safe(request.getHeader("Accept")),
            request.getContentLengthLong(),
            authorizationKind(request.getHeader("Authorization")),
            safe(request.getHeader("User-Agent")),
            safe(response.getContentType()),
            safe(response.getHeader("WWW-Authenticate")),
            durationMillis);
      } else {
        log.info(
            "{} {} {} ({} ms)",
            request.getMethod(),
            request.getRequestURI(),
            response.getStatus(),
            durationMillis);
      }
    }
  }

  private static String authorizationKind(String authorization) {
    if (authorization == null || authorization.isBlank()) return "missing";
    int separator = authorization.indexOf(' ');
    String scheme = separator < 0 ? authorization : authorization.substring(0, separator);
    return switch (scheme.toLowerCase(java.util.Locale.ROOT)) {
      case "bearer" -> "bearer-present";
      case "basic" -> "basic-present";
      default -> "other-present";
    };
  }

  private static String safe(String value) {
    if (value == null || value.isBlank()) return "-";
    String singleLine = value.replaceAll("[\\r\\n\\p{Cntrl}]", "?");
    return singleLine.length() > 256 ? singleLine.substring(0, 256) : singleLine;
  }
}
