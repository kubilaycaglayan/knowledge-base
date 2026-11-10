package com.know.api;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.know.domain.User;
import com.know.domain.UserRepository;
import com.know.security.AuthAttemptLimiter;
import com.know.security.GoogleIdentityVerifier;
import com.know.security.OAuthConsentRequestStore;
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
    assertEquals("no-store", page.getHeaders().getFirst(HttpHeaders.CACHE_CONTROL));
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
    assertTrue(page.getBody().contains("Logs"));
    assertFalse(page.getBody().contains("unsupported:write"));
    assertTrue(page.getBody().contains("name=user_oauth_approval value=true"));
    assertTrue(page.getBody().contains("name=user_oauth_approval value=false"));
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
