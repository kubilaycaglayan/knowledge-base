package com.know.domain;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity @Table(name="path")
public class Path {
    @Id private UUID id=UUID.randomUUID();
    @Column(name="user_id", nullable=false) private UUID userId;
    @Column(nullable=false, length=160) private String name;
    private String description;
    @Enumerated(EnumType.STRING) @Column(nullable=false) private PathStatus status=PathStatus.ACTIVE;
    @Column(name="created_at",nullable=false) private Instant createdAt=Instant.now();
    @Column(name="updated_at",nullable=false) private Instant updatedAt=Instant.now();
    @Column(name="archived_at") private Instant archivedAt;
    protected Path(){}
    public Path(UUID userId,String name,String description){this.userId=userId;this.name=name;this.description=description;}
    public UUID getId(){return id;} public UUID getUserId(){return userId;} public String getName(){return name;} public String getDescription(){return description;} public PathStatus getStatus(){return status;} public Instant getCreatedAt(){return createdAt;} public Instant getUpdatedAt(){return updatedAt;}
    public void update(String name,String description){this.name=name;this.description=description;this.updatedAt=Instant.now();}
    public void archive(){status=PathStatus.ARCHIVED; archivedAt=Instant.now(); updatedAt=Instant.now();}
}
