package com.know.domain;

import java.util.*;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ItemRepository extends JpaRepository<Item, UUID> {
  List<Item> findAllByUserIdOrderByUpdatedAtDesc(UUID userId, Pageable page);

  List<Item> findAllByUserIdAndIdIn(UUID userId, Collection<UUID> ids);

  Optional<Item> findByIdAndUserId(UUID id, UUID userId);

  List<Item> findAllByUserIdAndTitleContainingIgnoreCase(UUID userId, String title, Pageable page);

  long countByUserIdAndStatus(UUID userId, ItemStatus status);
}
