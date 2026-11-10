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
    boolean missingResource =
        tokenRequest || (authorizeRequest && "GET".equalsIgnoreCase(request.getMethod()));
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
      chain.doFilter(request,
          new IssuerResponseWrapper(response, issuer, callbacks));
      return;
    }
    chain.doFilter(request, response);
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
