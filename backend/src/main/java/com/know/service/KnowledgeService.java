package com.know.service;

import com.know.domain.*;
import org.springframework.data.domain.PageRequest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;

@Service
public class KnowledgeService {
    private final ItemRepository items;
    private final PathRepository paths;
    private final PathItemRepository pathItems;
    private final TagRepository tags;
    private final ItemTagRepository itemTags;
    private final ActivityRepository activityRepository;
    private final ProgressEntryRepository progressRepository;
    private final NoteRepository notes;

    public KnowledgeService(ItemRepository items, PathRepository paths, PathItemRepository pathItems, TagRepository tags,
                            ItemTagRepository itemTags, ActivityRepository activityRepository,
                            ProgressEntryRepository progressRepository, NoteRepository notes) {
        this.items=items; this.paths=paths; this.pathItems=pathItems; this.tags=tags; this.itemTags=itemTags;
        this.activityRepository=activityRepository; this.progressRepository=progressRepository; this.notes=notes;
    }
    public record ItemView(UUID id,String title,ItemType type,String description,ItemStatus status,short progress,List<UUID> pathIds,List<String> tags,java.time.Instant createdAt,java.time.Instant updatedAt) {}
    public record NoteView(UUID id,UUID pathId,UUID itemId,UUID activityId,String title,String content,java.time.Instant createdAt,java.time.Instant updatedAt) {}

    @Transactional public ItemView createItem(UUID userId,String title,ItemType type,String description,List<UUID> pathIds,List<String> tagNames) {
        Item item=items.save(new Item(userId,title,type,description)); attach(userId,item,pathIds,tagNames,Set.of());
        activityRepository.save(new Activity(userId,null,item.getId(),ActivityType.ITEM_CREATED,"Created item: "+title,null)); return view(item);
    }
    @Transactional public ItemView updateItem(UUID userId,UUID id,String title,ItemType type,String description,ItemStatus status,List<UUID> pathIds,List<String> tagNames) {
        Item item=findItem(userId,id); ItemStatus previousStatus=item.getStatus(); short previousProgress=item.getProgress(); item.update(title,type,description,status);
        Set<UUID> existingPathIds=new HashSet<>(pathItems.findPathIds(id));
        if(pathIds!=null) pathItems.deleteAllByIdItemId(id);
        if(tagNames!=null) itemTags.deleteAll(itemTags.findAllByIdItemId(id));
        attach(userId,item,pathIds,tagNames,existingPathIds); Item saved=items.save(item);
        if(previousProgress!=saved.getProgress()){progressRepository.save(new ProgressEntry(userId,id,previousProgress,saved.getProgress()));activityRepository.save(new Activity(userId,null,id,ActivityType.PROGRESS_CHANGED,"Changed progress for "+saved.getTitle(),previousProgress+"% → "+saved.getProgress()+"%"));}
        if(previousStatus!=ItemStatus.COMPLETED&&saved.getStatus()==ItemStatus.COMPLETED) activityRepository.save(new Activity(userId,null,id,ActivityType.ITEM_COMPLETED,"Completed item: "+saved.getTitle(),null));
        return view(saved);
    }
    public Item findItem(UUID userId,UUID id) { return items.findByIdAndUserId(id,userId).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"Item not found")); }
    public List<ItemView> listItems(UUID userId) {
        List<Item> all=items.findAllByUserIdOrderByUpdatedAtDesc(userId,PageRequest.of(0,100)); if(all.isEmpty())return List.of();
        List<UUID> ids=all.stream().map(Item::getId).toList(); Map<UUID,List<UUID>> pathsByItem=new HashMap<>(); pathItems.findRelationships(ids).forEach(row->pathsByItem.computeIfAbsent(row.getItemId(),ignored->new ArrayList<>()).add(row.getPathId()));
        Map<UUID,List<String>> tagsByItem=new HashMap<>(); itemTags.findRelationships(ids).forEach(row->tagsByItem.computeIfAbsent(row.getItemId(),ignored->new ArrayList<>()).add(row.getName()));
        return all.stream().map(item->view(item,pathsByItem.getOrDefault(item.getId(),List.of()),tagsByItem.getOrDefault(item.getId(),List.of()))).toList();
    }
    public ItemView view(Item i) { return view(i,pathItems.findPathIds(i.getId()),itemTags.findTags(i.getId()).stream().map(Tag::getName).toList()); }
    private ItemView view(Item i,List<UUID> pathIds,List<String> tagNames) { return new ItemView(i.getId(),i.getTitle(),i.getType(),i.getDescription(),i.getStatus(),i.getProgress(),pathIds,tagNames.stream().sorted().toList(),i.getCreatedAt(),i.getUpdatedAt()); }
    private void attach(UUID userId,Item item,List<UUID> pathIds,List<String> tagNames,Set<UUID> existingPathIds) {
        if(pathIds!=null) for(int n=0;n<pathIds.size();n++){ UUID pathId=pathIds.get(n); Path path=paths.findByIdAndUserId(pathId,userId).orElseThrow(()->new ResponseStatusException(HttpStatus.BAD_REQUEST,"Path does not belong to user")); if(path.getStatus()!=PathStatus.ACTIVE&&!existingPathIds.contains(pathId))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Archived paths cannot receive new items"); pathItems.save(new PathItem(new PathItemId(pathId,item.getId()),n)); }
        if(tagNames!=null) for(String raw:tagNames){String name=raw.trim().toLowerCase(Locale.ROOT);if(name.isBlank()||name.length()>80)continue;Tag tag;try{tag=tags.findByUserIdAndNameIgnoreCase(userId,name).orElseGet(()->tags.save(new Tag(userId,name)));}catch(DataIntegrityViolationException e){tag=tags.findByUserIdAndNameIgnoreCase(userId,name).orElseThrow();}itemTags.save(new ItemTag(new ItemTagId(item.getId(),tag.getId())));}
    }
    @Transactional public ItemView updateProgress(UUID userId,UUID id,short value) {
        if(value<0||value>100)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Progress must be between 0 and 100"); Item item=findItem(userId,id); short previous=item.setProgress(value); items.save(item);
        if(previous!=value){progressRepository.save(new ProgressEntry(userId,id,previous,value));activityRepository.save(new Activity(userId,null,id,ActivityType.PROGRESS_CHANGED,"Changed progress for "+item.getTitle(),previous+"% → "+value+"%"));if(previous<100&&item.getStatus()==ItemStatus.COMPLETED)activityRepository.save(new Activity(userId,null,id,ActivityType.ITEM_COMPLETED,"Completed item: "+item.getTitle(),null));} return view(item);
    }
    @Transactional public NoteView createNote(UUID userId,UUID pathId,UUID itemId,UUID activityId,String title,String content) {
        int targets=(pathId!=null?1:0)+(itemId!=null?1:0)+(activityId!=null?1:0); if(targets>1)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"A note can have only one target");
        if(pathId!=null)paths.findByIdAndUserId(pathId,userId).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"Path not found")); if(itemId!=null)findItem(userId,itemId); if(activityId!=null)activityRepository.findByIdAndUserId(activityId,userId).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"Activity not found"));
        Note n=notes.save(new Note(userId,pathId,itemId,activityId,title,content));activityRepository.save(new Activity(userId,pathId,itemId,ActivityType.NOTE_CREATED,"Added note: "+title,null));return noteView(n);
    }
    public List<NoteView> listNotes(UUID userId){return notes.findAllByUserIdOrderByUpdatedAtDesc(userId,PageRequest.of(0,100)).stream().map(this::noteView).toList();}
    @Transactional public NoteView updateNote(UUID userId,UUID id,String title,String content){Note note=notes.findByIdAndUserId(id,userId).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"Note not found"));note.update(title,content);return noteView(notes.save(note));}
    private NoteView noteView(Note n){return new NoteView(n.getId(),n.getPathId(),n.getItemId(),n.getActivityId(),n.getTitle(),n.getContent(),n.getCreatedAt(),n.getUpdatedAt());}
    public List<Activity> activities(UUID userId){return activityRepository.findTop100ByUserIdOrderByOccurredAtDesc(userId);}
    public List<Activity> filteredActivities(UUID userId,java.time.Instant from,java.time.Instant to,UUID pathId,UUID itemId,ActivityType type){return activityRepository.findFiltered(userId,from,to,pathId,itemId,type,PageRequest.of(0,100));}
    public List<ProgressEntry> progress(UUID userId,UUID itemId){findItem(userId,itemId);return progressRepository.findAllByItemIdOrderByChangedAtDesc(itemId);}
}
