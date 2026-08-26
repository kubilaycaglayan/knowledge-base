package com.know.api;

import com.know.service.ReportService;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.time.LocalDate;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/reports")
public class ReportController {
    private final ReportService service;

    public ReportController(ReportService service) { this.service = service; }

    @GetMapping
    public ReportService.Report report(Authentication authentication,
                                      @RequestParam(defaultValue = "WEEK") String period,
                                      @RequestParam(required = false) LocalDate anchor) {
        ReportService.Period selected;
        try { selected = ReportService.Period.valueOf(period.trim().toUpperCase()); }
        catch (IllegalArgumentException exception) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Period must be WEEK, MONTH, or YEAR"); }
        return service.report(UUID.fromString(authentication.getName()), selected, anchor);
    }
}
