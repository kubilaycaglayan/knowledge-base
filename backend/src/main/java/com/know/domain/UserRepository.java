package com.know.domain;

import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import jakarta.persistence.LockModeType;

public interface UserRepository extends JpaRepository<User, UUID> {
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select u from User u where u.id = :id")
  Optional<User> findForUpdateById(@org.springframework.data.repository.query.Param("id") UUID id);
  Optional<User> findByEmailIgnoreCase(String email);

  Optional<User> findByGoogleSubject(String googleSubject);
}
