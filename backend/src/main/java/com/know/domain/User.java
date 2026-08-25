package com.know.domain;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity @Table(name="app_user")
public class User {
    @Id private UUID id = UUID.randomUUID();
    @Column(nullable=false, unique=true, length=320) private String email;
    @Column(name="password_hash", nullable=false) private String passwordHash;
    @Column(name="display_name", nullable=false) private String displayName;
    @Column(name="created_at", nullable=false) private Instant createdAt = Instant.now();
    protected User() {}
    public User(String email, String passwordHash, String displayName) { this.email=email; this.passwordHash=passwordHash; this.displayName=displayName; }
    public UUID getId(){return id;} public String getEmail(){return email;} public String getPasswordHash(){return passwordHash;} public String getDisplayName(){return displayName;}
}
