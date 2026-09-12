package com.know.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.know.domain.*;
import java.io.*;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/** Portable, versioned CSV transfer for active user-owned knowledge. */
@Service
public class KnowledgeBaseTransferService {
  private static final String HEADER = "entity,id,payload\n";
  private final ObjectMapper json;
  private final PathRepository paths; private final TimeEntryRepository entries;
  private final ActivityRepository activities; private final DailyRecordRepository days;
  private final DailyRecordLabelRepository dayLabels; private final TimeEntryLabelRepository entryLabels;
  private final NoteRepository notes; private final NoteTagRepository noteTags;
  private final LabelRepository labels; private final LabelScopeRepository scopes;
  private final ImportBatchRepository batches; private final UserRepository users;

  public KnowledgeBaseTransferService(ObjectMapper json, PathRepository paths, TimeEntryRepository entries,
      ActivityRepository activities, DailyRecordRepository days, DailyRecordLabelRepository dayLabels,
      TimeEntryLabelRepository entryLabels, NoteRepository notes, NoteTagRepository noteTags,
      LabelRepository labels, LabelScopeRepository scopes, ImportBatchRepository batches, UserRepository users) {
    this.json = json; this.paths = paths; this.entries = entries; this.activities = activities;
    this.days = days; this.dayLabels = dayLabels; this.entryLabels = entryLabels; this.notes = notes;
    this.noteTags = noteTags; this.labels = labels; this.scopes = scopes; this.batches = batches; this.users = users;
  }

  public record ImportSummary(UUID batchId, int imported, int skipped, int createdPaths) {}
  public record UndoSummary(UUID batchId, long deletedEntries, long deletedActivities, long deletedPaths) {}
  public record BatchView(UUID id, TimeSource source, int imported, int skipped, int createdPaths,
      Instant createdAt, Instant undoneAt) {
    static BatchView of(ImportBatch b) { return new BatchView(b.getId(), b.getSource(), b.getImportedCount(),
        b.getSkippedCount(), b.getCreatedPathsCount(), b.getCreatedAt(), b.getUndoneAt()); }
  }

  @Transactional(readOnly = true)
  public byte[] exportCsv(UUID userId) {
    try {
      StringBuilder out = new StringBuilder(HEADER);
      for (Path p : paths.findAllByUserId(userId)) row(out, "path", p.getId(), payload(
          "name", p.getName(), "description", value(p.getDescription()), "color", p.getColor(),
          "status", p.getStatus(), "createdAt", p.getCreatedAt(), "updatedAt", p.getUpdatedAt()));
      for (Label l : labels.findAllByUserIdOrderByName(userId)) row(out, "label", l.getId(), payload(
          "name", l.getName(), "color", value(l.getColor()), "createdAt", l.getCreatedAt(),
          "scopes", scopes.findAllByIdLabelId(l.getId()).stream().map(s -> s.getId().getScope()).toList()));
      for (TimeEntry e : entries.findAllByUserId(userId)) row(out, "session", e.getId(), payload(
          "pathId", value(e.getPathId()), "startedAt", e.getStartedAt(), "endedAt", value(e.getEndedAt()),
          "durationSeconds", value(e.getDurationSeconds()), "description", value(e.getDescription()),
          "source", e.getSource(), "labelIds", entryLabels.findAllByIdTimeEntryId(e.getId()).stream().map(TimeEntryLabel::getLabelId).toList()));
      for (Activity a : activities.findAllByUserId(userId)) row(out, "timeline", a.getId(), payload(
          "pathId", value(a.getPathId()), "timeEntryId", value(a.getTimeEntryId()), "type", a.getType(),
          "title", a.getTitle(), "detail", value(a.getDetail()), "occurredAt", a.getOccurredAt()));
      for (DailyRecord d : days.findAllByUserId(userId)) row(out, "calendar", d.getId(), payload(
          "recordDate", d.getRecordDate(), "note", value(d.getNote()), "createdAt", d.getCreatedAt(),
          "updatedAt", d.getUpdatedAt(), "labels", dayLabels.findAllByIdDailyRecordId(d.getId()).stream().map(a ->
              payload("labelId", a.getId().getLabelId(), "portion", value(a.getPortion()))).toList()));
      for (Note n : notes.findAllActiveByUserId(userId)) row(out, "note", n.getId(), payload(
          "pathId", value(n.getPathId()), "activityId", value(n.getActivityId()), "timeEntryId", value(n.getTimeEntryId()),
          "title", n.getTitle(), "content", n.getContent(), "contentText", value(n.getContentText()),
          "createdAt", n.getCreatedAt(), "updatedAt", n.getUpdatedAt(), "tagIds", noteTags.findAllByIdNoteId(n.getId()).stream().map(t -> t.getId().getLabelId()).toList()));
      return out.toString().getBytes(StandardCharsets.UTF_8);
    } catch (Exception e) { throw new IllegalStateException("Could not create Knowledge Base export", e); }
  }

  @Transactional
  public ImportSummary importCsv(UUID userId, String csv) {
    users.findForUpdateById(userId);
    if (csv == null || csv.getBytes(StandardCharsets.UTF_8).length > 25_000_000)
      bad("Knowledge Base CSV is missing or larger than 25 MB");
    List<Row> rows = parse(csv); ImportBatch batch = batches.save(new ImportBatch(userId, TimeSource.KNOWLEDGE_BASE));
    int imported = 0, skipped = 0, createdPaths = 0;
    Map<UUID, Path> pathMap = new HashMap<>(); Map<UUID, Label> labelMap = new HashMap<>();
    for (Row r : rows) if (r.entity.equals("path")) {
      Optional<Path> existingPath = paths.findByIdAndUserIdIncludingDeleted(r.id, userId);
      if (existingPath.isPresent()) {
        Path path = existingPath.get();
        if (path.getDeletedAt() != null) {
          path.restore(); path.assignImportBatch(batch.getId()); paths.save(path); imported++;
        }
        else skipped++;
        pathMap.put(r.id, path);
        continue;
      }
      Optional<Path> activePath = paths.findByIdAndUserId(r.id, userId);
      if (activePath.isPresent() || paths.existsById(r.id)) {
        skipped++;
        activePath.ifPresent(path -> pathMap.put(r.id, path));
        continue;
      }
      JsonNode p = r.payload; Path path = paths.save(Path.imported(r.id, userId, text(p,"name"), text(p,"description"), text(p,"color"),
          enumValue(PathStatus.class, text(p,"status")), instant(p,"createdAt"), instant(p,"updatedAt")));
      path.assignImportBatch(batch.getId()); paths.save(path); pathMap.put(r.id, path); imported++; createdPaths++;
    }
    for (Path p : paths.findAllByUserId(userId)) pathMap.putIfAbsent(p.getId(), p);
    for (Row r : rows) if (r.entity.equals("label")) {
      if (labels.existsById(r.id) || labels.findByIdAndUserId(r.id, userId).isPresent()
          || labels.findByUserIdAndNameIgnoreCase(userId, text(r.payload, "name")).isPresent()) {
        skipped++; continue;
      }
      JsonNode p=r.payload; Label label=labels.save(Label.imported(r.id,userId,text(p,"name"),text(p,"color"),instant(p,"createdAt"))); label.assignImportBatch(batch.getId()); labels.save(label);
      for (JsonNode scope : p.path("scopes")) scopes.save(new LabelScope(new LabelScopeId(label.getId(), enumValue(LabelScopeType.class, scope.asText()))));
      labelMap.put(r.id,label); imported++;
    }
    for (Label l : labels.findAllByUserIdOrderByName(userId)) labelMap.putIfAbsent(l.getId(), l);
    Map<UUID, TimeEntry> entryMap = new HashMap<>(); Map<UUID, Activity> activityMap = new HashMap<>();
    boolean runningEntryImported = false;
    for (Row r : rows) if (r.entity.equals("session")) {
      JsonNode p=r.payload;
      boolean running = !p.hasNonNull("endedAt");
      Optional<TimeEntry> existingEntry = entries.findByIdAndUserIdIncludingDeleted(r.id, userId);
      if (existingEntry.isPresent() && existingEntry.get().getDeletedAt() != null) {
        if (running && (runningEntryImported || entries.findByUserIdAndEndedAtIsNull(userId).isPresent())) {
          skipped++;
        } else {
          existingEntry.get().restore(); existingEntry.get().assignImportBatch(batch.getId());
          entries.save(existingEntry.get()); entryMap.put(r.id, existingEntry.get()); imported++; runningEntryImported |= running;
        }
        continue;
      }
      if (existingEntry.isPresent() || entries.existsById(r.id) || entries.findByIdAndUserId(r.id,userId).isPresent()
          || (running && (runningEntryImported || entries.findByUserIdAndEndedAtIsNull(userId).isPresent()))) {
        skipped++; continue;
      }
      TimeEntry e=TimeEntry.imported(r.id,userId,idOf(pathMap,p,"pathId"),instant(p,"startedAt"),instant(p,"endedAt"),longValue(p,"durationSeconds"),text(p,"description"),enumValue(TimeSource.class,text(p,"source")));
      e.assignImportBatch(batch.getId()); entries.save(e); for(JsonNode id:p.path("labelIds")) if(labelMap.containsKey(uuid(id))) entryLabels.save(new TimeEntryLabel(e.getId(),uuid(id)));
      entryMap.put(r.id,e); imported++; runningEntryImported |= running;
    }
    for (Row r : rows) if (r.entity.equals("timeline")) {
      if (activities.existsById(r.id) || activities.findByIdAndUserId(r.id,userId).isPresent()) { skipped++; continue; }
      JsonNode p=r.payload; Activity a=Activity.imported(r.id,userId,idOf(pathMap,p,"pathId"),idOf(entryMap,p,"timeEntryId"),enumValue(ActivityType.class,text(p,"type")),text(p,"title"),text(p,"detail"),instant(p,"occurredAt"));
      a.assignImportBatch(batch.getId()); activities.save(a); activityMap.put(r.id,a); imported++;
    }
    for (Row r : rows) if (r.entity.equals("calendar")) {
      JsonNode p=r.payload; LocalDate recordDate = LocalDate.parse(text(p,"recordDate"));
      if (days.existsById(r.id) || days.findByIdAndUserId(r.id,userId).isPresent()
          || days.findByUserIdAndRecordDate(userId, recordDate).isPresent()) { skipped++; continue; }
      DailyRecord d=days.save(DailyRecord.imported(r.id,userId,recordDate,text(p,"note"),instant(p,"createdAt"),instant(p,"updatedAt"))); d.assignImportBatch(batch.getId()); days.save(d);
      for(JsonNode a:p.path("labels")) if(labelMap.containsKey(uuid(a.path("labelId")))) dayLabels.save(new DailyRecordLabel(new DailyRecordLabelId(d.getId(),uuid(a.path("labelId"))), a.hasNonNull("portion")?new BigDecimal(a.get("portion").asText()):null)); imported++;
    }
    for (Row r : rows) if (r.entity.equals("note")) {
      Optional<Note> existingNote = notes.findByIdAndUserIdIncludingArchived(r.id, userId);
      if (existingNote.isPresent()) {
        if (existingNote.get().getDeletedAt() != null) {
          existingNote.get().restore(); existingNote.get().assignImportBatch(batch.getId());
          notes.save(existingNote.get()); imported++;
        }
        else skipped++;
        continue;
      }
      if (notes.existsById(r.id) || notes.findByIdAndUserId(r.id,userId).isPresent()) { skipped++; continue; }
      JsonNode p=r.payload; Note n=notes.save(Note.imported(r.id,userId,idOf(pathMap,p,"pathId"),idOf(activityMap,p,"activityId"),idOf(entryMap,p,"timeEntryId"),text(p,"title"),text(p,"content"),text(p,"contentText"),instant(p,"createdAt"),instant(p,"updatedAt"))); n.assignImportBatch(batch.getId()); notes.save(n);
      for(JsonNode id:p.path("tagIds")) if(labelMap.containsKey(uuid(id))) noteTags.save(new NoteTag(new NoteTagId(n.getId(),uuid(id)))); imported++;
    }
    batch.complete(imported, skipped, createdPaths); batches.save(batch); return new ImportSummary(batch.getId(),imported,skipped,createdPaths);
  }

  public List<BatchView> listBatches(UUID userId) { return batches.findAllByUserIdAndSourceOrderByCreatedAtDesc(userId, TimeSource.KNOWLEDGE_BASE, PageRequest.of(0,100)).stream().map(BatchView::of).toList(); }
  @Transactional public UndoSummary undo(UUID userId, UUID id) {
    ImportBatch b=batches.findByIdAndUserId(id,userId).filter(x->x.getSource()==TimeSource.KNOWLEDGE_BASE).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"Import batch not found"));
    if(b.getUndoneAt()!=null)return new UndoSummary(id,0,0,0);
    long n=notes.deleteByUserIdAndImportBatchId(userId,id), d=days.deleteByUserIdAndImportBatchId(userId,id);
    long a=activities.deleteByUserIdAndImportBatchId(userId,id), e=entries.deleteByUserIdAndImportBatchId(userId,id);
    long p=paths.deleteByUserIdAndImportBatchId(userId,id); labels.deleteByUserIdAndImportBatchId(userId,id);
    b.undo(); batches.save(b); return new UndoSummary(id,e,a,p);
  }

  private void row(StringBuilder out,String entity,UUID id,Object payload)throws Exception { out.append(entity).append(',').append(id).append(',').append(csv(json.writeValueAsString(payload))).append('\n'); }
  private static Map<String,Object> payload(Object... values) { Map<String,Object> result = new LinkedHashMap<>(); for (int i=0;i<values.length;i+=2) result.put((String) values[i], values[i+1]); return result; }
  private static String csv(String s){return "\""+s.replace("\"","\"\"")+"\"";}
  private static Object value(Object v){return v;}
  private static String text(JsonNode n,String key){return n.hasNonNull(key)?n.get(key).asText():null;}
  private static Instant instant(JsonNode n,String key){return text(n,key)==null?null:Instant.parse(text(n,key));}
  private static Long longValue(JsonNode n,String key){return n.hasNonNull(key)?n.get(key).asLong():null;}
  private static <E extends Enum<E>> E enumValue(Class<E> type,String value){return value==null?null:Enum.valueOf(type,value);}
  private static UUID uuid(JsonNode n) { return UUID.fromString(n.asText()); }
  private static UUID idOf(Map<UUID,?> map,JsonNode n,String key){return n.hasNonNull(key)&&map.containsKey(uuid(n.get(key)))?uuid(n.get(key)):null;}
  private record Row(String entity,UUID id,JsonNode payload){}
  private List<Row> parse(String csv){
    try { List<Row> out=new ArrayList<>(); String[] lines=csv.replace("\r","").split("\\n",-1); for(int i=1;i<lines.length;i++){if(lines[i].isBlank())continue; List<String> c=columns(lines[i]); if(c.size()!=3)bad("Invalid Knowledge Base CSV row "+(i+1)); out.add(new Row(c.get(0),UUID.fromString(c.get(1)),json.readTree(c.get(2))));} return out; }
    catch(ResponseStatusException e){throw e;} catch(Exception e){bad("Invalid Knowledge Base CSV");return List.of();}
  }
  private static List<String> columns(String line){List<String> out=new ArrayList<>();StringBuilder b=new StringBuilder();boolean q=false;for(int i=0;i<line.length();i++){char c=line.charAt(i);if(c=='"'){if(q&&i+1<line.length()&&line.charAt(i+1)=='"'){b.append('"');i++;}else q=!q;}else if(c==','&&!q){out.add(b.toString());b.setLength(0);}else b.append(c);}out.add(b.toString());return out;}
  private static void bad(String message){throw new ResponseStatusException(HttpStatus.BAD_REQUEST,message);}
}
