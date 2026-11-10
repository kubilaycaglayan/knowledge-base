package com.know.api;

import com.know.domain.User;
import com.know.domain.UserRepository;
import com.know.security.GoogleIdentityVerifier;
import com.know.security.AuthAttemptLimiter;
import com.know.security.OpenAiScope;
import com.know.security.OAuthConsentRequestStore;
import com.know.security.PasswordTiming;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import java.util.Locale;
import java.util.List;
import org.springframework.http.MediaType;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.authentication.session.SessionAuthenticationStrategy;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.savedrequest.HttpSessionRequestCache;
import org.springframework.security.web.savedrequest.SavedRequest;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

@Controller
@RequestMapping("/connect/openai")
public class OpenAiConnectController {
  private static final String PAGE_STYLE = "<style>:root{color-scheme:light;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#17231b;background:#f4f7f2}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px}main{width:min(100%,520px);background:#fff;border:1px solid #d8e2d7;border-radius:20px;padding:clamp(24px,6vw,40px);box-shadow:0 18px 48px #203c2818}h1{font-size:clamp(1.7rem,5vw,2.2rem);line-height:1.15;letter-spacing:-.03em;margin:0 0 12px;text-wrap:balance}p{line-height:1.55;color:#526258;margin:0 0 24px}form{display:grid;gap:16px}form>label{display:grid;gap:7px;font-weight:600}input:not([type=checkbox]){width:100%;min-height:48px;border:1px solid #9aab9d;border-radius:10px;padding:10px 12px;font:inherit;font-size:16px;color:#17231b;background:white}input[type=checkbox]{width:20px;height:20px;accent-color:#176634}form>label:has(input[type=checkbox]){display:flex;align-items:center;gap:12px;min-height:44px;font-weight:500}button{min-height:48px;border:0;border-radius:10px;background:#176634;color:white;font:inherit;font-weight:700;padding:10px 16px;cursor:pointer}button:hover{background:#104d27}button:focus-visible,input:focus-visible{outline:3px solid #297b49;outline-offset:3px}a{color:#125a2e}@media(max-width:480px){body{padding:16px}main{border-radius:16px}}</style>";
  private final UserRepository users;
  private final PasswordEncoder passwords;
  private final GoogleIdentityVerifier google;
  private final AuthAttemptLimiter limiter;
  private final SessionAuthenticationStrategy sessionAuthenticationStrategy;
  private final String googleClientId;
  public OpenAiConnectController(UserRepository users, PasswordEncoder passwords, GoogleIdentityVerifier google,
      AuthAttemptLimiter limiter, SessionAuthenticationStrategy sessionAuthenticationStrategy,
      @org.springframework.beans.factory.annotation.Value("${app.google-client-id:}") String googleClientId) {
    this.users = users; this.passwords = passwords; this.google = google;
    this.limiter = limiter; this.sessionAuthenticationStrategy = sessionAuthenticationStrategy;
    this.googleClientId=googleClientId;
  }

  @GetMapping(value="/login", produces=MediaType.TEXT_HTML_VALUE)
  @ResponseBody
  public ResponseEntity<String> loginPage(HttpServletRequest request) {
    String csrf = request.getAttribute("_csrf") instanceof org.springframework.security.web.csrf.CsrfToken t
        ? "<input type=\"hidden\" name=\""+t.getParameterName()+"\" value=\""+escape(t.getToken())+"\">" : "";
    String csrfToken = request.getAttribute("_csrf") instanceof org.springframework.security.web.csrf.CsrfToken t ? escape(t.getToken()) : "";
    String googleButton = googleClientId.isBlank() ? "" : "<script src='https://accounts.google.com/gsi/client' async defer></script><script src='/connect/openai/openai-connect.js' defer></script><div id='g_id_onload' data-client_id='"+escape(googleClientId)+"' data-callback='googleConnect' data-csrf-token='"+csrfToken+"'></div><div class='g_id_signin' data-type='standard'></div>";
    return ResponseEntity.ok().contentType(MediaType.TEXT_HTML)
        .header(HttpHeaders.CACHE_CONTROL, "no-store")
        .header(HttpHeaders.PRAGMA, "no-cache")
        .header("Cross-Origin-Opener-Policy", "same-origin-allow-popups")
        .body("<!doctype html><html><head><meta name=viewport content='width=device-width,initial-scale=1'><title>Connect Knowledge Base</title>"+PAGE_STYLE+"</head><body><main><h1>Connect Knowledge Base</h1><p>Sign in to choose what the OpenAI plugin can read.</p><form method=post action='/connect/openai/login'>"+csrf+"<label>Email <input name=email type=email autocomplete=username required></label><label>Password <input name=password type=password autocomplete=current-password required></label><button>Continue</button></form>"+googleButton+"</main></body></html>");
  }

  @GetMapping(value="/consent", produces=MediaType.TEXT_HTML_VALUE)
  @ResponseBody
  public ResponseEntity<String> consent(@RequestParam String client_id, @RequestParam String state,
      HttpServletRequest request, Authentication authentication) {
    if (!isAuthenticated(authentication))
      return ResponseEntity.status(302).header(HttpHeaders.LOCATION, "/connect/openai/login")
          .header(HttpHeaders.CACHE_CONTROL, "no-store").header(HttpHeaders.PRAGMA, "no-cache").build();
    if (!OAuthConsentRequestStore.matches(request, client_id, state))
      return html(400, "<!doctype html><title>Invalid consent request</title><p>Start the connection again from OpenAI.</p>");
    String csrf = request.getAttribute("_csrf") instanceof org.springframework.security.web.csrf.CsrfToken t
        ? "<input type=\"hidden\" name=\""+t.getParameterName()+"\" value=\""+escape(t.getToken())+"\">" : "";
    List<OpenAiScope> requested = OpenAiScope.valuesList().stream()
        .filter(OAuthConsentRequestStore.scopes(request, client_id, state)::contains)
        .map(value -> OpenAiScope.fromValue(value).orElseThrow()).toList();
    StringBuilder fields = new StringBuilder(csrf).append(hidden("client_id", client_id)).append(hidden("state", state));
    for (OpenAiScope item : requested) fields.append("<label><input type=checkbox name=scope value=\"")
        .append(escape(item.value())).append("\" checked>").append(escape(item.label())).append("</label><br>");
    if (requested.isEmpty()) return html("<!doctype html><title>OpenAI connection</title><p>No supported read permissions were requested.</p>");
    return html("<!doctype html><html><head><meta name=viewport content='width=device-width,initial-scale=1'><title>Approve OpenAI access</title>"+PAGE_STYLE+"</head><body><main><h1>Connect Recall Personal Knowledge Base</h1><p>Choose the read-only categories this connection can access.</p><form method=post action='/oauth2/authorize'>"+fields+"<button name=user_oauth_approval value=true>Approve selected access</button><button type=submit name=user_oauth_approval value=false>Cancel connection</button></form></main></body></html>");
  }

  private static String hidden(String name, String value) { return "<input type=hidden name=\""+name+"\" value=\""+escape(value)+"\">"; }

  @PostMapping(value="/login", consumes=MediaType.APPLICATION_FORM_URLENCODED_VALUE)
  @ResponseBody
  @io.swagger.v3.oas.annotations.Operation(summary = "Sign in for the OpenAI OAuth authorization flow")
  public ResponseEntity<Void> login(@RequestParam String email, @RequestParam String password, HttpServletRequest request,
      jakarta.servlet.http.HttpServletResponse response) {
    String normalizedEmail = email.trim().toLowerCase(Locale.ROOT);
    checkRate(request, normalizedEmail);
    User user = users.findByEmailIgnoreCase(normalizedEmail).orElse(null);
    if (!PasswordTiming.matches(passwords, password, user))
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid email or password");
    establishSession(user, request, response);
    return ResponseEntity.status(302).header(HttpHeaders.LOCATION, safeContinuation(request)).build();
  }

  @PostMapping(value="/google", consumes=MediaType.APPLICATION_JSON_VALUE)
  @ResponseBody
  public GoogleConnectResponse google(@RequestBody GoogleLogin requestBody, HttpServletRequest request,
      jakarta.servlet.http.HttpServletResponse response) {
    checkRate(request, "google-connect");
    var identity = google.verify(requestBody.idToken());
    if (identity.isEmpty()) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Google sign-in failed");
    var user = users.findByGoogleSubject(identity.get().subject()).orElseThrow(
        () -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "This Google account is not linked to Knowledge Base"));
    establishSession(user, request, response);
    return new GoogleConnectResponse(safeContinuation(request));
  }

  public record GoogleConnectResponse(String authorizationUrl) {}

  private void establishSession(User user, HttpServletRequest request, jakarta.servlet.http.HttpServletResponse response) {
    request.getSession(true);
    var auth = new UsernamePasswordAuthenticationToken(user.getId().toString(), null,
        new java.util.ArrayList<>(java.util.List.of(
            new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_USER"))));
    sessionAuthenticationStrategy.onAuthentication(auth, request, response);
    SecurityContext context = SecurityContextHolder.createEmptyContext(); context.setAuthentication(auth);
    SecurityContextHolder.setContext(context);
    request.getSession(true).setAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY, context);
  }
  private void checkRate(HttpServletRequest request, String identifier) {
    if (!limiter.allow(request.getRemoteAddr() + "|openai-connect|" + identifier))
      throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
          "Too many sign-in attempts; try again shortly");
  }
  private static String safeContinuation(HttpServletRequest request) {
    SavedRequest saved = new HttpSessionRequestCache().getRequest(request, null);
    if (saved == null) return "/";
    try {
      var uri = java.net.URI.create(saved.getRedirectUrl());
      String path = uri.getRawPath();
      if (path == null || !path.startsWith("/") || path.startsWith("//")) return "/";
      return path + (uri.getRawQuery() == null ? "" : "?" + uri.getRawQuery());
    } catch (IllegalArgumentException ignored) {
      return "/";
    }
  }
  private static String escape(String v) { return v.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;").replace("\"","&quot;").replace("'","&#39;"); }
  private static boolean isAuthenticated(Authentication authentication) {
    return authentication != null && authentication.isAuthenticated()
        && !(authentication instanceof AnonymousAuthenticationToken);
  }
  private static ResponseEntity<String> html(String body) { return html(200, body); }
  private static ResponseEntity<String> html(int status, String body) {
    return ResponseEntity.status(status).contentType(MediaType.TEXT_HTML)
        .header(HttpHeaders.CACHE_CONTROL, "no-store").header(HttpHeaders.PRAGMA, "no-cache").body(body);
  }
  public record GoogleLogin(String idToken) {}
}
