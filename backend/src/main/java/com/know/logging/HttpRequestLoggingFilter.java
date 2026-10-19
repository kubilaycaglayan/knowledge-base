package com.know.logging;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Value;
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
  private static final ObjectMapper JSON = new ObjectMapper();
  private static final HttpClient HTTP = HttpClient.newHttpClient();

  @Value("${app.observability.loki-push-url:}")
  private String lokiPushUrl;

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
      throws ServletException, IOException {
    long startedAt = System.nanoTime();
    try {
      filterChain.doFilter(request, response);
    } finally {
      long durationMillis = (System.nanoTime() - startedAt) / 1_000_000;
      String traceId = MDC.get("traceId");
      String spanId = MDC.get("spanId");
      Map<String, Object> event = Map.of(
          "event", "http_request",
          "method", request.getMethod(),
          "path", request.getRequestURI(),
          "status", response.getStatus(),
          "duration_ms", durationMillis,
          "trace_id", traceId == null ? "" : traceId,
          "span_id", spanId == null ? "" : spanId);
      try {
        log.info(
            "{} {} {} ({} ms) {}",
            request.getMethod(),
            request.getRequestURI(),
            response.getStatus(),
            durationMillis,
            JSON.writeValueAsString(event));
        pushToLoki(event);
      } catch (Exception e) {
        log.warn("Could not serialize HTTP access event");
      }
    }
  }

  private void pushToLoki(Map<String, Object> event) {
    if (lokiPushUrl == null || lokiPushUrl.isBlank()) return;
    try {
      String timestamp = Long.toString(Instant.now().toEpochMilli() * 1_000_000L);
      String body = JSON.writeValueAsString(Map.of(
          "streams", List.of(Map.of(
              "stream", Map.of("service_name", "knowledge-base-api"),
              "values", List.of(List.of(timestamp, JSON.writeValueAsString(event)))))));
      HttpRequest push = HttpRequest.newBuilder(URI.create(lokiPushUrl))
          .header("Content-Type", "application/json")
          .POST(HttpRequest.BodyPublishers.ofString(body))
          .build();
      HTTP.sendAsync(push, HttpResponse.BodyHandlers.discarding())
          .exceptionally(error -> {
            log.debug("Loki access event export failed: {}", error.getClass().getSimpleName());
            return null;
          });
    } catch (Exception e) {
      log.debug("Loki access event export failed: {}", e.getClass().getSimpleName());
    }
  }
}
