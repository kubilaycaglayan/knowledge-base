package com.know.domain;

import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TimeEntryItemRepository extends JpaRepository<TimeEntryItem, TimeEntryItemId> {
  List<TimeEntryItem> findAllByIdTimeEntryId(UUID timeEntryId);

  List<TimeEntryItem> findAllByIdTimeEntryIdIn(Collection<UUID> timeEntryIds);

  List<TimeEntryItem> findAllByIdItemId(UUID itemId);

  void deleteAllByIdTimeEntryId(UUID timeEntryId);
}
