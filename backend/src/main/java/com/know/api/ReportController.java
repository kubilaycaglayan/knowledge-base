package com.know.api;

import com.know.service.ReportService;
import java.time.LocalDate;
import java.util.UUID;
import java.util.List;
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
      @RequestParam(required = false) String aggregation,
      @RequestParam(required = false) LocalDate anchor,
      @RequestParam(required = false) LocalDate startDate,
      @RequestParam(required = false) LocalDate endDate,
      @RequestParam(name = "pathId", required = false) List<UUID> pathIds) {
    UUID userId = UUID.fromString(authentication.getName());
    if (startDate != null || endDate != null) {
      if (startDate == null || endDate == null)
        throw new ResponseStatusException(
            HttpStatus.BAD_REQUEST, "startDate and endDate must be provided together");
      if (endDate.isBefore(startDate))
        throw new ResponseStatusException(
            HttpStatus.BAD_REQUEST, "endDate must be on or after startDate");
      if (startDate.plusYears(2).isBefore(endDate))
        throw new ResponseStatusException(
            HttpStatus.BAD_REQUEST, "Report range cannot exceed two years");
      ReportService.Aggregation selectedAggregation = parseAggregation(aggregation);
      return pathIds == null || pathIds.isEmpty()
          ? service.report(userId, startDate, endDate, selectedAggregation)
          : service.report(userId, startDate, endDate, selectedAggregation, pathIds);
    }
    ReportService.Period selected;
    try {
      selected = ReportService.Period.valueOf(period.trim().toUpperCase());
    } catch (IllegalArgumentException exception) {
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST, "Period must be WEEK, MONTH, or YEAR");
    }
    return pathIds == null || pathIds.isEmpty()
        ? service.report(userId, selected, anchor)
        : service.report(userId, selected, anchor, pathIds);
  }

  private static ReportService.Aggregation parseAggregation(String aggregation) {
    if (aggregation == null) return ReportService.Aggregation.DAY;
    try {
      return ReportService.Aggregation.valueOf(aggregation.trim().toUpperCase());
    } catch (IllegalArgumentException exception) {
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST,
          "Aggregation must be DAY, WEEK, MONTH, QUARTER, or YEAR");
    }
  }
}
