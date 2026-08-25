package com.know.domain;
import org.springframework.data.jpa.repository.JpaRepository;import java.util.*;
public interface TagRepository extends JpaRepository<Tag,UUID>{Optional<Tag> findByUserIdAndNameIgnoreCase(UUID userId,String name);}
