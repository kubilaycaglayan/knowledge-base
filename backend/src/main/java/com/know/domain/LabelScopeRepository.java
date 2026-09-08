package com.know.domain;

import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LabelScopeRepository extends JpaRepository<LabelScope, LabelScopeId> {
  List<LabelScope> findAllByIdLabelId(UUID labelId);
  boolean existsByIdLabelIdAndIdScope(UUID labelId, LabelScopeType scope);
  long countByIdLabelId(UUID labelId);
  void deleteAllByIdLabelId(UUID labelId);
}
