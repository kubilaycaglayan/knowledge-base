package com.know.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

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
    GoogleIdTokenIdentityVerifier verifier = new GoogleIdTokenIdentityVerifier(null);

    assertEquals(Optional.empty(), verifier.verify("token"));
  }

  @Test
  void configuredVerifierRejectsMalformedTokenWithoutThrowing() {
    GoogleIdTokenIdentityVerifier verifier = new GoogleIdTokenIdentityVerifier("client-id");

    assertTrue(verifier.verify("malformed-token").isEmpty());
  }
}
