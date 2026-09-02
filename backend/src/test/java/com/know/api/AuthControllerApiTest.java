package com.know.api;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.know.domain.User;
import com.know.domain.UserRepository;
import com.know.security.GoogleIdentityVerifier;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;

@WebMvcTest(AuthController.class)
@Import(com.know.security.SecurityConfig.class)
@TestPropertySource(
    properties = {
      "app.jwt-secret=api-test-secret-with-at-least-32-characters",
      "app.cors-origins=http://localhost",
      "app.google-client-id=google-client-id"
    })
class AuthControllerApiTest {
  @Autowired MockMvc mvc;
  @MockBean UserRepository users;
  @MockBean PasswordEncoder encoder;
  @MockBean com.know.security.AuthAttemptLimiter limiter;
  @MockBean GoogleIdentityVerifier google;
  @Autowired CorsConfigurationSource corsConfigurationSource;

  @BeforeEach
  void allowAuthenticationAttempts() {
    when(limiter.allow(anyString())).thenReturn(true);
  }

  @Test
  void googleConfigReturnsThePublicClientId() throws Exception {
    mvc.perform(get("/api/v1/auth/google/config"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.clientId").value("google-client-id"));
  }

  @Test
  void registerReturnsBearerTokenAndNormalizesEmail() throws Exception {
    User saved = new User("person@example.com", "hash", "person");
    when(users.findByEmailIgnoreCase("person@example.com")).thenReturn(Optional.empty());
    when(encoder.encode("correct-horse-battery")).thenReturn("hash");
    when(users.save(any(User.class))).thenReturn(saved);
    mvc.perform(
            post("/api/v1/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    "{\"email\":\"Person@Example.com\",\"password\":\"correct-horse-battery\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.token").isNotEmpty())
        .andExpect(jsonPath("$.email").value("person@example.com"));
    verify(encoder).encode("correct-horse-battery");
  }

  @Test
  void registrationRejectsShortPasswords() throws Exception {
    mvc.perform(
            post("/api/v1/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"person@example.com\",\"password\":\"short\"}"))
        .andExpect(status().isBadRequest());
    verifyNoInteractions(users, encoder);
  }

  @Test
  void duplicateRegistrationIsRejected() throws Exception {
    User existing = new User("person@example.com", "hash", "person");
    when(users.findByEmailIgnoreCase("person@example.com")).thenReturn(Optional.of(existing));
    mvc.perform(
            post("/api/v1/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    "{\"email\":\"person@example.com\",\"password\":\"correct-horse-battery\"}"))
        .andExpect(status().isConflict());
    verifyNoInteractions(encoder);
  }

  @Test
  void invalidLoginDoesNotRevealWhetherAccountExists() throws Exception {
    User existing = new User("person@example.com", "hash", "person");
    when(users.findByEmailIgnoreCase("person@example.com")).thenReturn(Optional.of(existing));
    when(encoder.matches("wrong-password-value", "hash")).thenReturn(false);
    mvc.perform(
            post("/api/v1/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    "{\"email\":\"person@example.com\",\"password\":\"wrong-password-value\"}"))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void invalidGoogleTokenIsRejectedBeforeAccountLookup() throws Exception {
    when(google.verify("bad-token")).thenReturn(Optional.empty());
    mvc.perform(
            post("/api/v1/auth/google")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"idToken\":\"bad-token\"}"))
        .andExpect(status().isUnauthorized());
    verifyNoInteractions(users);
  }

  @Test
  void verifiedGoogleIdentityLinksAnExistingEmail() throws Exception {
    User existing = new User("person@example.com", "hash", "person");
    when(google.verify("good-token"))
        .thenReturn(
            Optional.of(
                new GoogleIdentityVerifier.Identity("google-sub", "person@example.com", "Person")));
    when(users.findByGoogleSubject("google-sub")).thenReturn(Optional.empty());
    when(users.findByEmailIgnoreCase("person@example.com")).thenReturn(Optional.of(existing));
    when(users.save(existing)).thenReturn(existing);

    mvc.perform(
            post("/api/v1/auth/google")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"idToken\":\"good-token\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.email").value("person@example.com"));
    org.junit.jupiter.api.Assertions.assertEquals("google-sub", existing.getGoogleSubject());
    verify(users).save(existing);
    verifyNoInteractions(encoder);
  }

  @Test
  void verifiedGoogleIdentityCreatesAnAccountWithRandomUnusablePassword() throws Exception {
    User created = new User("new@example.com", "google-password-hash", "New Person");
    when(google.verify("new-token"))
        .thenReturn(
            Optional.of(
                new GoogleIdentityVerifier.Identity("new-sub", "new@example.com", "New Person")));
    when(users.findByGoogleSubject("new-sub")).thenReturn(Optional.empty());
    when(users.findByEmailIgnoreCase("new@example.com")).thenReturn(Optional.empty());
    when(encoder.encode(anyString())).thenReturn("google-password-hash");
    when(users.save(any(User.class))).thenAnswer(invocation -> invocation.getArgument(0));

    mvc.perform(
            post("/api/v1/auth/google")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"idToken\":\"new-token\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.email").value("new@example.com"));
    var account = org.mockito.ArgumentCaptor.forClass(User.class);
    verify(users).save(account.capture());
    org.junit.jupiter.api.Assertions.assertEquals("new-sub", account.getValue().getGoogleSubject());
    org.junit.jupiter.api.Assertions.assertEquals(
        "New Person", account.getValue().getDisplayName());
    verify(encoder).encode(anyString());
  }

  @Test
  void rateLimitedAuthenticationReturnsTooManyRequests() throws Exception {
    when(limiter.allow(anyString())).thenReturn(false);
    mvc.perform(
            post("/api/v1/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    "{\"email\":\"person@example.com\",\"password\":\"correct-horse-battery\"}"))
        .andExpect(status().isTooManyRequests());
    verifyNoInteractions(users, encoder);
  }

  @Test
  void configuredOriginReceivesCorsPermission() {
    MockHttpServletRequest request = new MockHttpServletRequest();
    request.addHeader("Origin", "http://localhost");
    CorsConfiguration configuration = corsConfigurationSource.getCorsConfiguration(request);

    org.junit.jupiter.api.Assertions.assertNotNull(configuration);
    org.junit.jupiter.api.Assertions.assertEquals(
        "http://localhost", configuration.checkOrigin("http://localhost"));
    org.junit.jupiter.api.Assertions.assertTrue(configuration.getAllowedMethods().contains("GET"));
  }

  @Test
  void unconfiguredOriginDoesNotReceiveCorsPermission() {
    MockHttpServletRequest request = new MockHttpServletRequest();
    CorsConfiguration configuration = corsConfigurationSource.getCorsConfiguration(request);

    org.junit.jupiter.api.Assertions.assertNotNull(configuration);
    org.junit.jupiter.api.Assertions.assertNull(
        configuration.checkOrigin("https://untrusted.example"));
  }
}
