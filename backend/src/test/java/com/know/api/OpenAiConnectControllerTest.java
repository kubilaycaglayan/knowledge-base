package com.know.api;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.know.domain.User;
import com.know.domain.UserRepository;
import com.know.security.AuthAttemptLimiter;
import com.know.security.GoogleIdentityVerifier;
import com.know.security.OAuthConsentRequestStore;
import com.know.security.OAuthAccountConfirmationFilter;
import java.util.Optional;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.csrf.DefaultCsrfToken;
import org.springframework.security.web.authentication.session.SessionAuthenticationStrategy;
import org.springframework.web.server.ResponseStatusException;

class OpenAiConnectControllerTest {
  @Test
  void accountConfirmationDisplaysEscapedIdentityAndOffersSwitch() {
    User user = new User("person@example.com", "hash", "Person");
    UserRepository users = mock(UserRepository.class);
    when(users.findById(user.getId())).thenReturn(Optional.of(user));
    MockHttpServletRequest request = new MockHttpServletRequest();
    request.getSession().setAttribute(OAuthAccountConfirmationFilter.PENDING, "/oauth2/authorize?state=abc");
    request.setAttribute("_csrf", new DefaultCsrfToken("X-CSRF-TOKEN", "_csrf", "csrf-test"));
    var result = controller(users, mock(PasswordEncoder.class), mock(GoogleIdentityVerifier.class), mock(AuthAttemptLimiter.class))
        .account(request, new TestingAuthenticationToken(user.getId().toString(), "", "ROLE_USER"));
    assertTrue(result.getBody().contains("person@example.com"));
    assertTrue(result.getBody().contains("Switch account"));
    assertTrue(result.getBody().contains("csrf-test"));
    assertEquals(java.nio.charset.StandardCharsets.UTF_8, result.getHeaders().getContentType().getCharset());
    assertEquals("no-store", result.getHeaders().getFirst(HttpHeaders.CACHE_CONTROL));
  }

  @Test
  void accountInfoRequiresPendingAuthenticatedSessionAndReturnsCsrf() {
    User user = new User("person@example.com", "hash", "Person");
    UserRepository users = mock(UserRepository.class);
    when(users.findById(user.getId())).thenReturn(Optional.of(user));
    var instance = controller(users, mock(PasswordEncoder.class), mock(GoogleIdentityVerifier.class), mock(AuthAttemptLimiter.class));
    var request = new MockHttpServletRequest();
    var auth = new TestingAuthenticationToken(user.getId().toString(), "", "ROLE_USER");
    assertThrows(ResponseStatusException.class, () -> instance.accountInfo(request, auth));
    request.getSession().setAttribute(OAuthAccountConfirmationFilter.PENDING, "/oauth2/authorize?state=one");
    request.setAttribute("_csrf", new DefaultCsrfToken("X-CSRF-TOKEN", "_csrf", "test-csrf"));
    var response = instance.accountInfo(request, auth);
    assertEquals("person@example.com", response.getBody().email());
    assertEquals("test-csrf", response.getBody().csrfToken());
    assertEquals("/oauth2/authorize?state=one", response.getBody().authorizationUrl());
    assertEquals("no-store", response.getHeaders().getFirst(HttpHeaders.CACHE_CONTROL));
    assertThrows(ResponseStatusException.class, () -> instance.accountInfo(request, null));
  }

  @Test
  void switchAccountClearsAuthenticationAndPreservesPendingRequest() {
    var request = new MockHttpServletRequest();
    var session = request.getSession();
    String target = "/oauth2/authorize?state=abc";
    session.setAttribute(OAuthAccountConfirmationFilter.PENDING, target);
    session.setAttribute(org.springframework.security.web.context.HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY, "previous-user");
    var result = controller(mock(UserRepository.class), mock(PasswordEncoder.class), mock(GoogleIdentityVerifier.class), mock(AuthAttemptLimiter.class))
        .chooseAccount("switch", request, new TestingAuthenticationToken("user", "", "ROLE_USER"));
    assertEquals("/connect/openai/login", result.getHeaders().getFirst(HttpHeaders.LOCATION));
    assertNull(session.getAttribute(org.springframework.security.web.context.HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY));
    assertEquals(target, session.getAttribute(OAuthAccountConfirmationFilter.PENDING));
  }

  @Test
  void accountConfirmationCannotBeSubmittedWithoutPendingAuthorization() {
    var instance = controller(mock(UserRepository.class), mock(PasswordEncoder.class), mock(GoogleIdentityVerifier.class), mock(AuthAttemptLimiter.class));
    assertThrows(ResponseStatusException.class, () -> instance.chooseAccount("continue", new MockHttpServletRequest(),
        new TestingAuthenticationToken("user", "", "ROLE_USER")));
  }

  @Test
  void accountContinueReturnsJsonContinuationForBrowserManagedNavigation() throws Exception {
    var request = new MockHttpServletRequest();
    request.addHeader(HttpHeaders.ACCEPT, "application/json");
    String target = "/oauth2/authorize?response_type=code&state=abc";
    request.getSession().setAttribute(OAuthAccountConfirmationFilter.PENDING, target);

    var response = controller(mock(UserRepository.class), mock(PasswordEncoder.class),
        mock(GoogleIdentityVerifier.class), mock(AuthAttemptLimiter.class))
        .chooseAccount("continue", request, new TestingAuthenticationToken("user", "", "ROLE_USER"));

    assertEquals(200, response.getStatusCode().value());
    Object body = response.getBody();
    assertNotNull(body);
    assertEquals(target, body.getClass().getMethod("authorizationUrl").invoke(body));
  }
  @AfterEach
  void clearSecurityContext() {
    SecurityContextHolder.clearContext();
  }

  private OpenAiConnectController controller(UserRepository users, PasswordEncoder passwords,
      GoogleIdentityVerifier google, AuthAttemptLimiter limiter) {
    return new OpenAiConnectController(users, passwords, google, limiter,
        mock(SessionAuthenticationStrategy.class), "");
  }

  @Test
  void loginPageProvidesAnOAuthSpecificPasswordForm() {
    var page = controller(mock(UserRepository.class), mock(PasswordEncoder.class),
        mock(GoogleIdentityVerifier.class), mock(AuthAttemptLimiter.class))
        .loginPage(new MockHttpServletRequest());

    assertTrue(page.getBody().contains("action='/connect/openai/login'"));
    assertTrue(page.getBody().contains("autocomplete=current-password"));
    assertTrue(page.getBody().contains("id='openai-login-form'"));
    assertTrue(page.getBody().contains("src='/connect/openai/openai-connect.js'"));
    assertTrue(page.getBody().contains("src='/connect/openai/theme.js'"));
    assertTrue(page.getBody().contains("class='theme-toggle ghost'"));
    assertTrue(page.getBody().contains("id='openai-login-error'"));
    assertEquals("no-store", page.getHeaders().getFirst(HttpHeaders.CACHE_CONTROL));
    assertEquals("same-origin-allow-popups", page.getHeaders().getFirst("Cross-Origin-Opener-Policy"));
  }

  @Test
  void googleLoginPageLoadsItsCallbackFromASelfHostedScript() {
    MockHttpServletRequest request = new MockHttpServletRequest();
    request.setAttribute("_csrf", new DefaultCsrfToken("X-CSRF-TOKEN", "_csrf", "csrf-test"));
    var controller = new OpenAiConnectController(mock(UserRepository.class), mock(PasswordEncoder.class),
        mock(GoogleIdentityVerifier.class), mock(AuthAttemptLimiter.class),
        mock(SessionAuthenticationStrategy.class), "google-client-id");

    var page = controller.loginPage(request);

    assertTrue(page.getBody().contains("src='/connect/openai/openai-connect.js'"));
    assertTrue(page.getBody().contains("data-client-id='google-client-id'"));
    assertTrue(page.getBody().contains("id='google-connect-button'"));
    assertTrue(page.getBody().contains("data-csrf-token='csrf-test'"));
    assertFalse(page.getBody().contains("<script>"), "CSP must not have to permit inline JavaScript");
  }

  @Test
  void consentPageUsesSessionBoundSupportedScopesAndOffersApprovalOrDecline() {
    MockHttpServletRequest request = new MockHttpServletRequest();
    request.setAttribute("_csrf", new DefaultCsrfToken("X-CSRF-TOKEN", "_csrf", "csrf-test"));
    OAuthConsentRequestStore.remember(request, "knowledge-base-openai", "csrf-state",
        "kb:notes:read unsupported:write kb:logs:read");
    var page = controller(mock(UserRepository.class), mock(PasswordEncoder.class),
        mock(GoogleIdentityVerifier.class), mock(AuthAttemptLimiter.class))
        .consent("knowledge-base-openai", "csrf-state", request,
            new TestingAuthenticationToken("user-1", "", "ROLE_USER"));

    assertTrue(page.getBody().contains("Notes"));
    assertTrue(page.getBody().contains("src='/connect/openai/theme.js'"));
    assertTrue(page.getBody().contains("class='theme-toggle ghost'"));
    assertTrue(page.getBody().contains("Logs"));
    assertFalse(page.getBody().contains("unsupported:write"));
    assertTrue(page.getBody().contains("name=user_oauth_approval value=true"));
    assertTrue(page.getBody().contains("name=user_oauth_approval value=false"));
    var forms = java.util.regex.Pattern.compile("<form[^>]*>(.*?)</form>", java.util.regex.Pattern.DOTALL)
        .matcher(page.getBody());
    String cancelForm = null;
    while (forms.find()) {
      if (forms.group(1).contains("Cancel connection")) cancelForm = forms.group(1);
    }
    assertNotNull(cancelForm);
    assertFalse(cancelForm.contains("name=scope"), "Cancel must submit no scopes: Spring treats submitted scopes as approval");
    assertTrue(cancelForm.contains("csrf-test"));
    assertTrue(cancelForm.contains("csrf-state"));
    assertEquals("no-store", page.getHeaders().getFirst(HttpHeaders.CACHE_CONTROL));
  }

  @Test
  void directAnonymousConsentAccessRedirectsToOAuthLogin() {
    var response = controller(mock(UserRepository.class), mock(PasswordEncoder.class),
        mock(GoogleIdentityVerifier.class), mock(AuthAttemptLimiter.class))
        .consent("knowledge-base-openai", "direct-state", new MockHttpServletRequest(), null);

    assertEquals(302, response.getStatusCode().value());
    assertEquals("/connect/openai/login", response.getHeaders().getFirst(HttpHeaders.LOCATION));
  }

  @Test
  void oauthPasswordLoginStartsSessionAndReturnsToSafeContinuation() {
    UserRepository users = mock(UserRepository.class);
    PasswordEncoder passwords = mock(PasswordEncoder.class);
    AuthAttemptLimiter limiter = mock(AuthAttemptLimiter.class);
    SessionAuthenticationStrategy sessions = mock(SessionAuthenticationStrategy.class);
    User user = new User("person@example.com", "stored-bcrypt-hash", "Person");
    when(users.findByEmailIgnoreCase("person@example.com")).thenReturn(Optional.of(user));
    when(passwords.matches("correct-password", "stored-bcrypt-hash")).thenReturn(true);
    when(limiter.allow(anyString())).thenReturn(true);
    MockHttpServletRequest request = new MockHttpServletRequest();
    MockHttpServletResponse servletResponse = new MockHttpServletResponse();

    var response = new OpenAiConnectController(users, passwords, mock(GoogleIdentityVerifier.class), limiter,
        sessions, "").login(" person@example.com ", "correct-password", request, servletResponse);

    assertEquals(302, response.getStatusCode().value());
    assertEquals("/", response.getHeaders().getFirst(HttpHeaders.LOCATION));
    assertEquals(user.getId().toString(), SecurityContextHolder.getContext().getAuthentication().getName());
    verify(sessions).onAuthentication(any(), eq(request), eq(servletResponse));
  }

  @Test
  void oauthPasswordLoginReturnsJsonContinuationForBrowserManagedNavigation() throws Exception {
    UserRepository users = mock(UserRepository.class);
    PasswordEncoder passwords = mock(PasswordEncoder.class);
    AuthAttemptLimiter limiter = mock(AuthAttemptLimiter.class);
    SessionAuthenticationStrategy sessions = mock(SessionAuthenticationStrategy.class);
    User user = new User("person@example.com", "stored-bcrypt-hash", "Person");
    when(users.findByEmailIgnoreCase("person@example.com")).thenReturn(Optional.of(user));
    when(passwords.matches("correct-password", "stored-bcrypt-hash")).thenReturn(true);
    when(limiter.allow(anyString())).thenReturn(true);
    MockHttpServletRequest request = new MockHttpServletRequest();
    request.addHeader(HttpHeaders.ACCEPT, "application/json");
    String target = "/oauth2/authorize?response_type=code&state=abc";
    request.getSession().setAttribute(OAuthAccountConfirmationFilter.PENDING, target);
    MockHttpServletResponse servletResponse = new MockHttpServletResponse();

    var response = new OpenAiConnectController(users, passwords, mock(GoogleIdentityVerifier.class), limiter,
        sessions, "").login("person@example.com", "correct-password", request, servletResponse);

    assertEquals(200, response.getStatusCode().value());
    Object body = response.getBody();
    assertNotNull(body);
    assertEquals(target, body.getClass().getMethod("authorizationUrl").invoke(body));
  }

  @Test
  void oauthPasswordLoginRejectsUnknownAccountsAfterDummyPasswordComparison() {
    UserRepository users = mock(UserRepository.class);
    PasswordEncoder passwords = mock(PasswordEncoder.class);
    AuthAttemptLimiter limiter = mock(AuthAttemptLimiter.class);
    when(users.findByEmailIgnoreCase("missing@example.com")).thenReturn(Optional.empty());
    when(limiter.allow(anyString())).thenReturn(true);
    var controller = new OpenAiConnectController(users, passwords, mock(GoogleIdentityVerifier.class), limiter,
        mock(SessionAuthenticationStrategy.class), "");

    var error = assertThrows(ResponseStatusException.class, () -> controller.login("missing@example.com",
        "wrong-password", new MockHttpServletRequest(), new MockHttpServletResponse()));

    assertEquals(401, error.getStatusCode().value());
    verify(passwords).matches(eq("wrong-password"), anyString());
  }

  @Test
  void consentPageDoesNotTrustScopesFromTheQueryString() {
    MockHttpServletRequest request = new MockHttpServletRequest();
    OAuthConsentRequestStore.remember(request, "knowledge-base-openai", "state-one", "kb:notes:read");
    var response = controller(mock(UserRepository.class), mock(PasswordEncoder.class),
        mock(GoogleIdentityVerifier.class), mock(AuthAttemptLimiter.class))
        .consent("knowledge-base-openai", "state-one", request,
            new TestingAuthenticationToken("user-1", "", "ROLE_USER"));

    assertTrue(response.getBody().contains("Notes"));
    assertFalse(response.getBody().contains("Logs"));
  }

  @Test
  void googleOAuthLoginRejectsAnIdentityThatIsNotLinkedToAnAccount() {
    UserRepository users = mock(UserRepository.class);
    GoogleIdentityVerifier google = mock(GoogleIdentityVerifier.class);
    AuthAttemptLimiter limiter = mock(AuthAttemptLimiter.class);
    when(limiter.allow(anyString())).thenReturn(true);
    when(google.verify("verified-google-token"))
        .thenReturn(Optional.of(new GoogleIdentityVerifier.Identity("google-sub", "user@example.com", "User")));
    when(users.findByGoogleSubject("google-sub")).thenReturn(Optional.empty());

    var error = assertThrows(ResponseStatusException.class, () ->
        controller(users, mock(PasswordEncoder.class), google, limiter)
            .google(new OpenAiConnectController.GoogleLogin("verified-google-token"),
                new MockHttpServletRequest(), new MockHttpServletResponse()));

    assertEquals(401, error.getStatusCode().value());
    verify(users).findByGoogleSubject("google-sub");
  }

  @Test
  void googleOAuthLoginStartsAnOAuthSessionForAnAlreadyLinkedAccount() {
    UserRepository users = mock(UserRepository.class);
    GoogleIdentityVerifier google = mock(GoogleIdentityVerifier.class);
    AuthAttemptLimiter limiter = mock(AuthAttemptLimiter.class);
    User user = new User("user@example.com", "hash", "User");
    when(limiter.allow(anyString())).thenReturn(true);
    when(google.verify("verified-google-token"))
        .thenReturn(Optional.of(new GoogleIdentityVerifier.Identity("google-sub", "user@example.com", "User")));
    when(users.findByGoogleSubject("google-sub")).thenReturn(Optional.of(user));
    MockHttpServletRequest request = new MockHttpServletRequest();

    var response = controller(users, mock(PasswordEncoder.class), google, limiter)
        .google(new OpenAiConnectController.GoogleLogin("verified-google-token"), request, new MockHttpServletResponse());

    assertEquals("/", response.authorizationUrl());
    assertNotNull(request.getSession(false));
    assertEquals(user.getId().toString(), SecurityContextHolder.getContext().getAuthentication().getName());
  }
}
