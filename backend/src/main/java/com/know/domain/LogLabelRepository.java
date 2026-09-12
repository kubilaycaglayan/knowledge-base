package com.know.domain;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LogLabelRepository extends JpaRepository<LogLabel, LogLabelId> {
  List<LogLabel> findAllByIdLogId(UUID logId);
  void deleteAllByIdLogId(UUID logId);
  void deleteAllByIdLabelId(UUID labelId);
  boolean existsByIdLabelId(UUID labelId);
}
