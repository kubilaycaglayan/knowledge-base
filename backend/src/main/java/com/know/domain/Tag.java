package com.know.domain;

import jakarta.persistence.*;
import java.util.UUID;

@Entity
@Table(name = "tag", uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "name"}))
public class Tag {
  @Id private UUID id = UUID.randomUUID();

  @Column(name = "user_id", nullable = false)
  private UUID userId;

  @Column(nullable = false, length = 80)
  private String name;

  protected Tag() {}

  public Tag(UUID userId, String name) {
    this.userId = userId;
    this.name = name;
  }

  public UUID getId() {
    return id;
  }

  public String getName() {
    return name;
  }
}
