package com.know.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpServletResponseWrapper;
import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import org.springframework.web.filter.OncePerRequestFilter;

/** Requires the MCP resource identifier to survive the complete OAuth exchange. */
public final class OAuthResourceParameterFilter extends OncePerRequestFilter {
  private final String issuer;
  private final String resource;
  private final List<String> callbacks;

  public OAuthResourceParameterFilter(String issuer, String redirectUris) {
    this.issuer = issuer;
    this.resource = issuer + "/mcp";
    this.callbacks = Arrays.stream(redirectUris.split(",")).map(String::trim).filter(s -> !s.isBlank()).toList();
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    String path = request.getServletPath();
    String requestedResource = request.getParameter("resource");
    boolean authorizeRequest = path.equals("/oauth2/authorize");
    boolean tokenRequest = path.equals("/oauth2/token");
    boolean refreshRequest = tokenRequest && "refresh_token".equals(request.getParameter("grant_type"));
    boolean missingResource =
        (tokenRequest && !refreshRequest) || (authorizeRequest && "GET".equalsIgnoreCase(request.getMethod()));
    if ((authorizeRequest || tokenRequest)
        && ((missingResource && requestedResource == null)
            || (requestedResource != null && !resource.equals(requestedResource)))) {
      response.setStatus(HttpServletResponse.SC_BAD_REQUEST);
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Pragma", "no-cache");
      response.setContentType("application/json;charset=UTF-8");
      response.getWriter().write(
          "{\"error\":\"invalid_target\",\"error_description\":\"The resource must match this MCP server.\"}");
      return;
    }
    if (path.equals("/oauth2/authorize")) {
      if ("POST".equalsIgnoreCase(request.getMethod())) {
        String state = request.getParameter("state");
        String clientId = request.getParameter("client_id");
        Set<String> originallyRequested = OAuthConsentRequestStore.scopes(request, clientId, state);
        Set<String> submitted = Arrays.stream(request.getParameterValues("scope") == null
                ? new String[0] : request.getParameterValues("scope"))
            .flatMap(value -> Arrays.stream(value.trim().split("\\s+")))
            .filter(value -> !value.isBlank()).collect(java.util.stream.Collectors.toSet());
        if (!OAuthConsentRequestStore.matches(request, clientId, state)) {
          response.setStatus(HttpServletResponse.SC_BAD_REQUEST);
          response.setHeader("Cache-Control", "no-store");
          response.setHeader("Pragma", "no-cache");
          response.setContentType("text/html;charset=UTF-8");
          response.getWriter().write("<!doctype html><html><head><title>Connection expired</title></head><body><main><h1>Connection expired or already submitted</h1><p>Start the connection again from OpenAI.</p></main></body></html>");
          return;
        }
        if (!originallyRequested.containsAll(submitted)) {
          response.setStatus(HttpServletResponse.SC_BAD_REQUEST);
          response.setHeader("Cache-Control", "no-store");
          response.setHeader("Pragma", "no-cache");
          response.setContentType("application/json;charset=UTF-8");
          response.getWriter().write("{\"error\":\"invalid_scope\",\"error_description\":\"Consent scopes must be a subset of the authenticated authorization request.\"}");
          return;
        }
        try {
          chain.doFilter(request, new IssuerResponseWrapper(response, issuer, callbacks));
        } finally {
          OAuthConsentRequestStore.forget(request, state);
        }
        return;
      }
      HttpServletResponse issuerResponse = new IssuerResponseWrapper(response, issuer, callbacks);
      if ("GET".equalsIgnoreCase(request.getMethod())) {
        chain.doFilter(request, new ConsentRedirectResponseWrapper(issuerResponse, request,
            request.getParameter("client_id"), request.getParameter("scope")));
      } else {
        chain.doFilter(request, issuerResponse);
      }
      return;
    }
    chain.doFilter(request, response);
  }

  private static final class ConsentRedirectResponseWrapper extends HttpServletResponseWrapper {
    private final HttpServletRequest request;
    private final String clientId;
    private final String requestedScopes;

    ConsentRedirectResponseWrapper(HttpServletResponse response, HttpServletRequest request,
        String clientId, String requestedScopes) {
      super(response);
      this.request = request;
      this.clientId = clientId;
      this.requestedScopes = requestedScopes;
    }

    @Override public void sendRedirect(String location) throws IOException {
      rememberConsentState(location);
      super.sendRedirect(location);
    }

    @Override public void setHeader(String name, String value) {
      if ("Location".equalsIgnoreCase(name)) rememberConsentState(value);
      super.setHeader(name, value);
    }

    @Override public void addHeader(String name, String value) {
      if ("Location".equalsIgnoreCase(name)) rememberConsentState(value);
      super.addHeader(name, value);
    }

    private void rememberConsentState(String location) {
      if (clientId == null || requestedScopes == null || location == null) return;
      try {
        java.net.URI uri = java.net.URI.create(location);
        if (!"/connect/openai/consent".equals(uri.getPath()) || uri.getRawQuery() == null) return;
        java.util.Map<String, String> query = new java.util.HashMap<>();
        for (String pair : uri.getRawQuery().split("&")) {
          String[] parts = pair.split("=", 2);
          query.put(java.net.URLDecoder.decode(parts[0], StandardCharsets.UTF_8),
              parts.length == 2 ? java.net.URLDecoder.decode(parts[1], StandardCharsets.UTF_8) : "");
        }
        if (clientId.equals(query.get("client_id")) && query.containsKey("state"))
          OAuthConsentRequestStore.remember(request, clientId, query.get("state"), requestedScopes);
      } catch (IllegalArgumentException malformedRedirect) {
        // A malformed or unrelated redirect must not create consent state.
      }
    }
  }

  private static final class IssuerResponseWrapper extends HttpServletResponseWrapper {
    private final String issuer;
    private final List<String> callbacks;

    IssuerResponseWrapper(HttpServletResponse response, String issuer, List<String> callbacks) {
      super(response);
      this.issuer = issuer;
      this.callbacks = callbacks;
    }

    @Override
    public void sendRedirect(String location) throws IOException {
      super.sendRedirect(addIssuer(location));
    }

    @Override
    public void setHeader(String name, String value) {
      super.setHeader(name, "Location".equalsIgnoreCase(name) ? addIssuer(value) : value);
    }

    @Override
    public void addHeader(String name, String value) {
      super.addHeader(name, "Location".equalsIgnoreCase(name) ? addIssuer(value) : value);
    }

    private String addIssuer(String location) {
      if (callbacks.stream().noneMatch(callback -> location.equals(callback)
              || location.startsWith(callback + "?")
              || location.startsWith(callback + "#"))
          || location.matches("(?s).*[?&]iss=[^&#]*.*")) return location;
      String separator = location.contains("?") ? "&" : "?";
      return location + separator + "iss=" + URLEncoder.encode(issuer, StandardCharsets.UTF_8);
    }
  }
}
