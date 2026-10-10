package com.know.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.google.api.client.googleapis.auth.oauth2.GoogleIdToken;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class GoogleIdTokenIdentityVerifierTest {
  @Test
  void disabledVerifierRejectsNullBlankAndArbitraryTokens() {
    GoogleIdTokenIdentityVerifier verifier = new GoogleIdTokenIdentityVerifier("  ");

    assertTrue(verifier.verify(null).isEmpty());
    assertTrue(verifier.verify("   ").isEmpty());
    assertTrue(verifier.verify("not-a-token").isEmpty());
  }

  @Test
  void missingClientIdAlsoDisablesVerification() {
    GoogleIdTokenIdentityVerifier verifier = new GoogleIdTokenIdentityVerifier((String) null);

    assertEquals(Optional.empty(), verifier.verify("token"));
  }

  @Test
  void configuredVerifierRejectsMalformedTokenWithoutThrowing() {
    GoogleIdTokenIdentityVerifier verifier = new GoogleIdTokenIdentityVerifier("client-id");

    assertTrue(verifier.verify("malformed-token").isEmpty());
  }

  @Test
  void configuredVerifierTrustsOnlyTheTrimmedConfiguredAudience() {
    assertEquals(
        List.of("web-client-id.apps.googleusercontent.com"),
        GoogleIdTokenIdentityVerifier.configuredAudience(
            "  web-client-id.apps.googleusercontent.com  "));
  }

  @Test
  void rejectsProviderIdentitiesWithoutVerifiedEmailOrSubject() throws Exception {
    GoogleIdToken.Payload unverifiedEmail = mock(GoogleIdToken.Payload.class);
    when(unverifiedEmail.getEmail()).thenReturn("person@example.com");
    when(unverifiedEmail.getEmailVerified()).thenReturn(false);
    when(unverifiedEmail.getSubject()).thenReturn("subject");
    assertTrue(verifierReturning(unverifiedEmail).verify("unverified").isEmpty());

    GoogleIdToken.Payload missingEmail = mock(GoogleIdToken.Payload.class);
    when(missingEmail.getEmailVerified()).thenReturn(true);
    when(missingEmail.getSubject()).thenReturn("subject");
    assertTrue(verifierReturning(missingEmail).verify("missing-email").isEmpty());

    GoogleIdToken.Payload missingSubject = mock(GoogleIdToken.Payload.class);
    when(missingSubject.getEmail()).thenReturn("person@example.com");
    when(missingSubject.getEmailVerified()).thenReturn(true);
    when(missingSubject.getSubject()).thenReturn(" ");
    assertTrue(verifierReturning(missingSubject).verify("missing-subject").isEmpty());
  }

  @Test
  void normalizesVerifiedProviderIdentityAndFallsBackToEmailName() throws Exception {
    GoogleIdToken.Payload payload = mock(GoogleIdToken.Payload.class);
    when(payload.getEmail()).thenReturn(" Person@Example.COM ");
    when(payload.getEmailVerified()).thenReturn(true);
    when(payload.getSubject()).thenReturn("provider-subject");

    var identity = verifierReturning(payload).verify("valid-token").orElseThrow();

    assertEquals("person@example.com", identity.email());
    assertEquals("provider-subject", identity.subject());
    assertEquals("person", identity.displayName());
  }

  @Test
  void trimsVerifiedProviderDisplayName() throws Exception {
    GoogleIdToken.Payload payload = mock(GoogleIdToken.Payload.class);
    when(payload.getEmail()).thenReturn("person@example.com");
    when(payload.getEmailVerified()).thenReturn(true);
    when(payload.getSubject()).thenReturn("provider-subject");
    when(payload.get("name")).thenReturn("  Person Name  ");

    var identity = verifierReturning(payload).verify("valid-token").orElseThrow();

    assertEquals("Person Name", identity.displayName());
  }

  private GoogleIdTokenIdentityVerifier verifierReturning(GoogleIdToken.Payload payload)
      throws Exception {
    GoogleIdToken token = mock(GoogleIdToken.class);
    when(token.getPayload()).thenReturn(payload);
    GoogleIdTokenVerifier verifier = mock(GoogleIdTokenVerifier.class);
    when(verifier.verify(org.mockito.ArgumentMatchers.anyString())).thenReturn(token);
    return new GoogleIdTokenIdentityVerifier(verifier);
  }
}
