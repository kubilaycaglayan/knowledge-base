package com.know.api;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.know.domain.User;
import com.know.domain.UserRepository;
import com.know.security.GoogleIdentityVerifier;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;

@WebMvcTest(AuthController.class)
@Import({com.know.security.SecurityConfig.class, com.know.security.AuthAttemptLimiter.class})
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
  @MockBean GoogleIdentityVerifier google;
  @Autowired CorsConfigurationSource corsConfigurationSource;

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
        .andExpect(jsonPath("$.email").value("person@example.com"))
        .andExpect(jsonPath("$.passwordHash").doesNotExist())
        .andExpect(jsonPath("$.googleSubject").doesNotExist());
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
  void registrationRejectsMalformedEmailsAndPasswordsOverTheMaximumLength() throws Exception {
    mvc.perform(
            post("/api/v1/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"not-an-email\",\"password\":\"correct-horse-battery\"}"))
        .andExpect(status().isBadRequest());

    String oversizedPassword = "p".repeat(201);
    mvc.perform(
            post("/api/v1/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"person@example.com\",\"password\":\"" + oversizedPassword + "\"}"))
        .andExpect(status().isBadRequest());
    verifyNoInteractions(users, encoder);
  }

  @Test
  void credentialsRejectBlankEmailAndPasswordForRegistrationAndLogin() throws Exception {
    for (String path : List.of("/api/v1/auth/register", "/api/v1/auth/login")) {
      for (String request :
          List.of(
              "{\"email\":\" \",\"password\":\"correct-horse-battery\"}",
              "{\"email\":\"person@example.com\",\"password\":\" \"}")) {
        mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(request))
            .andExpect(status().isBadRequest());
      }
    }
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
  void loginUsesTheSameFailureForUnknownEmailAndWrongPassword() throws Exception {
    User existing = new User("known@example.com", "hash", "known");
    when(users.findByEmailIgnoreCase("known@example.com")).thenReturn(Optional.of(existing));
    when(users.findByEmailIgnoreCase("unknown@example.com")).thenReturn(Optional.empty());
    when(encoder.matches("wrong-password-value", "hash")).thenReturn(false);

    String knownFailure =
        mvc.perform(
                post("/api/v1/auth/login")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"email\":\"known@example.com\",\"password\":\"wrong-password-value\"}"))
            .andExpect(status().isUnauthorized())
            .andReturn()
            .getResponse()
            .getContentAsString();
    String unknownFailure =
        mvc.perform(
                post("/api/v1/auth/login")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"email\":\"unknown@example.com\",\"password\":\"wrong-password-value\"}"))
            .andExpect(status().isUnauthorized())
            .andReturn()
            .getResponse()
            .getContentAsString();

    org.junit.jupiter.api.Assertions.assertEquals(knownFailure, unknownFailure);
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
  void googleLoginRejectsBlankAndOverlongIdTokensAtTheRequestBoundary() throws Exception {
    mvc.perform(
            post("/api/v1/auth/google")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"idToken\":\" \"}"))
        .andExpect(status().isBadRequest());

    String oversizedToken = "x".repeat(10001);
    mvc.perform(
            post("/api/v1/auth/google")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"idToken\":\"" + oversizedToken + "\"}"))
        .andExpect(status().isBadRequest());
    verifyNoInteractions(google, users);
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
        .andExpect(jsonPath("$.email").value("person@example.com"))
        .andExpect(jsonPath("$.passwordHash").doesNotExist())
        .andExpect(jsonPath("$.googleSubject").doesNotExist());
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
        .andExpect(jsonPath("$.email").value("new@example.com"))
        .andExpect(jsonPath("$.passwordHash").doesNotExist())
        .andExpect(jsonPath("$.googleSubject").doesNotExist());
    var account = org.mockito.ArgumentCaptor.forClass(User.class);
    verify(users).save(account.capture());
    org.junit.jupiter.api.Assertions.assertEquals("new-sub", account.getValue().getGoogleSubject());
    org.junit.jupiter.api.Assertions.assertEquals(
        "New Person", account.getValue().getDisplayName());
    verify(encoder).encode(anyString());
  }

  @Test
  void currentAccountReturnsOnlyTheAuthenticatedUsersPublicProfile() throws Exception {
    UUID id = UUID.randomUUID();
    User user = new User("person@example.com", "private-hash", "Person");
    when(users.findById(id)).thenReturn(Optional.of(user));
    var auth = new UsernamePasswordAuthenticationToken(id.toString(), null, List.of());

    mvc.perform(get("/api/v1/auth/me").with(authentication(auth)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.userId").value(user.getId().toString()))
        .andExpect(jsonPath("$.email").value("person@example.com"))
        .andExpect(jsonPath("$.displayName").value("Person"))
        .andExpect(jsonPath("$.hasPassword").value(true))
        .andExpect(jsonPath("$.hasGoogle").value(false))
        .andExpect(
            content()
                .string(
                    org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.containsString("private-hash"))));
  }

  @Test
  void googleOnlyUserCanSetPasswordAfterAuthentication() throws Exception {
    UUID id = UUID.randomUUID();
    User user = new User("person@example.com", "random-hash", "Person", false);
    user.linkGoogleSubject("google-sub");
    when(users.findById(id)).thenReturn(Optional.of(user));
    when(encoder.encode("new-secure-password")).thenReturn("new-hash");
    when(users.save(user)).thenReturn(user);
    var auth = new UsernamePasswordAuthenticationToken(id.toString(), null, List.of());

    mvc.perform(
            org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put(
                    "/api/v1/auth/password")
                .with(authentication(auth))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"newPassword\":\"new-secure-password\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.hasPassword").value(true));
    verify(encoder).encode("new-secure-password");
  }

  @Test
  void passwordSetupRejectsNewPasswordsOutsideTheSupportedLength() throws Exception {
    var auth = new UsernamePasswordAuthenticationToken(UUID.randomUUID().toString(), null, List.of());
    for (String password : List.of("", " ", "12345678", "p".repeat(201))) {
      mvc.perform(
              org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put(
                      "/api/v1/auth/password")
                  .with(authentication(auth))
                  .contentType(MediaType.APPLICATION_JSON)
                  .content("{\"newPassword\":\"" + password + "\"}"))
          .andExpect(status().isBadRequest());
    }
    verifyNoInteractions(users, encoder);
  }

  @Test
  void passwordChangeRequiresTheCurrentPasswordWhenAlreadyConfigured() throws Exception {
    UUID id = UUID.randomUUID();
    User user = new User("person@example.com", "hash", "Person");
    when(users.findById(id)).thenReturn(Optional.of(user));
    when(encoder.matches("wrong-current", "hash")).thenReturn(false);
    var auth = new UsernamePasswordAuthenticationToken(id.toString(), null, List.of());

    mvc.perform(
            org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put(
                    "/api/v1/auth/password")
                .with(authentication(auth))
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    "{\"currentPassword\":\"wrong-current\",\"newPassword\":\"new-secure-password\"}"))
        .andExpect(status().isBadRequest());
    verify(users, never()).save(any());
  }

  @Test
  void passwordChangeRejectsMissingCurrentPasswordWhenAlreadyConfigured() throws Exception {
    UUID id = UUID.randomUUID();
    User user = new User("person@example.com", "hash", "Person");
    when(users.findById(id)).thenReturn(Optional.of(user));
    var auth = new UsernamePasswordAuthenticationToken(id.toString(), null, List.of());

    mvc.perform(
            org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put(
                    "/api/v1/auth/password")
                .with(authentication(auth))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"newPassword\":\"new-secure-password\"}"))
        .andExpect(status().isBadRequest());
    verifyNoInteractions(encoder);
    verify(users, never()).save(any());
  }

  @Test
  void passwordChangeRequiresCurrentPasswordEvenWhenGoogleIsAlsoLinked() throws Exception {
    UUID id = UUID.randomUUID();
    User user = new User("person@example.com", "hash", "Person");
    user.linkGoogleSubject("google-sub");
    when(users.findById(id)).thenReturn(Optional.of(user));
    when(encoder.matches("wrong-current", "hash")).thenReturn(false);
    var auth = new UsernamePasswordAuthenticationToken(id.toString(), null, List.of());

    mvc.perform(
            org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put(
                    "/api/v1/auth/password")
                .with(authentication(auth))
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    "{\"currentPassword\":\"wrong-current\",\"newPassword\":\"new-secure-password\"}"))
        .andExpect(status().isBadRequest());
    verify(users, never()).save(any());
  }

  @Test
  void passwordChangeWithCorrectCurrentPasswordPersistsTheReplacement() throws Exception {
    UUID id = UUID.randomUUID();
    User user = new User("person@example.com", "old-hash", "Person");
    when(users.findById(id)).thenReturn(Optional.of(user));
    when(encoder.matches("old-password", "old-hash")).thenReturn(true);
    when(encoder.encode("new-secure-password")).thenReturn("new-hash");
    when(users.save(user)).thenReturn(user);
    var auth = new UsernamePasswordAuthenticationToken(id.toString(), null, List.of());

    mvc.perform(
            org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put(
                    "/api/v1/auth/password")
                .with(authentication(auth))
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    "{\"currentPassword\":\"old-password\",\"newPassword\":\"new-secure-password\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.hasPassword").value(true));
    verify(encoder).matches("old-password", "old-hash");
    verify(encoder).encode("new-secure-password");
    verify(users).save(user);
    org.junit.jupiter.api.Assertions.assertEquals("new-hash", user.getPasswordHash());
  }

  @Test
  void rateLimitedAuthenticationReturnsTooManyRequests() throws Exception {
    for (int attempt = 0; attempt < 10; attempt++)
      mvc.perform(authPost("/api/v1/auth/login", "limited@example.com", "198.51.100.53"))
          .andExpect(status().isUnauthorized());
    org.mockito.Mockito.reset(users, encoder);
    mvc.perform(authPost("/api/v1/auth/login", "limited@example.com", "198.51.100.53"))
        .andExpect(status().isTooManyRequests())
        .andExpect(jsonPath("$.error").value(
            "Too many authentication attempts; try again shortly"))
        .andExpect(header().doesNotExist("Retry-After"));
    verifyNoInteractions(users, encoder);
  }

  @Test
  void loginBudgetIsPerNormalizedEmailAndIgnoresForwardedAddressHeaders() throws Exception {
    for (int attempt = 0; attempt < 10; attempt++)
      mvc.perform(authPost("/api/v1/auth/login", "Person@Example.com", "198.51.100." + attempt))
          .andExpect(status().isUnauthorized());
    mvc.perform(authPost("/api/v1/auth/login", "person@example.com", "198.51.100.99"))
        .andExpect(status().isTooManyRequests());
    mvc.perform(authPost("/api/v1/auth/login", "other@example.com", "198.51.100.99"))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void registrationAndGoogleBudgetsAreAppliedAtTheHttpBoundary() throws Exception {
    when(users.findByEmailIgnoreCase("register@example.com")).thenReturn(Optional.empty());
    when(encoder.encode("correct-horse-battery")).thenReturn("hash");
    when(users.save(any(User.class))).thenAnswer(invocation -> invocation.getArgument(0));
    for (int attempt = 0; attempt < 10; attempt++)
      mvc.perform(authPost("/api/v1/auth/register", "register@example.com", "192.0.2.52"))
          .andExpect(status().isOk());
    mvc.perform(authPost("/api/v1/auth/register", "register@example.com", "192.0.2.52"))
        .andExpect(status().isTooManyRequests())
        .andExpect(jsonPath("$.error").value(
            "Too many authentication attempts; try again shortly"));

    for (int attempt = 0; attempt < 10; attempt++)
      mvc.perform(googlePost("192.0.2.11")).andExpect(status().isUnauthorized());
    mvc.perform(googlePost("192.0.2.11"))
        .andExpect(status().isTooManyRequests())
        .andExpect(jsonPath("$.error").value(
            "Too many authentication attempts; try again shortly"));
  }

  private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder authPost(
      String path, String email, String forwardedFor) {
    return post(path)
        .with(request -> { request.setRemoteAddr("198.51.100.50"); return request; })
        .header("X-Forwarded-For", forwardedFor)
        .contentType(MediaType.APPLICATION_JSON)
        .content("{\"email\":\"" + email + "\",\"password\":\"correct-horse-battery\"}");
  }

  private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder googlePost(
      String forwardedFor) {
    return post("/api/v1/auth/google")
        .with(request -> { request.setRemoteAddr("198.51.100.51"); return request; })
        .header("X-Forwarded-For", forwardedFor)
        .contentType(MediaType.APPLICATION_JSON)
        .content("{\"idToken\":\"bad-token\"}");
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
