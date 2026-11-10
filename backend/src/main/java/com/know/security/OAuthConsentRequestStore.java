package com.know.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/** Binds a consent form to the scopes and client from its authenticated authorize request. */
public final class OAuthConsentRequestStore {
  private static final String SESSION_KEY = OAuthConsentRequestStore.class.getName() + ".requests";
  private static final int MAX_PENDING = 8;

  private OAuthConsentRequestStore() {}

  public static void remember(HttpServletRequest request, String clientId, String state, String scope) {
    if (blank(clientId) || blank(state)) return;
    HttpSession session = request.getSession(true);
    Map<String, String> pending = requests(session);
    pending.put(key(state), clientId + "\n" + normalize(scope));
    while (pending.size() > MAX_PENDING) pending.remove(pending.keySet().iterator().next());
    session.setAttribute(SESSION_KEY, pending);
  }

  public static Set<String> scopes(HttpServletRequest request, String clientId, String state) {
    String entry = entry(request, clientId, state);
    if (entry == null) return Set.of();
    int separator = entry.indexOf('\n');
    if (separator < 0) return Set.of();
    String scope = entry.substring(separator + 1);
    if (scope.isBlank()) return Set.of();
    return java.util.Arrays.stream(scope.split(" ")).collect(Collectors.toUnmodifiableSet());
  }

  public static boolean matches(HttpServletRequest request, String clientId, String state) {
    return entry(request, clientId, state) != null;
  }

  public static void forget(HttpServletRequest request, String state) {
    HttpSession session = request.getSession(false);
    if (session == null || blank(state)) return;
    Map<String, String> pending = requests(session);
    pending.remove(key(state));
    if (pending.isEmpty()) session.removeAttribute(SESSION_KEY);
    else session.setAttribute(SESSION_KEY, pending);
  }

  private static String entry(HttpServletRequest request, String clientId, String state) {
    HttpSession session = request.getSession(false);
    if (session == null || blank(clientId) || blank(state)) return null;
    String value = requests(session).get(key(state));
    if (value == null || !value.startsWith(clientId + "\n")) return null;
    return value;
  }

  @SuppressWarnings("unchecked")
  private static Map<String, String> requests(HttpSession session) {
    Object existing = session.getAttribute(SESSION_KEY);
    if (existing instanceof Map<?, ?> map) return (Map<String, String>) map;
    return new LinkedHashMap<>();
  }

  private static String normalize(String scope) {
    if (blank(scope)) return "";
    return java.util.Arrays.stream(scope.trim().split("\\s+")).filter(s -> !s.isBlank()).distinct()
        .collect(Collectors.joining(" "));
  }

  private static String key(String state) {
    try {
      return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
          .digest(state.getBytes(StandardCharsets.UTF_8)));
    } catch (Exception impossible) {
      throw new IllegalStateException("SHA-256 unavailable", impossible);
    }
  }

  private static boolean blank(String value) { return value == null || value.isBlank(); }
}
