package com.know.domain;

import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TimeEntryLabelRepository extends JpaRepository<TimeEntryLabel, TimeEntryLabelId> {
  List<TimeEntryLabel> findAllByIdTimeEntryId(UUID timeEntryId);
  List<TimeEntryLabel> findAllByIdTimeEntryIdIn(Collection<UUID> timeEntryIds);
  void deleteAllByIdTimeEntryId(UUID timeEntryId);
  boolean existsByIdLabelId(UUID labelId);
}
