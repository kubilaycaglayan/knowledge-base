package com.know.security;

import java.util.Optional;

/** Verifies an untrusted Google ID token and exposes only the claims used for account login. */
public interface GoogleIdentityVerifier {
    Optional<Identity> verify(String idToken);

    record Identity(String subject, String email, String displayName) {}
}
