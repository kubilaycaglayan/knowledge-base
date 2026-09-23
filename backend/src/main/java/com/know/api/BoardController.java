package com.know.api;

import com.know.domain.*;
import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.time.*;
import java.util.*;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/boards")
public class BoardController {
  private final BoardRepository boards;
  private final BoardStatusRepository statuses;
  private final BoardCardRepository cards;
  private final PathRepository paths;
  private final LabelRepository labels;
  private final LabelScopeRepository scopes;

  public BoardController(BoardRepository boards, BoardStatusRepository statuses, BoardCardRepository cards,
      PathRepository paths, LabelRepository labels, LabelScopeRepository scopes) {
    this.boards = boards; this.statuses = statuses; this.cards = cards; this.paths = paths; this.labels = labels; this.scopes = scopes;
  }

  record BoardRequest(@NotBlank @Size(max = 120) String name) {}
  record StatusRequest(@NotBlank @Size(max = 80) String name) {}
  record OrderRequest(@NotEmpty List<UUID> ids) {}
  record CardRequest(@Size(max = 240) String title, String body, BoardPriority priority, LocalDate startDate, LocalDate dueDate, List<UUID> pathIds, List<UUID> labelIds, Instant expectedUpdatedAt) {}
  record MoveRequest(@NotNull UUID statusId, @Min(0) int position) {}
  record BoardView(UUID id, String name, boolean archived, Instant createdAt, Instant updatedAt) { static BoardView of(Board b) { return new BoardView(b.getId(), b.getName(), b.isArchived(), b.getCreatedAt(), b.getUpdatedAt()); } }
  record StatusView(UUID id, String name, int position, boolean archived) { static StatusView of(BoardStatus s) { return new StatusView(s.getId(), s.getName(), s.getPosition(), s.isArchived()); } }
  record CardView(UUID id, UUID statusId, String title, String body, BoardPriority priority, LocalDate startDate, LocalDate dueDate, int position, boolean archived, List<UUID> pathIds, List<UUID> labelIds, Instant createdAt, Instant updatedAt) {
    static CardView of(BoardCard c) { return new CardView(c.getId(), c.getStatusId(), c.getTitle(), c.getBody(), c.getPriority(), c.getStartDate(), c.getDueDate(), c.getPosition(), c.isArchived(), c.getPaths().stream().map(Path::getId).toList(), c.getLabels().stream().map(Label::getId).toList(), c.getCreatedAt(), c.getUpdatedAt()); }
  }
  record CardPage(List<CardView> items, Integer nextCursor) {}

  private UUID user(Authentication auth) { return UUID.fromString(auth.getName()); }
  private Board board(Authentication auth, UUID id) { return boards.findByIdAndUserId(id, user(auth)).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Board not found")); }
  private Board writableBoard(Authentication auth, UUID id) { Board board = board(auth, id); if (board.isArchived()) throw new ResponseStatusException(HttpStatus.CONFLICT, "Archived boards are read-only"); return board; }
  private BoardStatus status(Board board, UUID id) { return statuses.findByIdAndBoardId(id, board.getId()).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Status not found")); }
  private BoardCard card(Board board, UUID id) { return cards.findByIdAndBoardId(id, board.getId()).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Card not found")); }

  @GetMapping public List<BoardView> list(Authentication auth, @RequestParam(defaultValue = "false") boolean archived) {
    return boards.findAllByUserIdOrderByUpdatedAtDesc(user(auth)).stream().filter(b -> b.isArchived() == archived).map(BoardView::of).toList();
  }
  @PostMapping @ResponseStatus(HttpStatus.CREATED) @Transactional public BoardView create(Authentication auth, @Valid @RequestBody BoardRequest request) {
    Board board = boards.save(new Board(user(auth), request.name()));
    String[] defaults = {"Backlog", "Pending", "In Progress", "Done"};
    for (int i = 0; i < defaults.length; i++) statuses.save(new BoardStatus(board.getId(), defaults[i], i));
    return BoardView.of(board);
  }
  @GetMapping("/{id}") public BoardView get(Authentication auth, @PathVariable UUID id) { return BoardView.of(board(auth, id)); }
  @PutMapping("/{id}") public BoardView update(Authentication auth, @PathVariable UUID id, @Valid @RequestBody BoardRequest request) { Board b = writableBoard(auth, id); b.rename(request.name()); return BoardView.of(boards.save(b)); }
  @PostMapping("/{id}/archive") public BoardView archive(Authentication auth, @PathVariable UUID id) { Board b = board(auth, id); b.archive(); return BoardView.of(boards.save(b)); }
  @PostMapping("/{id}/restore") public BoardView restore(Authentication auth, @PathVariable UUID id) { Board b = board(auth, id); b.restore(); return BoardView.of(boards.save(b)); }

  @GetMapping("/{id}/statuses") public List<StatusView> statusList(Authentication auth, @PathVariable UUID id) { Board b = board(auth, id); return statuses.findAllByBoardIdOrderByPosition(b.getId()).stream().map(StatusView::of).toList(); }
  @PostMapping("/{id}/statuses") @ResponseStatus(HttpStatus.CREATED) public StatusView createStatus(Authentication auth, @PathVariable UUID id, @Valid @RequestBody StatusRequest request) { Board b = writableBoard(auth, id); int position = statuses.findAllByBoardIdOrderByPosition(b.getId()).size(); return StatusView.of(statuses.save(new BoardStatus(b.getId(), request.name(), position))); }
  @PutMapping("/{id}/statuses/{statusId}") public StatusView updateStatus(Authentication auth, @PathVariable UUID id, @PathVariable UUID statusId, @Valid @RequestBody StatusRequest request) { Board b = writableBoard(auth, id); BoardStatus s = status(b, statusId); s.rename(request.name()); return StatusView.of(statuses.save(s)); }
  @PutMapping("/{id}/statuses/order") @Transactional public List<StatusView> reorderStatuses(Authentication auth, @PathVariable UUID id, @Valid @RequestBody OrderRequest request) { Board b = writableBoard(auth, id); List<BoardStatus> all = statuses.findAllByBoardIdOrderByPosition(b.getId()); if (all.size() != request.ids().stream().distinct().count() || all.stream().anyMatch(s -> !request.ids().contains(s.getId()))) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Every status must belong to the board"); Map<UUID, BoardStatus> byId = new HashMap<>(); all.forEach(s -> byId.put(s.getId(), s)); for (int i = 0; i < request.ids().size(); i++) byId.get(request.ids().get(i)).moveTo(i); statuses.saveAll(all); return statuses.findAllByBoardIdOrderByPosition(b.getId()).stream().map(StatusView::of).toList(); }
  @PostMapping("/{id}/statuses/{statusId}/archive") @Transactional public void archiveStatus(Authentication auth, @PathVariable UUID id, @PathVariable UUID statusId) { Board b = writableBoard(auth, id); BoardStatus s = status(b, statusId); List<BoardStatus> active = statuses.findAllByBoardIdOrderByPosition(b.getId()).stream().filter(x -> !x.isArchived()).toList(); if (active.size() <= 1) throw new ResponseStatusException(HttpStatus.CONFLICT, "A board needs one active status"); BoardStatus target = active.stream().filter(x -> !x.getId().equals(s.getId())).findFirst().orElseThrow(); List<BoardCard> destination = cards.findAllByBoardIdAndStatusIdAndArchivedAtIsNullOrderByPositionAsc(b.getId(), target.getId()); int nextPosition = destination.size(); for (BoardCard card : cards.findAllByBoardIdAndStatusIdAndArchivedAtIsNullOrderByPositionAsc(b.getId(), s.getId())) card.move(target.getId(), nextPosition++); s.archive(); statuses.save(s); }
  @PostMapping("/{id}/statuses/{statusId}/restore") public StatusView restoreStatus(Authentication auth, @PathVariable UUID id, @PathVariable UUID statusId) { Board b = writableBoard(auth, id); BoardStatus s = status(b, statusId); s.restore(); return StatusView.of(statuses.save(s)); }

  @GetMapping("/{id}/cards") @Transactional public List<CardView> cardList(Authentication auth, @PathVariable UUID id, @RequestParam(required = false) UUID statusId, @RequestParam(defaultValue = "false") boolean archived) { Board b = board(auth, id); if (archived) return cards.findAllByBoardIdAndArchivedAtNotNullOrderByUpdatedAtDesc(b.getId()).stream().map(CardView::of).toList(); if (statusId != null) { status(b, statusId); return cards.findAllByBoardIdAndStatusIdAndArchivedAtIsNullOrderByPositionAsc(b.getId(), statusId).stream().map(CardView::of).toList(); } return cards.findAllByBoardIdAndArchivedAtIsNullOrderByStatusIdAscPositionAsc(b.getId()).stream().map(CardView::of).toList(); }
  @GetMapping("/{id}/cards/page") @Transactional public CardPage cardPage(Authentication auth, @PathVariable UUID id, @RequestParam UUID statusId, @RequestParam(defaultValue = "-1") int cursor, @RequestParam(defaultValue = "20") int limit) { Board b = board(auth, id); status(b, statusId); if (limit < 1 || limit > 100 || cursor < -1) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "cursor and limit are invalid"); List<BoardCard> page = cards.findAllByBoardIdAndStatusIdAndArchivedAtIsNullAndPositionGreaterThanOrderByPositionAsc(b.getId(), statusId, cursor, PageRequest.of(0, limit + 1)); boolean more = page.size() > limit; if (more) page = page.subList(0, limit); Integer next = more && !page.isEmpty() ? page.get(page.size() - 1).getPosition() : null; return new CardPage(page.stream().map(CardView::of).toList(), next); }
  @PostMapping("/{id}/cards") @ResponseStatus(HttpStatus.CREATED) @Transactional public CardView createCard(Authentication auth, @PathVariable UUID id, @Valid @RequestBody CardRequest request) { Board b = writableBoard(auth, id); validateDates(request); BoardStatus s = statuses.findAllByBoardIdOrderByPosition(b.getId()).stream().filter(x -> !x.isArchived()).findFirst().orElseThrow(); BoardCard c = new BoardCard(b.getId(), s.getId(), cards.findAllByBoardIdAndStatusIdAndArchivedAtIsNullOrderByPositionAsc(b.getId(), s.getId()).size()); apply(auth, b, c, request); return CardView.of(cards.save(c)); }
  @GetMapping("/{id}/cards/{cardId}") @Transactional public CardView getCard(Authentication auth, @PathVariable UUID id, @PathVariable UUID cardId) { return CardView.of(card(board(auth, id), cardId)); }
  @PutMapping("/{id}/cards/{cardId}") @Transactional public CardView updateCard(Authentication auth, @PathVariable UUID id, @PathVariable UUID cardId, @Valid @RequestBody CardRequest request) { Board b = writableBoard(auth, id); BoardCard c = card(b, cardId); if (request.expectedUpdatedAt() != null && !request.expectedUpdatedAt().equals(c.getUpdatedAt())) throw new ResponseStatusException(HttpStatus.CONFLICT, "Card changed elsewhere"); apply(auth, b, c, request); return CardView.of(cards.save(c)); }
  @PostMapping("/{id}/cards/{cardId}/move") @Transactional public CardView moveCard(Authentication auth, @PathVariable UUID id, @PathVariable UUID cardId, @Valid @RequestBody MoveRequest request) { Board b = writableBoard(auth, id); BoardStatus target = status(b, request.statusId()); if (target.isArchived()) throw new ResponseStatusException(HttpStatus.CONFLICT, "Cannot move to an archived status"); BoardCard c = card(b, cardId); UUID sourceId = c.getStatusId(); List<BoardCard> destination = new ArrayList<>(cards.findAllByBoardIdAndStatusIdAndArchivedAtIsNullOrderByPositionAsc(b.getId(), target.getId())); List<BoardCard> source = sourceId.equals(target.getId()) ? destination : new ArrayList<>(cards.findAllByBoardIdAndStatusIdAndArchivedAtIsNullOrderByPositionAsc(b.getId(), sourceId)); source.removeIf(item -> item.getId().equals(c.getId())); if (!sourceId.equals(target.getId())) destination.removeIf(item -> item.getId().equals(c.getId())); int destinationPosition = Math.min(request.position(), destination.size()); destination.add(destinationPosition, c); for (int i = 0; i < source.size(); i++) source.get(i).move(sourceId, i); for (int i = 0; i < destination.size(); i++) destination.get(i).move(target.getId(), i); List<BoardCard> changed = new ArrayList<>(source); destination.forEach(item -> { if (changed.stream().noneMatch(existing -> existing.getId().equals(item.getId()))) changed.add(item); }); cards.saveAll(changed); return CardView.of(c); }
  @PostMapping("/{id}/cards/{cardId}/archive") public CardView archiveCard(Authentication auth, @PathVariable UUID id, @PathVariable UUID cardId) { BoardCard c = card(writableBoard(auth, id), cardId); c.archive(); return CardView.of(cards.save(c)); }
  @PostMapping("/{id}/cards/{cardId}/restore") @Transactional public CardView restoreCard(Authentication auth, @PathVariable UUID id, @PathVariable UUID cardId) { Board b = writableBoard(auth, id); BoardCard c = card(b, cardId); BoardStatus current = status(b, c.getStatusId()); if (current.isArchived()) { BoardStatus fallback = statuses.findAllByBoardIdOrderByPosition(b.getId()).stream().filter(s -> !s.isArchived()).findFirst().orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "A board needs one active status")); int position = cards.findAllByBoardIdAndStatusIdAndArchivedAtIsNullOrderByPositionAsc(b.getId(), fallback.getId()).size(); c.move(fallback.getId(), position); } c.restore(); return CardView.of(cards.save(c)); }
  @GetMapping("/{id}/gantt") @Transactional public List<CardView> gantt(Authentication auth, @PathVariable UUID id, @RequestParam LocalDate from, @RequestParam LocalDate to) { if (to.isBefore(from)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "to must be on or after from"); Board b = board(auth, id); Set<UUID> activeStatusIds = statuses.findAllByBoardIdOrderByPosition(b.getId()).stream().filter(s -> !s.isArchived()).map(BoardStatus::getId).collect(java.util.stream.Collectors.toSet()); return cards.findGanttCards(b.getId(), from, to).stream().filter(c -> activeStatusIds.contains(c.getStatusId())).map(CardView::of).toList(); }

  private void apply(Authentication auth, Board board, BoardCard card, CardRequest request) {
    validateDates(request);
    card.update(request.title(), request.body(), request.priority(), request.startDate(), request.dueDate());
    UUID owner = user(auth);
    List<Path> ownedPaths = request.pathIds() == null ? List.of() : paths.findByUserIdAndIdIn(owner, request.pathIds());
    if (ownedPaths.size() != (request.pathIds() == null ? 0 : request.pathIds().stream().distinct().count())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Every path must belong to the user");
    List<Label> ownedLabels = request.labelIds() == null ? List.of() : labels.findAllByUserIdAndIdIn(owner, request.labelIds());
    if (ownedLabels.size() != (request.labelIds() == null ? 0 : request.labelIds().stream().distinct().count()) || ownedLabels.stream().anyMatch(l -> !scopes.existsByIdLabelIdAndIdScope(l.getId(), LabelScopeType.BOARD))) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Every label must be a BOARD label owned by the user");
    card.setPaths(ownedPaths); card.setLabels(ownedLabels);
  }

  private void validateDates(CardRequest request) {
    if (request.startDate() != null && request.dueDate() != null && request.dueDate().isBefore(request.startDate())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "dueDate must be on or after startDate");
  }
}
