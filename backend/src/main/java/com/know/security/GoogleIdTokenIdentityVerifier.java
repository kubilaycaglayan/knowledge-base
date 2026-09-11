package com.know.security;

import com.google.api.client.googleapis.auth.oauth2.GoogleIdToken;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier;
import com.google.api.client.googleapis.javanet.GoogleNetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import java.security.GeneralSecurityException;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Value;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public final class GoogleIdTokenIdentityVerifier implements GoogleIdentityVerifier {
  private static final Logger log = LoggerFactory.getLogger(GoogleIdTokenIdentityVerifier.class);
  private final GoogleIdTokenVerifier verifier;

  public GoogleIdTokenIdentityVerifier(@Value("${app.google-client-id:}") String clientId) {
    if (clientId == null || clientId.isBlank()) {
      verifier = null;
      log.warn("Google identity verifier is disabled because no client ID is configured");
      return;
    }
    try {
      verifier =
          new GoogleIdTokenVerifier.Builder(
                  GoogleNetHttpTransport.newTrustedTransport(), GsonFactory.getDefaultInstance())
              .setAudience(List.of(clientId.trim()))
              .build();
      log.info("Google identity verifier initialized");
    } catch (GeneralSecurityException | java.io.IOException e) {
      throw new IllegalStateException("Could not initialize Google identity verification", e);
    }
  }

  @Override
  public Optional<Identity> verify(String idToken) {
    if (verifier == null) {
      log.warn("Google identity verification rejected: verifier-disabled");
      return Optional.empty();
    }
    if (idToken == null || idToken.isBlank()) {
      log.warn("Google identity verification rejected: token-missing");
      return Optional.empty();
    }
    try {
      GoogleIdToken token = verifier.verify(idToken.trim());
      if (token == null) {
        log.warn("Google identity verification rejected: signature-issuer-audience-or-expiry");
        return Optional.empty();
      }
      GoogleIdToken.Payload payload = token.getPayload();
      String email = payload.getEmail();
      if (!Boolean.TRUE.equals(payload.getEmailVerified()) || email == null || email.isBlank()) {
        log.warn("Google identity verification rejected: verified-email-missing");
        return Optional.empty();
      }
      String subject = payload.getSubject();
      if (subject == null || subject.isBlank()) {
        log.warn("Google identity verification rejected: subject-missing");
        return Optional.empty();
      }
      String displayName =
          payload.get("name") instanceof String name && !name.isBlank()
              ? name.trim()
              : email.substring(0, email.indexOf('@'));
      log.info("Google identity verification succeeded");
      return Optional.of(new Identity(subject, email.trim().toLowerCase(Locale.ROOT), displayName));
    } catch (Exception exception) {
      log.warn("Google identity verification failed with {}", exception.getClass().getSimpleName());
      return Optional.empty();
    }
  }
}
