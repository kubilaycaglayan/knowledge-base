package com.know.service;

import com.know.domain.*;
import java.util.*;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Owns board lifecycle rules shared by the board and path APIs: default statuses, the one board
 * every path owns, the tab order, and moving a merged path's cards.
 */
@Service
public class BoardService {
  static final List<String> DEFAULT_STATUSES = List.of("Backlog", "Pending", "In Progress", "Done");

  private final BoardRepository boards;
  private final BoardStatusRepository statuses;
  private final BoardCardRepository cards;
  private final PathRepository paths;

  public BoardService(BoardRepository boards, BoardStatusRepository statuses, BoardCardRepository cards, PathRepository paths) {
    this.boards = boards;
    this.statuses = statuses;
    this.cards = cards;
    this.paths = paths;
  }

  @Transactional
  public Board create(UUID userId, String name) {
    return seed(boards.save(new Board(userId, name)));
  }

  /**
   * Returns the path's board, creating it with the default statuses on first use. A board archived
   * by a merge comes back when its path is restored.
   */
  @Transactional
  public Board createForPath(Path path) {
    Optional<Board> existing = boards.findByPathId(path.getId());
    if (existing.isEmpty()) return seed(boards.save(Board.forPath(path)));
    Board board = existing.get();
    if (board.isArchived()) {
      board.restore();
      boards.save(board);
    }
    return board;
  }

  @Transactional
  public void renameForPath(Path path) {
    boards.findByPathId(path.getId()).ifPresent(board -> {
      board.rename(Board.boardName(path));
      boards.save(board);
    });
  }

  /**
   * Active boards in tab order: pinned boards, then the rest. Within each group path and custom
   * boards share one manual order; boards never placed by hand follow, path boards in Paths page
   * order and then custom boards in creation order. Path boards only appear while their path is
   * active.
   */
  @Transactional(readOnly = true)
  public List<Board> tabs(UUID userId, boolean includeHidden) {
    List<Board> active = boards.findAllByUserIdOrderByUpdatedAtDesc(userId).stream().filter(board -> !board.isArchived()).toList();
    Map<UUID, Integer> pathRank = new HashMap<>();
    List<Path> ordered = paths.findAllByUserIdOrderByUpdatedAtDesc(userId, PageRequest.of(0, 10_000));
    for (Path path : ordered) if (path.getStatus() == PathStatus.ACTIVE) pathRank.put(path.getId(), pathRank.size());

    List<Board> visible = active.stream()
        .filter(board -> !board.isPathBoard() || (pathRank.containsKey(board.getPathId()) && (includeHidden || !board.isHidden())))
        .toList();
    List<Board> result = new ArrayList<>(inTabOrder(visible.stream().filter(Board::isPinned).toList(), pathRank));
    result.addAll(inTabOrder(visible.stream().filter(board -> !board.isPinned()).toList(), pathRank));
    return result;
  }

  private static List<Board> inTabOrder(List<Board> group, Map<UUID, Integer> pathRank) {
    Comparator<Board> manual = Comparator.comparing(Board::getSortOrder, Comparator.nullsLast(Comparator.<Long>naturalOrder()));
    Comparator<Board> pathBoardsFirst = Comparator.comparing(board -> board.isPathBoard() ? 0 : 1);
    Comparator<Board> unplaced = pathBoardsFirst
        .thenComparing(board -> board.isPathBoard() ? pathRank.get(board.getPathId()) : 0)
        .thenComparing(Board::getCreatedAt);
    // Until a path board has been placed by hand, keep the earlier layout: path boards (Paths page
    // order) ahead of the custom boards, whose manual order only ranked them among themselves.
    boolean pathBoardPlaced = group.stream().anyMatch(board -> board.isPathBoard() && board.getSortOrder() != null);
    return group.stream().sorted(pathBoardPlaced ? manual.thenComparing(unplaced) : pathBoardsFirst.thenComparing(manual).thenComparing(unplaced)).toList();
  }

  /**
   * Moves every card on the source path's board to the target path's board, matching statuses by
   * name and falling back to the first active status, then archives the source board.
   */
  @Transactional
  public void mergePathBoards(Path source, Path target) {
    Optional<Board> sourceBoard = boards.findByPathId(source.getId());
    if (sourceBoard.isEmpty()) return;
    Board from = sourceBoard.get();
    Board to = createForPath(target);

    List<BoardStatus> targetStatuses = statuses.findAllByBoardIdOrderByPosition(to.getId()).stream().filter(status -> !status.isArchived()).toList();
    Map<String, BoardStatus> byName = new HashMap<>();
    for (BoardStatus status : targetStatuses) byName.putIfAbsent(key(status.getName()), status);
    Map<UUID, String> sourceNames = new HashMap<>();
    List<UUID> sourceOrder = new ArrayList<>();
    for (BoardStatus status : statuses.findAllByBoardIdOrderByPosition(from.getId())) {
      sourceNames.put(status.getId(), key(status.getName()));
      sourceOrder.add(status.getId());
    }

    Map<UUID, Integer> nextPosition = new HashMap<>();
    for (BoardStatus status : targetStatuses)
      nextPosition.put(status.getId(), cards.findAllByBoardIdAndStatusIdAndArchivedAtIsNullOrderByPositionAsc(to.getId(), status.getId()).size());

    List<BoardCard> moving = new ArrayList<>(cards.findAllByBoardIdAndArchivedAtIsNullOrderByStatusIdAscPositionAsc(from.getId()));
    moving.sort(Comparator.comparing((BoardCard card) -> sourceOrder.indexOf(card.getStatusId())).thenComparing(BoardCard::getPosition));
    moving.addAll(cards.findAllByBoardIdAndArchivedAtNotNullOrderByUpdatedAtDesc(from.getId()));
    for (BoardCard card : moving) {
      BoardStatus destination = byName.getOrDefault(sourceNames.get(card.getStatusId()), targetStatuses.get(0));
      int position = nextPosition.merge(destination.getId(), 1, Integer::sum) - 1;
      card.moveToBoard(to.getId(), destination.getId(), position);
      card.setPaths(List.of(target));
    }
    cards.saveAll(moving);
    from.archive();
    boards.save(from);
  }

  /** The name columns merge by: trimmed and case-insensitive. */
  public static String key(String name) {
    return name.trim().toLowerCase(Locale.ROOT);
  }

  /** A column a card was placed in, and whether placing it created that column. */
  public record Placement(BoardStatus status, boolean created) {}

  /**
   * The board's first active column with this name (trimmed, case-insensitive), or a new column
   * added after the board's existing ones.
   */
  @Transactional
  public Placement findOrCreateStatus(Board board, String name) {
    List<BoardStatus> all = statuses.findAllByBoardIdOrderByPosition(board.getId());
    String wanted = key(name);
    Optional<BoardStatus> existing = all.stream().filter(status -> !status.isArchived() && key(status.getName()).equals(wanted)).findFirst();
    if (existing.isPresent()) return new Placement(existing.get(), false);
    return new Placement(statuses.save(new BoardStatus(board.getId(), name.trim(), all.size())), true);
  }

  /**
   * Moves a card to a position in one of its board's columns, renumbering the source and the
   * destination columns.
   */
  @Transactional
  public BoardCard move(Board board, BoardCard card, BoardStatus target, int position) {
    UUID sourceId = card.getStatusId();
    List<BoardCard> destination = new ArrayList<>(cards.findAllByBoardIdAndStatusIdAndArchivedAtIsNullOrderByPositionAsc(board.getId(), target.getId()));
    List<BoardCard> source = sourceId.equals(target.getId()) ? destination : new ArrayList<>(cards.findAllByBoardIdAndStatusIdAndArchivedAtIsNullOrderByPositionAsc(board.getId(), sourceId));
    source.removeIf(item -> item.getId().equals(card.getId()));
    if (!sourceId.equals(target.getId())) destination.removeIf(item -> item.getId().equals(card.getId()));
    destination.add(Math.min(position, destination.size()), card);
    for (int i = 0; i < source.size(); i++) source.get(i).move(sourceId, i);
    for (int i = 0; i < destination.size(); i++) destination.get(i).move(target.getId(), i);
    Map<UUID, BoardCard> changed = new LinkedHashMap<>();
    source.forEach(item -> changed.put(item.getId(), item));
    destination.forEach(item -> changed.put(item.getId(), item));
    cards.saveAll(changed.values());
    return card;
  }

  /**
   * Moves a card to the end of the same-named column on another board, creating that column when
   * needed. A path board's cards belong to its path; a card leaving a path board keeps its paths.
   */
  @Transactional
  public Placement transfer(Board from, BoardCard card, Board to) {
    BoardStatus current = statuses.findByIdAndBoardId(card.getStatusId(), from.getId()).orElseThrow();
    Placement placement = findOrCreateStatus(to, current.getName());
    if (from.getId().equals(to.getId())) return placement;
    List<BoardCard> left = new ArrayList<>(cards.findAllByBoardIdAndStatusIdAndArchivedAtIsNullOrderByPositionAsc(from.getId(), current.getId()));
    left.removeIf(item -> item.getId().equals(card.getId()));
    for (int i = 0; i < left.size(); i++) left.get(i).move(current.getId(), i);
    int end = cards.findAllByBoardIdAndStatusIdAndArchivedAtIsNullOrderByPositionAsc(to.getId(), placement.status().getId()).size();
    card.moveToBoard(to.getId(), placement.status().getId(), end);
    if (to.isPathBoard()) paths.findById(to.getPathId()).ifPresent(path -> card.setPaths(List.of(path)));
    cards.saveAll(left);
    cards.save(card);
    return placement;
  }

  private Board seed(Board board) {
    for (int i = 0; i < DEFAULT_STATUSES.size(); i++) statuses.save(new BoardStatus(board.getId(), DEFAULT_STATUSES.get(i), i));
    return board;
  }
}
