package com.know.domain;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "app_user")
public class User {
  @Id private UUID id = UUID.randomUUID();

  @Column(nullable = false, unique = true, length = 320)
  private String email;

  @Column(name = "password_hash", nullable = false)
  private String passwordHash;

  @Column(name = "password_configured", nullable = false)
  private boolean passwordConfigured = true;

  @Column(name = "google_subject", length = 255)
  private String googleSubject;

  @Column(name = "display_name", nullable = false)
  private String displayName;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt = Instant.now();

  protected User() {}

  public User(String email, String passwordHash, String displayName) {
    this.email = email;
    this.passwordHash = passwordHash;
    this.displayName = displayName;
  }

  public User(String email, String passwordHash, String displayName, boolean passwordConfigured) {
    this(email, passwordHash, displayName);
    this.passwordConfigured = passwordConfigured;
  }

  public UUID getId() {
    return id;
  }

  public String getEmail() {
    return email;
  }

  public String getPasswordHash() {
    return passwordHash;
  }

  public boolean hasPassword() {
    return passwordConfigured;
  }

  public void setPassword(String passwordHash) {
    this.passwordHash = passwordHash;
    this.passwordConfigured = true;
  }

  public String getDisplayName() {
    return displayName;
  }

  public String getGoogleSubject() {
    return googleSubject;
  }

  public void linkGoogleSubject(String subject) {
    this.googleSubject = subject;
  }
}
