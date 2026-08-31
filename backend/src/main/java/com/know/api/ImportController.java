package com.know.api;

import com.know.service.ClockifyImportService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/imports")
public class ImportController {
  private final ClockifyImportService service;

  public ImportController(ClockifyImportService service) {
    this.service = service;
  }

  record ImportRequest(@NotEmpty java.util.List<ClockifyImportService.ClockifyEntry> timeentries) {}

  @PostMapping("/clockify")
  public ClockifyImportService.ImportSummary clockify(
      Authentication authentication, @Valid @RequestBody ImportRequest request) {
    UUID userId = UUID.fromString(authentication.getName());
    var importRequest = new ClockifyImportService.ClockifyImportRequest(request.timeentries());
    try {
      return service.importEntries(userId, importRequest);
    } catch (DataIntegrityViolationException duplicateRace) {
      // Two Clockify report responses can contain the same entry. The failed
      // transaction is rolled back; retrying lets the duplicate lookup see
      // the winner and count the entry as skipped.
      return service.importEntries(userId, importRequest);
    }
  }

  @GetMapping("/clockify/batches")
  public List<ClockifyImportService.ImportBatchView> batches(Authentication authentication) {
    return service.listBatches(UUID.fromString(authentication.getName()));
  }

  @DeleteMapping("/clockify/batches/{id}")
  @ResponseStatus(HttpStatus.OK)
  public ClockifyImportService.UndoSummary undo(
      Authentication authentication, @PathVariable UUID id) {
    return service.undoBatch(UUID.fromString(authentication.getName()), id);
  }
}
