package com.know.api;

import com.know.service.KnowledgeBaseTransferService;
import java.util.List;
import java.util.UUID;
import org.springframework.http.*;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/imports/knowledge-base")
public class KnowledgeBaseTransferController {
  private final KnowledgeBaseTransferService service;
  public KnowledgeBaseTransferController(KnowledgeBaseTransferService service) { this.service = service; }
  private UUID user(Authentication a) { return UUID.fromString(a.getName()); }

  @GetMapping(value = "/export", produces = "text/csv")
  public ResponseEntity<byte[]> export(Authentication a) {
    return ResponseEntity.ok().contentType(MediaType.parseMediaType("text/csv; charset=UTF-8"))
        .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=knowledge-base-export.csv")
        .body(service.exportCsv(user(a)));
  }

  @PostMapping(consumes = "text/csv", produces = MediaType.APPLICATION_JSON_VALUE)
  public KnowledgeBaseTransferService.ImportSummary importCsv(Authentication a, @RequestBody String csv) {
    return service.importCsv(user(a), csv);
  }

  @GetMapping("/batches")
  public List<KnowledgeBaseTransferService.BatchView> batches(Authentication a) { return service.listBatches(user(a)); }

  @DeleteMapping("/batches/{id}")
  public KnowledgeBaseTransferService.UndoSummary undo(Authentication a, @PathVariable UUID id) { return service.undo(user(a), id); }
}
