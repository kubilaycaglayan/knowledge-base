package com.know.logging;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
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
  public static final String REQUEST_ID_HEADER = "X-Request-ID";

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
      throws ServletException, IOException {
    long startedAt = System.nanoTime();
    String suppliedRequestId = request.getHeader(REQUEST_ID_HEADER);
    String requestId = validRequestId(suppliedRequestId)
        ? suppliedRequestId
        : UUID.randomUUID().toString();
    response.setHeader(REQUEST_ID_HEADER, requestId);
    try {
      filterChain.doFilter(request, response);
    } finally {
      long durationMillis = (System.nanoTime() - startedAt) / 1_000_000;
      log.info(
          "requestId={} {} {} {} ({} ms) origin={} auth={} client={}",
          requestId,
          request.getMethod(),
          request.getRequestURI(),
          response.getStatus(),
          durationMillis,
          originKind(request.getHeader("Origin")),
          request.getHeader("Authorization") == null ? "absent" : "present",
          clientKind(request.getHeader("User-Agent")));
    }
  }

  private static boolean validRequestId(String value) {
    return value != null && value.matches("[A-Za-z0-9._:-]{1,100}");
  }

  private static String originKind(String origin) {
    if (origin == null || origin.isBlank()) return "none";
    if (origin.startsWith("chrome-extension://")) return "chrome-extension";
    if (origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1")) return "local-web";
    if (origin.startsWith("https://")) return "https-web";
    return "other";
  }

  private static String clientKind(String userAgent) {
    if (userAgent == null || userAgent.isBlank()) return "unknown";
    if (userAgent.contains("Chrome/")) return "chrome";
    if (userAgent.contains("Safari/") && !userAgent.contains("Chrome/")) return "safari";
    if (userAgent.contains("KnowledgeBase") || userAgent.contains("CFNetwork")) return "native";
    return "other";
  }
}
