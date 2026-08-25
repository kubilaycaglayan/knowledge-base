package com.know.domain;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface ItemRepository extends JpaRepository<Item,UUID>{List<Item> findAllByUserIdOrderByUpdatedAtDesc(UUID userId);List<Item> findAllByUserIdAndIdIn(UUID userId,Collection<UUID> ids);Optional<Item> findByIdAndUserId(UUID id,UUID userId);List<Item> findAllByUserIdAndTitleContainingIgnoreCase(UUID userId,String title,Pageable page);long countByUserIdAndStatus(UUID userId,ItemStatus status);}
