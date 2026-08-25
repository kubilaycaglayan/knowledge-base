package com.know.api;

import com.know.service.ClockifyImportService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/imports")
public class ImportController {
    private final ClockifyImportService service;
    public ImportController(ClockifyImportService service) { this.service = service; }
    record ImportRequest(@NotEmpty java.util.List<ClockifyImportService.ClockifyEntry> timeentries) {}
    @PostMapping("/clockify")
    public ClockifyImportService.ImportSummary clockify(Authentication authentication, @Valid @RequestBody ImportRequest request) {
        return service.importEntries(UUID.fromString(authentication.getName()), new ClockifyImportService.ClockifyImportRequest(request.timeentries()));
    }
}
