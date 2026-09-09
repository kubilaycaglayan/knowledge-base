package com.know.domain;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "labels")
public class Label {
  @Id private UUID id = UUID.randomUUID();
  @Column(name = "user_id", nullable = false) private UUID userId;
  @Column(nullable = false, length = 80) private String name;
  @Column(length = 7) private String color;
  @Column(name = "created_at", nullable = false) private Instant createdAt = Instant.now();

  protected Label() {}
  public Label(UUID userId, String name, String color) { this.userId = userId; this.name = name; this.color = color; }
  public static Label imported(UUID id, UUID userId, String name, String color, Instant createdAt) {
    Label label = new Label(userId, name, color); label.id = id;
    label.createdAt = createdAt == null ? Instant.now() : createdAt; return label;
  }
  public UUID getId() { return id; }
  public UUID getUserId() { return userId; }
  public String getName() { return name; }
  public String getColor() { return color; }
  public Instant getCreatedAt() { return createdAt; }
  public void update(String name, String color) { this.name = name; this.color = color; }
}
