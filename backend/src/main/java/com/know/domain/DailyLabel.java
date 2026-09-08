package com.know.domain;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "daily_label")
public class DailyLabel {
  @Id private UUID id = UUID.randomUUID();
  @Column(name = "user_id", nullable = false) private UUID userId;
  @Column(nullable = false, length = 80) private String name;
  @Column(length = 7) private String color;
  @Column(name = "created_at", nullable = false) private Instant createdAt = Instant.now();
  protected DailyLabel() {}
  public DailyLabel(UUID userId, String name, String color) { this.userId = userId; this.name = name; this.color = color; }
  public UUID getId() { return id; }
  public UUID getUserId() { return userId; }
  public String getName() { return name; }
  public String getColor() { return color; }
  public void update(String name, String color) { this.name = name; this.color = color; }
}
