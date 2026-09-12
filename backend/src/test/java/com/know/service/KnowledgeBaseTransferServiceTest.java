package com.know.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.know.domain.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class KnowledgeBaseTransferServiceTest {
  @org.mockito.Spy ObjectMapper json = new ObjectMapper().findAndRegisterModules();
  @Mock PathRepository paths;
  @Mock TimeEntryRepository entries;
  @Mock ActivityRepository activities;
  @Mock DailyRecordRepository days;
  @Mock DailyRecordLabelRepository dayLabels;
  @Mock TimeEntryLabelRepository entryLabels;
  @Mock NoteRepository notes;
  @Mock NoteTagRepository noteTags;
  @Mock LogRepository logs;
  @Mock LogLabelRepository logLabels;
  @Mock LabelRepository labels;
  @Mock LabelScopeRepository scopes;
  @Mock ImportBatchRepository batches;
  @Mock UserRepository users;
  @InjectMocks KnowledgeBaseTransferService service;

  @Test
  void exportContainsActiveDomainRecordsAndNestedAssignments() throws Exception {
    UUID user = UUID.randomUUID(), pathId = UUID.randomUUID(), entryId = UUID.randomUUID(), labelId = UUID.randomUUID();
    Path path = new Path(user, "Research", "Description", "#123456");
    TimeEntry entry = new TimeEntry(user, pathId, Instant.parse("2026-01-01T10:00:00Z"), "Focus", TimeSource.MANUAL);
    entry.stop(Instant.parse("2026-01-01T11:00:00Z"));
    Label label = new Label(user, "Focus", "#abcdef");
    when(paths.findAllByUserId(user)).thenReturn(List.of(path));
    when(entries.findAllByUserId(user)).thenReturn(List.of(entry));
    when(labels.findAllByUserIdOrderByName(user)).thenReturn(List.of(label));
    when(scopes.findAllByIdLabelId(label.getId())).thenReturn(List.of(new LabelScope(new LabelScopeId(label.getId(), LabelScopeType.TIME_ENTRY))));
    when(entryLabels.findAllByIdTimeEntryId(entry.getId())).thenReturn(List.of(new TimeEntryLabel(entry.getId(), label.getId())));
    when(activities.findAllByUserId(user)).thenReturn(List.of());
    when(days.findAllByUserId(user)).thenReturn(List.of());
    when(notes.findAllActiveByUserId(user)).thenReturn(List.of());
    when(logs.findAllByUserIdOrderByOccurredAtDescIdDesc(user)).thenReturn(List.of());

    String csv = new String(service.exportCsv(user));

    assertThat(csv).startsWith("entity,id,payload\n");
    assertThat(csv).contains("path," + path.getId(), "session," + entry.getId(), "label," + label.getId());
    assertThat(csv).contains("#123456");
    assertThat(csv).contains("#abcdef");
    assertThat(csv).contains("TIME_ENTRY");
    assertThat(csv).contains(label.getId().toString());
  }

  @Test
  void exportContainsLogsAndTheirLabelAssignments() {
    UUID user = UUID.randomUUID();
    Log log = new Log(user, "A durable thought", Instant.parse("2026-01-02T10:00:00Z"));
    UUID labelId = UUID.randomUUID();
    when(paths.findAllByUserId(user)).thenReturn(List.of());
    when(labels.findAllByUserIdOrderByName(user)).thenReturn(List.of());
    when(entries.findAllByUserId(user)).thenReturn(List.of());
    when(activities.findAllByUserId(user)).thenReturn(List.of());
    when(days.findAllByUserId(user)).thenReturn(List.of());
    when(notes.findAllActiveByUserId(user)).thenReturn(List.of());
    when(logs.findAllByUserIdOrderByOccurredAtDescIdDesc(user)).thenReturn(List.of(log));
    when(logLabels.findAllByIdLogId(log.getId())).thenReturn(List.of(new LogLabel(new LogLabelId(log.getId(), labelId))));

    String csv = new String(service.exportCsv(user));

    assertThat(csv).contains("log," + log.getId(), "A durable thought", "occurredAt", labelId.toString());
  }

  @Test
  void importPreservesPathAndLabelColorsAndScopes() {
    UUID user = UUID.randomUUID(), pathId = UUID.randomUUID(), labelId = UUID.randomUUID();
    when(batches.save(any(ImportBatch.class))).thenAnswer(invocation -> invocation.getArgument(0));
    when(paths.save(any(Path.class))).thenAnswer(invocation -> invocation.getArgument(0));
    when(labels.save(any(Label.class))).thenAnswer(invocation -> invocation.getArgument(0));

    String csv = """
        entity,id,payload
        path,%s,"{""name"":""Research"",""description"":null,""color"":""#123456"",""status"":""ACTIVE""}"
        label,%s,"{""name"":""Focus"",""color"":""#ABCDEF"",""scopes"":[""TIME_ENTRY"",""NOTE""]}"
        """.formatted(pathId, labelId);

    service.importCsv(user, csv);

    var pathCaptor = org.mockito.ArgumentCaptor.forClass(Path.class);
    var labelCaptor = org.mockito.ArgumentCaptor.forClass(Label.class);
    verify(paths, atLeastOnce()).save(pathCaptor.capture());
    verify(labels, atLeastOnce()).save(labelCaptor.capture());
    assertThat(pathCaptor.getAllValues().getLast().getColor()).isEqualTo("#123456");
    assertThat(labelCaptor.getAllValues().getLast().getColor()).isEqualTo("#ABCDEF");
    verify(scopes).save(argThat(scope -> scope.getId().equals(new LabelScopeId(labelId, LabelScopeType.TIME_ENTRY))));
    verify(scopes).save(argThat(scope -> scope.getId().equals(new LabelScopeId(labelId, LabelScopeType.NOTE))));
  }

  @Test
  void importingTheSameStableIdsSkipsExistingRecords() {
    UUID user = UUID.randomUUID(), pathId = UUID.randomUUID(), labelId = UUID.randomUUID();
    when(paths.findByIdAndUserIdIncludingDeleted(pathId, user)).thenReturn(Optional.empty());
    when(paths.findByIdAndUserId(pathId, user)).thenReturn(Optional.of(new Path(user, "Existing", null)));
    when(labels.findByIdAndUserId(labelId, user)).thenReturn(Optional.of(new Label(user, "Existing", null)));
    when(batches.save(any(ImportBatch.class))).thenAnswer(invocation -> invocation.getArgument(0));

    String csv = """
        entity,id,payload
        path,%s,"{""name"":""Existing""}"
        label,%s,"{""name"":""Existing"",""scopes"":[]}"
        """.formatted(pathId, labelId);

    var summary = service.importCsv(user, csv);

    assertThat(summary.imported()).isZero();
    assertThat(summary.skipped()).isEqualTo(2);
    verify(paths, never()).save(any(Path.class));
    verify(labels, never()).save(any(Label.class));
  }

  @Test
  void importingIntoProductionSkipsLabelNameAndCalendarDateConflicts() {
    UUID user = UUID.randomUUID(), labelId = UUID.randomUUID(), recordId = UUID.randomUUID();
    when(batches.save(any(ImportBatch.class))).thenAnswer(invocation -> invocation.getArgument(0));
    when(labels.findByUserIdAndNameIgnoreCase(user, "Focus"))
        .thenReturn(Optional.of(new Label(user, "focus", "#123456")));
    when(days.findByUserIdAndRecordDate(user, java.time.LocalDate.of(2026, 9, 12)))
        .thenReturn(Optional.of(new DailyRecord(user, java.time.LocalDate.of(2026, 9, 12), "Existing")));

    String csv = """
        entity,id,payload
        label,%s,"{\"\"name\"\":\"\"Focus\"\",\"\"scopes\"\":[] }"
        calendar,%s,"{\"\"recordDate\"\":\"\"2026-09-12\"\",\"\"note\"\":\"\"Imported\"\"}"
        """.formatted(labelId, recordId);

    var summary = service.importCsv(user, csv);

    assertThat(summary.imported()).isZero();
    assertThat(summary.skipped()).isEqualTo(2);
    verify(labels, never()).save(any(Label.class));
    verify(days, never()).save(any(DailyRecord.class));
  }

  @Test
  void rejectsMissingOversizedAndMalformedCsvBeforeCreatingAImportBatch() {
    assertThatThrownBy(() -> service.importCsv(UUID.randomUUID(), null))
        .isInstanceOf(org.springframework.web.server.ResponseStatusException.class)
        .hasMessageContaining("missing");
    assertThatThrownBy(() -> service.importCsv(UUID.randomUUID(), "x".repeat(25_000_001)))
        .isInstanceOf(org.springframework.web.server.ResponseStatusException.class)
        .hasMessageContaining("25 MB");
    assertThatThrownBy(() -> service.importCsv(UUID.randomUUID(),
        "entity,id,payload\npath,not-a-uuid,{}\n"))
        .isInstanceOf(org.springframework.web.server.ResponseStatusException.class)
        .hasMessageContaining("Invalid Knowledge Base CSV");
    verifyNoInteractions(batches);
  }
}
