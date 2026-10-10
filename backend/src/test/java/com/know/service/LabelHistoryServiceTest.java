package com.know.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.know.domain.Label;
import com.know.domain.LabelRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.TypedQuery;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class LabelHistoryServiceTest {
  @Test
  void recordPageAcceptsMaximumAndRejectsTheFirstValueAboveIt() {
    LabelRepository labels = mock(LabelRepository.class);
    EntityManager entityManager = mock(EntityManager.class);
    UUID userId = UUID.randomUUID();
    UUID labelId = UUID.randomUUID();
    when(labels.findByIdAndUserId(labelId, userId))
        .thenReturn(Optional.of(new Label(userId, "Work", null)));
    @SuppressWarnings("unchecked")
    TypedQuery<Object[]> query = mock(TypedQuery.class);
    when(entityManager.createQuery(anyString(), eq(Object[].class))).thenReturn(query);
    when(query.setParameter(anyString(), any())).thenReturn(query);
    when(query.setFirstResult(anyInt())).thenReturn(query);
    when(query.setMaxResults(anyInt())).thenReturn(query);
    when(query.getResultList()).thenReturn(List.of());
    LabelHistoryService service = new LabelHistoryService(labels, entityManager);

    assertTrue(service.records(userId, labelId, LabelHistoryService.RecordKind.logs, 100000)
        .items().isEmpty());
    verify(query).setFirstResult(1_000_000);
    verify(query).setMaxResults(11);

    ResponseStatusException error =
        assertThrows(
            ResponseStatusException.class,
            () -> service.records(userId, labelId, LabelHistoryService.RecordKind.logs, 100001));
    assertEquals(400, error.getStatusCode().value());
    verify(entityManager, times(1)).createQuery(anyString(), eq(Object[].class));
  }
}
