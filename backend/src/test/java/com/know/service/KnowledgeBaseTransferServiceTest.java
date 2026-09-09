package com.know.service;

import static org.assertj.core.api.Assertions.assertThat;
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

    String csv = new String(service.exportCsv(user));

    assertThat(csv).startsWith("entity,id,payload\n");
    assertThat(csv).contains("path," + path.getId(), "session," + entry.getId(), "label," + label.getId());
    assertThat(csv).contains("#123456", label.getId().toString());
  }

  @Test
  void importingTheSameStableIdsSkipsExistingRecords() {
    UUID user = UUID.randomUUID(), pathId = UUID.randomUUID(), labelId = UUID.randomUUID();
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
}
