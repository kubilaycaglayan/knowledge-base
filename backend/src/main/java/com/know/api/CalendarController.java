package com.know.api;

import com.know.service.CalendarService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/calendar")
public class CalendarController {
  private final CalendarService service;

  public CalendarController(CalendarService service) {
    this.service = service;
  }

  record LabelRequest(
      @NotBlank @Size(max = 80) String name, @Pattern(regexp = "^#[0-9A-Fa-f]{6}$") String color) {}

  record AssignmentRequest(@NotNull UUID labelId, BigDecimal portion) {}

  record DayRequest(
      @Size(max = 20000) String note, @Valid @NotNull List<AssignmentRequest> labels) {}

  record RangeRequest(
      @NotNull LocalDate startDate,
      @NotNull LocalDate endDate,
      @Size(max = 20000) String note,
      @Valid @NotNull List<AssignmentRequest> labels) {}

  private UUID user(Authentication authentication) {
    return UUID.fromString(authentication.getName());
  }

  @GetMapping("/labels")
  public List<CalendarService.LabelView> labels(Authentication a) {
    return service.labels(user(a));
  }

  @PostMapping("/labels")
  @ResponseStatus(HttpStatus.CREATED)
  public CalendarService.LabelView createLabel(
      Authentication a, @Valid @RequestBody LabelRequest r) {
    return service.createLabel(user(a), r.name(), r.color());
  }

  @PutMapping("/labels/{id}")
  public CalendarService.LabelView updateLabel(
      Authentication a, @PathVariable UUID id, @Valid @RequestBody LabelRequest r) {
    return service.updateLabel(user(a), id, r.name(), r.color());
  }

  @DeleteMapping("/labels/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void deleteLabel(Authentication a, @PathVariable UUID id) {
    service.deleteLabel(user(a), id);
  }

  @GetMapping("/days")
  public List<CalendarService.DayView> days(
      Authentication a, @RequestParam LocalDate startDate, @RequestParam LocalDate endDate) {
    if (endDate.isBefore(startDate) || startDate.plusYears(1).isBefore(endDate))
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST, "Calendar range must be between zero days and one year");
    return service.days(user(a), startDate, endDate);
  }

  @PutMapping("/days/range")
  public List<CalendarService.DayView> replaceRange(
      Authentication a, @Valid @RequestBody RangeRequest r) {
    return service.applyRange(
        user(a),
        r.startDate(),
        r.endDate(),
        r.note(),
        r.labels().stream()
            .map(v -> new CalendarService.LabelInput(v.labelId(), v.portion()))
            .toList());
  }

  @PutMapping("/days/{date}")
  public CalendarService.DayView replaceDay(
      Authentication a, @PathVariable LocalDate date, @Valid @RequestBody DayRequest r) {
    return service.replaceDay(
        user(a),
        date,
        r.note(),
        r.labels().stream()
            .map(v -> new CalendarService.LabelInput(v.labelId(), v.portion()))
            .toList());
  }

  @DeleteMapping("/days/{date}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void deleteDay(Authentication a, @PathVariable LocalDate date) {
    service.replaceDay(user(a), date, null, List.of());
  }
}
