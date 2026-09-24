package com.know.api;

import com.know.domain.*;
import com.know.service.BoardService;
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
  private final BoardService boardService;

  public BoardController(BoardRepository boards, BoardStatusRepository statuses, BoardCardRepository cards,
      PathRepository paths, LabelRepository labels, LabelScopeRepository scopes, BoardService boardService) {
    this.boards = boards; this.statuses = statuses; this.cards = cards; this.paths = paths; this.labels = labels; this.scopes = scopes; this.boardService = boardService;
  }

  record BoardRequest(@NotBlank @Size(max = 120) String name) {}
  record StatusRequest(@NotBlank @Size(max = 80) String name) {}
  record StatusSortRequest(@NotNull BoardCardSort cardSort) {}
  record OrderRequest(@NotEmpty List<UUID> ids) {}
  record VisibilityRequest(boolean hidden) {}
  record PinRequest(boolean pinned) {}
  record CardRequest(@Size(max = 240) String title, String body, BoardPriority priority, LocalDate startDate, LocalDate dueDate, List<UUID> pathIds, List<UUID> labelIds, Instant expectedUpdatedAt, UUID statusId) {}
  record ColumnCardRequest(@NotBlank @Size(max = 80) String columnName, @Size(max = 240) String title, String body, BoardPriority priority, LocalDate startDate, LocalDate dueDate, List<UUID> pathIds, List<UUID> labelIds) {
    CardRequest card() { return new CardRequest(title, body, priority, startDate, dueDate, pathIds, labelIds, null, null); }
  }
  record MoveRequest(@NotNull UUID statusId, @Min(0) int position) {}
  record ColumnMoveRequest(@NotBlank @Size(max = 80) String columnName, @Min(0) int position) {}
  record TransferRequest(@NotNull UUID boardId) {}
  record BoardView(UUID id, String name, boolean archived, UUID pathId, boolean hidden, boolean pinned, Instant createdAt, Instant updatedAt) { static BoardView of(Board b) { return new BoardView(b.getId(), b.getName(), b.isArchived(), b.getPathId(), b.isHidden(), b.isPinned(), b.getCreatedAt(), b.getUpdatedAt()); } }
  record StatusView(UUID id, UUID boardId, String name, int position, boolean archived, BoardCardSort cardSort) { static StatusView of(BoardStatus s) { return new StatusView(s.getId(), s.getBoardId(), s.getName(), s.getPosition(), s.isArchived(), s.getCardSort()); } }
  record CardView(UUID id, UUID boardId, UUID statusId, String title, String body, BoardPriority priority, LocalDate startDate, LocalDate dueDate, int position, boolean archived, List<UUID> pathIds, List<UUID> labelIds, Instant createdAt, Instant updatedAt) {
    static CardView of(BoardCard c) { return new CardView(c.getId(), c.getBoardId(), c.getStatusId(), c.getTitle(), c.getBody(), c.getPriority(), c.getStartDate(), c.getDueDate(), c.getPosition(), c.isArchived(), c.getPaths().stream().map(Path::getId).toList(), c.getLabels().stream().map(Label::getId).toList(), c.getCreatedAt(), c.getUpdatedAt()); }
  }
  /** A card placed by column name, with the column and whether placing the card created it. */
  record PlacedCardView(CardView card, StatusView status, boolean statusCreated) {
    static PlacedCardView of(BoardCard c, BoardService.Placement p) { return new PlacedCardView(CardView.of(c), StatusView.of(p.status()), p.created()); }
  }
  record CardPage(List<CardView> items, Integer nextCursor) {}

  private UUID user(Authentication auth) { return UUID.fromString(auth.getName()); }
  private Board board(Authentication auth, UUID id) { return boards.findByIdAndUserId(id, user(auth)).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Board not found")); }
  private Board writableBoard(Authentication auth, UUID id) { Board board = board(auth, id); if (board.isArchived()) throw new ResponseStatusException(HttpStatus.CONFLICT, "Archived boards are read-only"); return board; }
  private static final String PATH_BOARD_RULE = "Path boards follow their path";
  private Board customBoard(Authentication auth, UUID id) { Board board = board(auth, id); if (board.isPathBoard()) throw new ResponseStatusException(HttpStatus.CONFLICT, PATH_BOARD_RULE); return board; }
  private BoardStatus status(Board board, UUID id) { return statuses.findByIdAndBoardId(id, board.getId()).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Status not found")); }
  private BoardCard card(Board board, UUID id) { return cards.findByIdAndBoardId(id, board.getId()).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Card not found")); }

  // Active boards come back in tab order; see BoardService.tabs.
  @GetMapping public List<BoardView> list(Authentication auth, @RequestParam(defaultValue = "false") boolean archived, @RequestParam(defaultValue = "false") boolean includeHidden) {
    if (!archived) return boardService.tabs(user(auth), includeHidden).stream().map(BoardView::of).toList();
    return boards.findAllByUserIdOrderByUpdatedAtDesc(user(auth)).stream().filter(Board::isArchived).map(BoardView::of).toList();
  }
  @PostMapping @ResponseStatus(HttpStatus.CREATED) public BoardView create(Authentication auth, @Valid @RequestBody BoardRequest request) {
    return BoardView.of(boardService.create(user(auth), request.name()));
  }
  @PutMapping("/order") @ResponseStatus(HttpStatus.NO_CONTENT) @Transactional public void order(Authentication auth, @Valid @RequestBody OrderRequest request) {
    List<Board> owned = boards.findAllByUserIdAndIdIn(user(auth), request.ids());
    if (owned.size() != request.ids().stream().distinct().count()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Every board must be owned by the user");
    Map<UUID, Board> byId = new HashMap<>(); owned.forEach(b -> byId.put(b.getId(), b));
    for (int i = 0; i < request.ids().size(); i++) byId.get(request.ids().get(i)).setSortOrder(i);
    boards.saveAll(owned);
  }
  @PostMapping("/{id}/visibility") public BoardView visibility(Authentication auth, @PathVariable UUID id, @RequestBody VisibilityRequest request) {
    Board b = board(auth, id); if (!b.isPathBoard()) throw new ResponseStatusException(HttpStatus.CONFLICT, "Only path boards can be hidden"); b.setHidden(request.hidden()); return BoardView.of(boards.save(b));
  }
  @PostMapping("/{id}/pin") public BoardView pin(Authentication auth, @PathVariable UUID id, @RequestBody PinRequest request) { Board b = board(auth, id); b.setPinned(request.pinned()); return BoardView.of(boards.save(b)); }
  @GetMapping("/{id}") public BoardView get(Authentication auth, @PathVariable UUID id) { return BoardView.of(board(auth, id)); }
  @PutMapping("/{id}") public BoardView update(Authentication auth, @PathVariable UUID id, @Valid @RequestBody BoardRequest request) { Board b = writableBoard(auth, id); if (b.isPathBoard()) throw new ResponseStatusException(HttpStatus.CONFLICT, PATH_BOARD_RULE); b.rename(request.name()); return BoardView.of(boards.save(b)); }
  @PostMapping("/{id}/archive") public BoardView archive(Authentication auth, @PathVariable UUID id) { Board b = customBoard(auth, id); b.archive(); return BoardView.of(boards.save(b)); }
  @PostMapping("/{id}/restore") public BoardView restore(Authentication auth, @PathVariable UUID id) { Board b = customBoard(auth, id); b.restore(); return BoardView.of(boards.save(b)); }

  @GetMapping("/{id}/statuses") public List<StatusView> statusList(Authentication auth, @PathVariable UUID id) { Board b = board(auth, id); return statuses.findAllByBoardIdOrderByPosition(b.getId()).stream().map(StatusView::of).toList(); }
  @PostMapping("/{id}/statuses") @ResponseStatus(HttpStatus.CREATED) public StatusView createStatus(Authentication auth, @PathVariable UUID id, @Valid @RequestBody StatusRequest request) { Board b = writableBoard(auth, id); int position = statuses.findAllByBoardIdOrderByPosition(b.getId()).size(); return StatusView.of(statuses.save(new BoardStatus(b.getId(), request.name(), position))); }
  @PutMapping("/{id}/statuses/{statusId}") public StatusView updateStatus(Authentication auth, @PathVariable UUID id, @PathVariable UUID statusId, @Valid @RequestBody StatusRequest request) { Board b = writableBoard(auth, id); BoardStatus s = status(b, statusId); s.rename(request.name()); return StatusView.of(statuses.save(s)); }
  @PutMapping("/{id}/statuses/{statusId}/sort") public StatusView sortStatus(Authentication auth, @PathVariable UUID id, @PathVariable UUID statusId, @Valid @RequestBody StatusSortRequest request) { Board b = writableBoard(auth, id); BoardStatus s = status(b, statusId); s.sortCardsBy(request.cardSort()); return StatusView.of(statuses.save(s)); }
  @PutMapping("/{id}/statuses/order") @Transactional public List<StatusView> reorderStatuses(Authentication auth, @PathVariable UUID id, @Valid @RequestBody OrderRequest request) { Board b = writableBoard(auth, id); List<BoardStatus> all = statuses.findAllByBoardIdOrderByPosition(b.getId()); if (all.size() != request.ids().stream().distinct().count() || all.stream().anyMatch(s -> !request.ids().contains(s.getId()))) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Every status must belong to the board"); Map<UUID, BoardStatus> byId = new HashMap<>(); all.forEach(s -> byId.put(s.getId(), s)); for (int i = 0; i < request.ids().size(); i++) byId.get(request.ids().get(i)).moveTo(i); statuses.saveAll(all); return statuses.findAllByBoardIdOrderByPosition(b.getId()).stream().map(StatusView::of).toList(); }
  @PostMapping("/{id}/statuses/{statusId}/archive") @Transactional public void archiveStatus(Authentication auth, @PathVariable UUID id, @PathVariable UUID statusId) { Board b = writableBoard(auth, id); BoardStatus s = status(b, statusId); List<BoardStatus> active = statuses.findAllByBoardIdOrderByPosition(b.getId()).stream().filter(x -> !x.isArchived()).toList(); if (active.size() <= 1) throw new ResponseStatusException(HttpStatus.CONFLICT, "A board needs one active status"); BoardStatus target = active.stream().filter(x -> !x.getId().equals(s.getId())).findFirst().orElseThrow(); List<BoardCard> destination = cards.findAllByBoardIdAndStatusIdAndArchivedAtIsNullOrderByPositionAsc(b.getId(), target.getId()); int nextPosition = destination.size(); for (BoardCard card : cards.findAllByBoardIdAndStatusIdAndArchivedAtIsNullOrderByPositionAsc(b.getId(), s.getId())) card.move(target.getId(), nextPosition++); s.archive(); statuses.save(s); }
  @PostMapping("/{id}/statuses/{statusId}/restore") public StatusView restoreStatus(Authentication auth, @PathVariable UUID id, @PathVariable UUID statusId) { Board b = writableBoard(auth, id); BoardStatus s = status(b, statusId); s.restore(); return StatusView.of(statuses.save(s)); }

  @GetMapping("/{id}/cards") @Transactional public List<CardView> cardList(Authentication auth, @PathVariable UUID id, @RequestParam(required = false) UUID statusId, @RequestParam(defaultValue = "false") boolean archived) { Board b = board(auth, id); if (archived) return cards.findAllByBoardIdAndArchivedAtNotNullOrderByUpdatedAtDesc(b.getId()).stream().map(CardView::of).toList(); if (statusId != null) { status(b, statusId); return cards.findAllByBoardIdAndStatusIdAndArchivedAtIsNullOrderByPositionAsc(b.getId(), statusId).stream().map(CardView::of).toList(); } return cards.findAllByBoardIdAndArchivedAtIsNullOrderByStatusIdAscPositionAsc(b.getId()).stream().map(CardView::of).toList(); }
  @GetMapping("/{id}/cards/page") @Transactional public CardPage cardPage(Authentication auth, @PathVariable UUID id, @RequestParam UUID statusId, @RequestParam(defaultValue = "-1") int cursor, @RequestParam(defaultValue = "20") int limit) { Board b = board(auth, id); BoardStatus s = status(b, statusId); if (limit < 1 || limit > 100 || cursor < -1) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "cursor and limit are invalid"); boolean byPriority = s.getCardSort() != BoardCardSort.MANUAL; /* Manual columns page by position; priority columns by offset, where the cursor is the index of the last card returned. */ List<BoardCard> page = switch (s.getCardSort()) { case PRIORITY -> cards.findPriorityPage(b.getId(), statusId, cursor + 1, limit + 1); case PRIORITY_LAST -> cards.findPriorityLastPage(b.getId(), statusId, cursor + 1, limit + 1); case MANUAL -> cards.findAllByBoardIdAndStatusIdAndArchivedAtIsNullAndPositionGreaterThanOrderByPositionAsc(b.getId(), statusId, cursor, PageRequest.of(0, limit + 1)); }; boolean more = page.size() > limit; if (more) page = page.subList(0, limit); Integer next = more && !page.isEmpty() ? (byPriority ? cursor + limit : page.get(page.size() - 1).getPosition()) : null; return new CardPage(page.stream().map(CardView::of).toList(), next); }
  @PostMapping("/{id}/cards") @ResponseStatus(HttpStatus.CREATED) @Transactional public CardView createCard(Authentication auth, @PathVariable UUID id, @Valid @RequestBody CardRequest request) { Board b = writableBoard(auth, id); validateDates(request); BoardStatus s = createTarget(b, request.statusId()); BoardCard c = new BoardCard(b.getId(), s.getId(), cards.findAllByBoardIdAndStatusIdAndArchivedAtIsNullOrderByPositionAsc(b.getId(), s.getId()).size()); apply(auth, b, c, request); return CardView.of(cards.save(c)); }
  @GetMapping("/{id}/cards/{cardId}") @Transactional public CardView getCard(Authentication auth, @PathVariable UUID id, @PathVariable UUID cardId) { return CardView.of(card(board(auth, id), cardId)); }
  @PutMapping("/{id}/cards/{cardId}") @Transactional public CardView updateCard(Authentication auth, @PathVariable UUID id, @PathVariable UUID cardId, @Valid @RequestBody CardRequest request) { Board b = writableBoard(auth, id); BoardCard c = card(b, cardId); if (request.expectedUpdatedAt() != null && !request.expectedUpdatedAt().equals(c.getUpdatedAt())) throw new ResponseStatusException(HttpStatus.CONFLICT, "Card changed elsewhere"); apply(auth, b, c, request); return CardView.of(cards.save(c)); }
  @PostMapping("/{id}/cards/{cardId}/move") @Transactional public CardView moveCard(Authentication auth, @PathVariable UUID id, @PathVariable UUID cardId, @Valid @RequestBody MoveRequest request) { Board b = writableBoard(auth, id); BoardStatus target = status(b, request.statusId()); if (target.isArchived()) throw new ResponseStatusException(HttpStatus.CONFLICT, "Cannot move to an archived status"); return CardView.of(boardService.move(b, card(b, cardId), target, request.position())); }
  // The All boards view places cards by column name; a board without that column gets it.
  @PostMapping("/{id}/cards/{cardId}/move-to-column") @Transactional public PlacedCardView moveCardToColumn(Authentication auth, @PathVariable UUID id, @PathVariable UUID cardId, @Valid @RequestBody ColumnMoveRequest request) { Board b = writableBoard(auth, id); BoardCard c = card(b, cardId); BoardService.Placement placement = boardService.findOrCreateStatus(b, request.columnName()); return PlacedCardView.of(boardService.move(b, c, placement.status(), request.position()), placement); }
  @PostMapping("/{id}/cards/in-column") @ResponseStatus(HttpStatus.CREATED) @Transactional public PlacedCardView createCardInColumn(Authentication auth, @PathVariable UUID id, @Valid @RequestBody ColumnCardRequest request) { Board b = writableBoard(auth, id); CardRequest card = request.card(); validateDates(card); BoardService.Placement placement = boardService.findOrCreateStatus(b, request.columnName()); BoardCard c = new BoardCard(b.getId(), placement.status().getId(), cards.findAllByBoardIdAndStatusIdAndArchivedAtIsNullOrderByPositionAsc(b.getId(), placement.status().getId()).size()); apply(auth, b, c, card); return PlacedCardView.of(cards.save(c), placement); }
  @PostMapping("/{id}/cards/{cardId}/transfer") @Transactional public PlacedCardView transferCard(Authentication auth, @PathVariable UUID id, @PathVariable UUID cardId, @Valid @RequestBody TransferRequest request) { Board from = writableBoard(auth, id); BoardCard c = card(from, cardId); Board to = writableBoard(auth, request.boardId()); BoardService.Placement placement = boardService.transfer(from, c, to); return PlacedCardView.of(c, placement); }
  // CardView reads the lazy paths and labels collections, so this needs an open
  // persistence context like every other endpoint that returns a CardView.
  @PostMapping("/{id}/cards/{cardId}/archive") @Transactional public CardView archiveCard(Authentication auth, @PathVariable UUID id, @PathVariable UUID cardId) { BoardCard c = card(writableBoard(auth, id), cardId); c.archive(); return CardView.of(cards.save(c)); }
  @PostMapping("/{id}/cards/{cardId}/restore") @Transactional public CardView restoreCard(Authentication auth, @PathVariable UUID id, @PathVariable UUID cardId) { Board b = writableBoard(auth, id); BoardCard c = card(b, cardId); BoardStatus current = status(b, c.getStatusId()); if (current.isArchived()) { BoardStatus fallback = statuses.findAllByBoardIdOrderByPosition(b.getId()).stream().filter(s -> !s.isArchived()).findFirst().orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "A board needs one active status")); int position = cards.findAllByBoardIdAndStatusIdAndArchivedAtIsNullOrderByPositionAsc(b.getId(), fallback.getId()).size(); c.move(fallback.getId(), position); } c.restore(); return CardView.of(cards.save(c)); }
  @GetMapping("/{id}/gantt") @Transactional public List<CardView> gantt(Authentication auth, @PathVariable UUID id, @RequestParam LocalDate from, @RequestParam LocalDate to) { if (to.isBefore(from)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "to must be on or after from"); Board b = board(auth, id); Set<UUID> activeStatusIds = statuses.findAllByBoardIdOrderByPosition(b.getId()).stream().filter(s -> !s.isArchived()).map(BoardStatus::getId).collect(java.util.stream.Collectors.toSet()); return cards.findGanttCards(b.getId(), from, to).stream().filter(c -> activeStatusIds.contains(c.getStatusId())).map(CardView::of).toList(); }

  private void apply(Authentication auth, Board board, BoardCard card, CardRequest request) {
    validateDates(request);
    card.update(request.title(), request.body(), request.priority(), request.startDate(), request.dueDate());
    UUID owner = user(auth);
    // A path board's cards always belong to exactly that path, whatever the request says.
    List<UUID> pathIds = board.isPathBoard() ? List.of(board.getPathId()) : request.pathIds();
    List<Path> ownedPaths = pathIds == null ? List.of() : paths.findByUserIdAndIdIn(owner, pathIds);
    if (ownedPaths.size() != (pathIds == null ? 0 : pathIds.stream().distinct().count())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Every path must belong to the user");
    List<Label> ownedLabels = request.labelIds() == null ? List.of() : labels.findAllByUserIdAndIdIn(owner, request.labelIds());
    if (ownedLabels.size() != (request.labelIds() == null ? 0 : request.labelIds().stream().distinct().count()) || ownedLabels.stream().anyMatch(l -> !scopes.existsByIdLabelIdAndIdScope(l.getId(), LabelScopeType.BOARD))) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Every label must be a BOARD label owned by the user");
    card.setPaths(ownedPaths); card.setLabels(ownedLabels);
  }

  // New cards land in the requested column, or the first active column when none is given.
  private BoardStatus createTarget(Board board, UUID statusId) {
    if (statusId == null) return statuses.findAllByBoardIdOrderByPosition(board.getId()).stream().filter(x -> !x.isArchived()).findFirst().orElseThrow();
    BoardStatus target = status(board, statusId);
    if (target.isArchived()) throw new ResponseStatusException(HttpStatus.CONFLICT, "Cannot add a card to an archived status");
    return target;
  }
  private void validateDates(CardRequest request) {
    if (request.startDate() != null && request.dueDate() != null && request.dueDate().isBefore(request.startDate())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "dueDate must be on or after startDate");
  }
}
