package com.know.domain;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface PathRepository extends JpaRepository<Path, UUID> { List<Path> findAllByUserIdOrderByUpdatedAtDesc(UUID userId,Pageable page); Optional<Path> findByIdAndUserId(UUID id, UUID userId); List<Path> findByUserIdAndIdIn(UUID userId,Collection<UUID> ids); List<Path> findByUserIdAndNameIgnoreCase(UUID userId,String name); List<Path> findAllByUserIdAndNameContainingIgnoreCase(UUID userId,String name,Pageable page); }
