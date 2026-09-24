package com.know.api;

import com.know.api.BoardController.CardView;
import com.know.api.BoardController.StatusView;
import com.know.domain.BoardCardSort;
import com.know.service.AllBoardsService;
import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.time.LocalDate;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/**
 * Reads for the All boards view. Every tab board's columns merge by name; changing a card still
 * goes through its own board's endpoints.
 */
@RestController
@RequestMapping("/api/v1/boards/all")
public class AllBoardsController {
  private final AllBoardsService service;

  public AllBoardsController(AllBoardsService service) {
    this.service = service;
  }

  record ColumnView(String name, BoardCardSort cardSort, List<StatusView> statuses) {
    static ColumnView of(AllBoardsService.Column column) { return new ColumnView(column.name(), column.cardSort(), column.statuses().stream().map(StatusView::of).toList()); }
  }
  record ColumnSortRequest(@NotBlank @Size(max = 80) String name, @NotNull BoardCardSort cardSort) {}
  record ColumnSortView(String name, BoardCardSort cardSort) {}

  private UUID user(Authentication auth) { return UUID.fromString(auth.getName()); }

  @GetMapping("/columns") public List<ColumnView> columns(Authentication auth) {
    return service.columns(user(auth)).stream().map(ColumnView::of).toList();
  }

  @GetMapping("/columns/cards/page") @Transactional public BoardController.CardPage columnPage(Authentication auth, @RequestParam String name, @RequestParam(defaultValue = "-1") int cursor, @RequestParam(defaultValue = "20") int limit) {
    if (limit < 1 || limit > 100 || cursor < -1) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "cursor and limit are invalid");
    AllBoardsService.Page page = service.columnPage(user(auth), name, cursor, limit);
    return new BoardController.CardPage(page.items().stream().map(CardView::of).toList(), page.nextCursor());
  }

  @PutMapping("/columns/sort") public ColumnSortView sortColumn(Authentication auth, @Valid @RequestBody ColumnSortRequest request) {
    return new ColumnSortView(request.name().trim(), service.sortColumn(user(auth), request.name(), request.cardSort()));
  }

  @GetMapping("/gantt") @Transactional public List<CardView> gantt(Authentication auth, @RequestParam LocalDate from, @RequestParam LocalDate to) {
    if (to.isBefore(from)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "to must be on or after from");
    return service.gantt(user(auth), from, to).stream().map(CardView::of).toList();
  }
}
