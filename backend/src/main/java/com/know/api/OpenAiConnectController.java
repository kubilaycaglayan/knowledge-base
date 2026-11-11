package com.know.api;

import com.know.domain.User;
import com.know.domain.UserRepository;
import com.know.security.GoogleIdentityVerifier;
import com.know.security.AuthAttemptLimiter;
import com.know.security.OpenAiScope;
import com.know.security.OAuthConsentRequestStore;
import com.know.security.OAuthAccountConfirmationFilter;
import com.know.security.PasswordTiming;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import java.util.Locale;
import java.util.List;
import org.springframework.http.CacheControl;
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
  public record AuthorizationContinuation(String authorizationUrl) {}

  private static final String PAGE_STYLE = "<style>:root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:var(--workspace-text);background:var(--workspace-background)}*{box-sizing:border-box}body{margin:0;padding:0 max(24px,env(safe-area-inset-right)) max(48px,env(safe-area-inset-bottom)) max(24px,env(safe-area-inset-left));font-size:14px;line-height:1.5}.shell-header{max-width:1200px;min-height:76px;margin:0 auto 10px;padding:16px 0;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--workspace-border)}.brand{font-size:19px;font-weight:800;letter-spacing:-.7px;color:var(--workspace-text);text-decoration:none}.brand span{color:var(--workspace-muted)}main{max-width:480px;margin:40px auto;padding:24px;background:var(--workspace-surface);border:1px solid var(--workspace-border);border-radius:4px}h1{margin:0 0 6px;font-size:26px;font-weight:650;letter-spacing:-.7px;line-height:1.3;overflow-wrap:anywhere}p{color:var(--workspace-muted);margin:14px 0}form{display:grid;gap:14px;margin:24px 0}form>label{display:grid;gap:6px;font-size:12px;font-weight:600}input:not([type=checkbox]){width:100%;min-height:40px;border:1px solid var(--workspace-control-border);border-radius:4px;padding:9px 11px;font:inherit;font-size:14px;font-weight:400;color:var(--workspace-text);background:var(--workspace-surface)}input[type=checkbox]{width:16px;height:16px;accent-color:var(--workspace-accent)}form>label:has(input[type=checkbox]){display:flex;align-items:center;gap:12px;min-height:44px}button{min-height:36px;border:1px solid var(--workspace-accent);border-radius:4px;background:var(--workspace-accent);color:var(--workspace-on-accent);font:inherit;font-size:12px;font-weight:600;padding:7px 12px;cursor:pointer;touch-action:manipulation}button:hover{background:var(--workspace-accent-hover)}button:focus-visible,input:focus-visible,a:focus-visible{outline:3px solid var(--workspace-focus);outline-offset:3px}.google-login iframe{color-scheme:light}@media(max-width:700px){body{padding-inline:max(16px,env(safe-area-inset-left)) max(16px,env(safe-area-inset-right))}main{padding:16px}input:not([type=checkbox]){min-height:44px;font-size:16px}button{min-height:44px}}</style>";
  private static final String PAGE_THEME = "<link rel=stylesheet href='/connect/openai/theme.css'><script src='/connect/openai/theme.js'></script><style>.theme-toggle.ghost{display:inline-flex;align-items:center;justify-content:center;min-width:36px;padding:7px;background:transparent;color:var(--workspace-muted);border-color:transparent}.theme-toggle.ghost:hover{background:var(--workspace-hover);color:var(--workspace-text)}@media(max-width:700px){.theme-toggle.ghost{min-width:44px}}</style>";
  private static final String PAGE_HEADER = "<header class='shell-header'><a class='brand' href='/' translate='no' aria-label='Knowledge Base'>knowledge<span>.</span>base</a><button class='theme-toggle ghost' type='button' aria-label='Switch to dark theme' title='Theme: System default'><svg viewBox='0 0 24 24' width='18' height='18' fill='currentColor' aria-hidden='true'><path d='M12 3a9 9 0 1 0 9 9c0-.45-.03-.89-.1-1.32A7 7 0 1 1 13.32 3.1C12.89 3.03 12.45 3 12 3Z'/></svg></button></header>";
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
    String googleButton = googleClientId.isBlank() ? "" : "<script id='google-gsi-client' src='https://accounts.google.com/gsi/client' async defer></script><div id='google-connect-config' data-client-id='"+escape(googleClientId)+"' data-csrf-token='"+csrfToken+"'></div><div class='google-login'><p>or continue with</p><div id='google-connect-button' aria-label='Continue with Google'></div></div>";
    return ResponseEntity.ok().contentType(new MediaType(MediaType.TEXT_HTML, java.nio.charset.StandardCharsets.UTF_8))
        .header(HttpHeaders.CACHE_CONTROL, "no-store")
        .header(HttpHeaders.PRAGMA, "no-cache")
        .header("Cross-Origin-Opener-Policy", "same-origin-allow-popups")
        .body("<!doctype html><html><head><meta name=viewport content='width=device-width,initial-scale=1'><title>Sign in · Knowledge Base</title>"+PAGE_STYLE+PAGE_THEME+"<style>button.is-loading::after{content:'';display:inline-block;width:12px;height:12px;margin-left:8px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;vertical-align:-2px;animation:oauth-spin .8s linear infinite}@keyframes oauth-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){button.is-loading::after{animation:none;border-right-color:currentColor}}</style></head><body>"+PAGE_HEADER+"<main><h1>Sign in</h1><p>Sign in to choose what the OpenAI plugin can read.</p><p id='openai-login-error' role='alert' aria-live='polite' hidden></p><form id='openai-login-form' method=post action='/connect/openai/login'>"+csrf+"<label>Email <input name=email type=email autocomplete=username required></label><label>Password <input name=password type=password autocomplete=current-password required></label><button type=submit>Sign in</button></form>"+googleButton+"</main><script src='/connect/openai/openai-connect.js' defer></script></body></html>");
  }

  @GetMapping(value="/consent", produces=MediaType.TEXT_HTML_VALUE)
  @ResponseBody
  public ResponseEntity<String> consent(@RequestParam String client_id, @RequestParam String state,
      HttpServletRequest request, Authentication authentication) {
    if (!isAuthenticated(authentication))
      return ResponseEntity.status(302).header(HttpHeaders.LOCATION, "/connect/openai/login")
          .header(HttpHeaders.CACHE_CONTROL, "no-store").header(HttpHeaders.PRAGMA, "no-cache").build();
    if (!OAuthConsentRequestStore.matches(request, client_id, state))
      return html(400, messagePage("Invalid consent request", "Start the connection again from OpenAI."));
    String csrf = request.getAttribute("_csrf") instanceof org.springframework.security.web.csrf.CsrfToken t
        ? "<input type=\"hidden\" name=\""+t.getParameterName()+"\" value=\""+escape(t.getToken())+"\">" : "";
    List<OpenAiScope> requested = OpenAiScope.valuesList().stream()
        .filter(OAuthConsentRequestStore.scopes(request, client_id, state)::contains)
        .map(value -> OpenAiScope.fromValue(value).orElseThrow()).toList();
    StringBuilder fields = new StringBuilder(csrf).append(hidden("client_id", client_id)).append(hidden("state", state));
    for (OpenAiScope item : requested) fields.append("<label class=scope-option><input type=checkbox name=scope value=\"")
        .append(escape(item.value())).append("\" checked><span>").append(escape(item.label())).append("</span></label>");
    if (requested.isEmpty()) return html(messagePage("OpenAI connection", "No supported read permissions were requested. Start the connection again from OpenAI."));
    String consentStyle = "<style>main{max-width:520px;margin:24px auto;padding:20px}.consent-form{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:16px 0}.scope-option{display:flex;align-items:center;gap:10px;min-height:40px;padding:8px 10px;border:1px solid var(--workspace-border);border-radius:8px;background:var(--workspace-surface);font-size:14px;font-weight:500;cursor:pointer}.scope-option:hover{background:var(--workspace-background)}.scope-option input[type=checkbox]{flex:0 0 18px;width:18px;height:18px;accent-color:var(--workspace-accent)}.consent-form button{grid-column:1/-1}.cancel-form button{background:var(--workspace-surface);color:var(--workspace-accent)}.cancel-form button:hover{background:var(--workspace-background)}@media(max-width:520px){main{margin:12px auto;padding:16px}.consent-form{grid-template-columns:1fr}}</style>";
    // Spring Authorization Server interprets a consent POST without scopes as
    // denial. Keep cancellation separate so checked permissions cannot leak in,
    // including when JavaScript is unavailable.
    String cancellation = csrf + hidden("client_id", client_id) + hidden("state", state);
    return html("<!doctype html><html><head><meta name=viewport content='width=device-width,initial-scale=1'><title>Approve OpenAI access</title>"+PAGE_STYLE+PAGE_THEME+consentStyle+"</head><body>"+PAGE_HEADER+"<main><h1>Connect Recall Personal Knowledge Base</h1><p>Choose the read-only categories this connection can access.</p><form class=consent-form method=post action='/oauth2/authorize'>"+fields+"<button name=user_oauth_approval value=true>Approve selected access</button></form><form class=cancel-form method=post action='/oauth2/authorize'>"+cancellation+"<button type=submit name=user_oauth_approval value=false>Cancel connection</button></form></main></body></html>");
  }

  private static String hidden(String name, String value) { return "<input type=hidden name=\""+name+"\" value=\""+escape(value)+"\">"; }

  public record AccountInfo(String email, String csrfParameter, String csrfToken, String authorizationUrl) {}

  @GetMapping(value="/account-info", produces=MediaType.APPLICATION_JSON_VALUE)
  @ResponseBody
  public ResponseEntity<AccountInfo> accountInfo(HttpServletRequest request, Authentication authentication) {
    var session = request.getSession(false);
    if (!isAuthenticated(authentication) || session == null
        || !(session.getAttribute(OAuthAccountConfirmationFilter.PENDING) instanceof String authorizationUrl))
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Connection expired; start again from OpenAI");
    User user;
    try {
      user = users.findById(java.util.UUID.fromString(authentication.getName())).orElseThrow();
    } catch (IllegalArgumentException | java.util.NoSuchElementException ex) {
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Session expired; start again from OpenAI");
    }
    if (!(request.getAttribute("_csrf") instanceof org.springframework.security.web.csrf.CsrfToken csrf))
      throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Connection unavailable");
    return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "no-store")
        .header(HttpHeaders.PRAGMA, "no-cache")
        .body(new AccountInfo(user.getEmail(), csrf.getParameterName(), csrf.getToken(), authorizationUrl));
  }

  @GetMapping(value="/account", produces=MediaType.TEXT_HTML_VALUE)
  @ResponseBody
  public ResponseEntity<String> account(HttpServletRequest request, Authentication authentication) {
    if (!isAuthenticated(authentication))
      return ResponseEntity.status(302).header(HttpHeaders.LOCATION, "/connect/openai/login").build();
    var session = request.getSession(false);
    if (session == null || !(session.getAttribute(OAuthAccountConfirmationFilter.PENDING) instanceof String))
      return html(400, messagePage("Connection expired", "Start the connection again from OpenAI."));
    User user;
    try {
      user = users.findById(java.util.UUID.fromString(authentication.getName())).orElseThrow();
    } catch (IllegalArgumentException | java.util.NoSuchElementException ex) {
      return html(401, messagePage("Session expired", "Start the connection again from OpenAI."));
    }
    String csrf = request.getAttribute("_csrf") instanceof org.springframework.security.web.csrf.CsrfToken t
        ? hidden(t.getParameterName(), t.getToken()) : "";
    return html("<!doctype html><html><head><meta name=viewport content='width=device-width,initial-scale=1'><title>Confirm account · Knowledge Base</title>"+PAGE_STYLE+PAGE_THEME+"</head><body>"+PAGE_HEADER+"<main><h1>Connect Knowledge Base</h1><p>You’re signed in to Knowledge Base as <strong>"+escape(user.getEmail())+"</strong>.</p><form method=post action='/connect/openai/account'>"+csrf+"<button name=action value=continue>Continue</button><button name=action value=switch>Switch account</button></form></main></body></html>");
  }

  @PostMapping("/account")
  @ResponseBody
  public ResponseEntity<?> chooseAccount(@RequestParam String action, HttpServletRequest request,
      Authentication authentication) {
    var session = request.getSession(false);
    if (!isAuthenticated(authentication) || session == null
        || !(session.getAttribute(OAuthAccountConfirmationFilter.PENDING) instanceof String target))
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Connection expired; start again from OpenAI");
    if ("continue".equals(action)) {
      session.removeAttribute(OAuthAccountConfirmationFilter.PENDING);
      session.setAttribute(OAuthAccountConfirmationFilter.APPROVED, target);
      if (expectsJson(request)) return continuation(target);
      return ResponseEntity.status(302).header(HttpHeaders.LOCATION, target).build();
    }
    if ("switch".equals(action)) {
      session.removeAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY);
      session.removeAttribute(OAuthAccountConfirmationFilter.APPROVED);
      SecurityContextHolder.clearContext();
      request.changeSessionId();
      if (expectsJson(request)) return continuation("/connect/openai/login");
      return ResponseEntity.status(302).header(HttpHeaders.LOCATION, "/connect/openai/login").build();
    }
    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid account selection");
  }

  @PostMapping(value="/login", consumes=MediaType.APPLICATION_FORM_URLENCODED_VALUE)
  @ResponseBody
  @io.swagger.v3.oas.annotations.Operation(summary = "Sign in for the OpenAI OAuth authorization flow")
  public ResponseEntity<?> login(@RequestParam String email, @RequestParam String password, HttpServletRequest request,
      jakarta.servlet.http.HttpServletResponse response) {
    String normalizedEmail = email.trim().toLowerCase(Locale.ROOT);
    checkRate(request, normalizedEmail);
    User user = users.findByEmailIgnoreCase(normalizedEmail).orElse(null);
    if (!PasswordTiming.matches(passwords, password, user))
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid email or password");
    establishSession(user, request, response);
    String continuation = safeContinuation(request);
    if (expectsJson(request)) return continuation(continuation);
    return ResponseEntity.status(302).header(HttpHeaders.LOCATION, continuation).build();
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
    HttpSession session = request.getSession(false);
    if (session != null && session.getAttribute(OAuthAccountConfirmationFilter.PENDING) instanceof String pending)
      return pending;
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
  private static boolean expectsJson(HttpServletRequest request) {
    String accept = request.getHeader(HttpHeaders.ACCEPT);
    if (accept == null) return false;
    try {
      return MediaType.parseMediaTypes(accept).stream().anyMatch(mediaType ->
          mediaType.getQualityValue() > 0
              && "application".equalsIgnoreCase(mediaType.getType())
              && ("json".equalsIgnoreCase(mediaType.getSubtype())
                  || mediaType.getSubtype().toLowerCase(Locale.ROOT).endsWith("+json")));
    } catch (IllegalArgumentException ignored) {
      return false;
    }
  }
  private static ResponseEntity<AuthorizationContinuation> continuation(String url) {
    return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON)
        .cacheControl(CacheControl.noStore()).body(new AuthorizationContinuation(url));
  }
  private static String escape(String v) { return v.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;").replace("\"","&quot;").replace("'","&#39;"); }
  private static boolean isAuthenticated(Authentication authentication) {
    return authentication != null && authentication.isAuthenticated()
        && !(authentication instanceof AnonymousAuthenticationToken);
  }
  private static ResponseEntity<String> html(String body) { return html(200, body); }
  private static String messagePage(String title, String message) {
    return "<!doctype html><html><head><meta name=viewport content='width=device-width,initial-scale=1'><title>"
        + escape(title) + " · Knowledge Base</title>" + PAGE_STYLE + PAGE_THEME
        + "</head><body>" + PAGE_HEADER + "<main><h1>" + escape(title) + "</h1><p>"
        + escape(message) + "</p><a href='/'>Return to Knowledge Base</a></main></body></html>";
  }
  private static ResponseEntity<String> html(int status, String body) {
    return ResponseEntity.status(status).contentType(new MediaType(MediaType.TEXT_HTML, java.nio.charset.StandardCharsets.UTF_8))
        .header(HttpHeaders.CACHE_CONTROL, "no-store").header(HttpHeaders.PRAGMA, "no-cache").body(body);
  }
  public record GoogleLogin(String idToken) {}
}
