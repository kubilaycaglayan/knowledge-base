package com.know.security;

import com.know.domain.User;
import java.util.UUID;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

/** Performs one BCrypt comparison even when an email is unknown or has no password. */
public final class PasswordTiming {
  private static final String DUMMY_HASH = new BCryptPasswordEncoder().encode(UUID.randomUUID().toString());

  private PasswordTiming() {}

  public static boolean matches(PasswordEncoder encoder, String rawPassword, User user) {
    boolean hasPassword = user != null && user.hasPassword();
    String hash = hasPassword ? user.getPasswordHash() : DUMMY_HASH;
    boolean matches = encoder.matches(rawPassword, hash);
    return hasPassword && matches;
  }
}
