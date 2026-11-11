package com.know.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/** Requires explicit account confirmation for each browser authorization request. */
public final class OAuthAccountConfirmationFilter extends OncePerRequestFilter {
  public static final String PENDING = OAuthAccountConfirmationFilter.class.getName() + ".pending";
  public static final String APPROVED = OAuthAccountConfirmationFilter.class.getName() + ".approved";

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    Authentication auth = SecurityContextHolder.getContext().getAuthentication();
    if ("GET".equals(request.getMethod()) && "/oauth2/authorize".equals(request.getServletPath())
        && auth != null && auth.isAuthenticated()
        && !(auth instanceof org.springframework.security.authentication.AnonymousAuthenticationToken)) {
      String query = request.getQueryString();
      String target = "/oauth2/authorize" + (query == null ? "" : "?" + query);
      var session = request.getSession(true);
      String approved = (String) session.getAttribute(APPROVED);
      session.removeAttribute(APPROVED);
      if (!target.equals(approved)) {
        session.setAttribute(PENDING, target);
        response.setHeader("Cache-Control", "no-store");
        response.sendRedirect("/oauth-account");
        return;
      }
    }
    chain.doFilter(request, response);
  }
}
