package com.know.api;

import com.know.service.ReportService;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/reports")
public class ReportController {
  private final ReportService service;

  public ReportController(ReportService service) {
    this.service = service;
  }

  @GetMapping
  public ReportService.Report report(
      Authentication authentication,
      @RequestParam(defaultValue = "WEEK") String period,
      @RequestParam(required = false) LocalDate anchor,
      @RequestParam(required = false) LocalDate startDate,
      @RequestParam(required = false) LocalDate endDate) {
    UUID userId = UUID.fromString(authentication.getName());
    if (startDate != null || endDate != null) {
      if (startDate == null || endDate == null)
        throw new ResponseStatusException(
            HttpStatus.BAD_REQUEST, "startDate and endDate must be provided together");
      if (endDate.isBefore(startDate))
        throw new ResponseStatusException(
            HttpStatus.BAD_REQUEST, "endDate must be on or after startDate");
      if (startDate.plusYears(1).isBefore(endDate))
        throw new ResponseStatusException(
            HttpStatus.BAD_REQUEST, "Report range cannot exceed one year");
      return service.report(userId, startDate, endDate);
    }
    ReportService.Period selected;
    try {
      selected = ReportService.Period.valueOf(period.trim().toUpperCase());
    } catch (IllegalArgumentException exception) {
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST, "Period must be WEEK, MONTH, or YEAR");
    }
    return service.report(userId, selected, anchor);
  }
}
