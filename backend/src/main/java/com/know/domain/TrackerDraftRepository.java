package com.know.domain;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TrackerDraftRepository extends JpaRepository<TrackerDraft, UUID> {}
