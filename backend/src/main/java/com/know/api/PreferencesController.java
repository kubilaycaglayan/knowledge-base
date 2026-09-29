package com.know.api;

import com.know.service.UserPreferencesService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/preferences")
public class PreferencesController {
  private final UserPreferencesService service;

  public PreferencesController(UserPreferencesService service) {
    this.service = service;
  }

  /** Omitted fields keep their stored value. */
  record Request(@Pattern(regexp = "auto|light|dark") String theme, Boolean kanbanWide, UUID lastCardBoardId, @Valid BoardState board) {}

  /** Replaces the whole stored Boards page state; a null board is All boards. */
  record BoardState(UUID boardId, @Pattern(regexp = "kanban|gantt") String view, LocalDate ganttFrom, LocalDate ganttTo, @Size(max = 200) String search) {}

  private UUID user(Authentication a) {
    return UUID.fromString(a.getName());
  }

  @GetMapping
  public UserPreferencesService.View get(Authentication a) {
    return service.get(user(a));
  }

  @PutMapping
  public UserPreferencesService.View update(Authentication a, @Valid @RequestBody Request r) {
    UserPreferencesService.BoardState board = r.board() == null ? null
        : new UserPreferencesService.BoardState(r.board().boardId(), r.board().view(), r.board().ganttFrom(), r.board().ganttTo(), r.board().search());
    return service.update(user(a), r.theme(), r.kanbanWide(), r.lastCardBoardId(), board);
  }
}
