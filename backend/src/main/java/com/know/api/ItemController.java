package com.know.api;

import com.know.domain.ItemStatus;
import com.know.domain.ItemType;
import com.know.domain.ProgressEntry;
import com.know.service.KnowledgeService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/items")
public class ItemController {
    private final KnowledgeService service;

    public ItemController(KnowledgeService service) {
        this.service = service;
    }

    record ItemRequest(
        @NotBlank @Size(max = 240) String title,
        ItemType type,
        @Size(max = 10000) String description,
        @Size(max = 1000) String source,
        ItemStatus status,
        List<UUID> pathIds,
        List<String> tags
    ) {}

    record ProgressRequest(@Min(0) @Max(100) short progress) {}

    private UUID user(Authentication a) {
        return UUID.fromString(a.getName());
    }

    @GetMapping
    public List<KnowledgeService.ItemView> list(Authentication a) {
        return service.listItems(user(a));
    }

    @PostMapping
    public ResponseEntity<KnowledgeService.ItemView> create(
        Authentication a,
        @Valid @RequestBody ItemRequest r
    ) {
        return ResponseEntity.status(HttpStatus.CREATED).body(
            service.createItem(
                user(a),
                r.title(),
                r.type() == null ? ItemType.CUSTOM : r.type(),
                r.description(),
                r.source(),
                r.pathIds(),
                r.tags()
            )
        );
    }

    @PutMapping("/{id}")
    public KnowledgeService.ItemView update(
        Authentication a,
        @PathVariable UUID id,
        @Valid @RequestBody ItemRequest r
    ) {
        return service.updateItem(
            user(a),
            id,
            r.title(),
            r.type() == null ? ItemType.CUSTOM : r.type(),
            r.description(),
            r.source(),
            r.status() == null ? ItemStatus.PLANNED : r.status(),
            r.pathIds(),
            r.tags()
        );
    }

    @PostMapping("/{id}/progress")
    public KnowledgeService.ItemView progress(
        Authentication a,
        @PathVariable UUID id,
        @Valid @RequestBody ProgressRequest r
    ) {
        return service.updateProgress(user(a), id, r.progress());
    }

    @GetMapping("/{id}/progress")
    public List<ProgressEntry> history(Authentication a, @PathVariable UUID id) {
        return service.progress(user(a), id);
    }
}
