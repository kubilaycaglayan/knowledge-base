package com.know.api;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.know.domain.User;
import com.know.domain.UserRepository;
import com.know.security.AuthAttemptLimiter;
import com.know.security.GoogleIdentityVerifier;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

class OpenAiConnectControllerTest {
  @AfterEach
  void clearSecurityContext() {
    SecurityContextHolder.clearContext();
  }

  private OpenAiConnectController controller(UserRepository users, PasswordEncoder passwords,
      GoogleIdentityVerifier google, AuthAttemptLimiter limiter) {
    return new OpenAiConnectController(users, passwords, google, limiter, "");
  }

  @Test
  void loginPageProvidesAnOAuthSpecificPasswordForm() {
    var page = controller(mock(UserRepository.class), mock(PasswordEncoder.class),
        mock(GoogleIdentityVerifier.class), mock(AuthAttemptLimiter.class))
        .loginPage(new MockHttpServletRequest());

    assertTrue(page.contains("action='/connect/openai/login'"));
    assertTrue(page.contains("autocomplete=current-password"));
  }

  @Test
  void consentPageOffersOnlySupportedRequestedReadScopes() {
    var page = controller(mock(UserRepository.class), mock(PasswordEncoder.class),
        mock(GoogleIdentityVerifier.class), mock(AuthAttemptLimiter.class))
        .consent("knowledge-base-openai", "csrf-state",
            "kb:notes:read unsupported:write kb:logs:read", new MockHttpServletRequest());

    assertTrue(page.contains("Notes"));
    assertTrue(page.contains("Logs"));
    assertFalse(page.contains("unsupported:write"));
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
                new MockHttpServletRequest()));

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
        .google(new OpenAiConnectController.GoogleLogin("verified-google-token"), request);

    assertEquals("/", response.authorizationUrl());
    assertNotNull(request.getSession(false));
    assertEquals(user.getId().toString(), SecurityContextHolder.getContext().getAuthentication().getName());
  }
}
