package com.know.service;

import com.know.domain.*;
import java.time.LocalDate;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The All boards view: every tab board's active columns merged by name, their cards mixed into one
 * order per merged column, and the user's sort for each merged column. The boards themselves stay
 * untouched; changing a card still goes through its own board.
 */
@Service
public class AllBoardsService {
  private static final List<BoardPriority> URGENT_FIRST = List.of(BoardPriority.URGENT, BoardPriority.HIGH, BoardPriority.MEDIUM, BoardPriority.LOW);

  private final BoardService boardService;
  private final BoardStatusRepository statuses;
  private final BoardCardRepository cards;
  private final BoardColumnSortRepository sorts;

  public AllBoardsService(BoardService boardService, BoardStatusRepository statuses, BoardCardRepository cards, BoardColumnSortRepository sorts) {
    this.boardService = boardService;
    this.statuses = statuses;
    this.cards = cards;
    this.sorts = sorts;
  }

  /** A merged column: the first-seen name, the user's sort, and its statuses in tab order. */
  public record Column(String name, BoardCardSort cardSort, List<BoardStatus> statuses) {}

  public record Page(List<BoardCard> items, Integer nextCursor) {}

  /** Merged columns in the order their names first appear across the tabs. */
  @Transactional(readOnly = true)
  public List<Column> columns(UUID userId) {
    Map<String, BoardCardSort> sorted = new HashMap<>();
    sorts.findAllByUserId(userId).forEach(sort -> sorted.put(sort.getColumnKey(), sort.getCardSort()));
    Map<String, String> names = new LinkedHashMap<>();
    Map<String, List<BoardStatus>> members = new HashMap<>();
    for (Board board : boardService.tabs(userId, false))
      for (BoardStatus status : statuses.findAllByBoardIdOrderByPosition(board.getId())) {
        if (status.isArchived()) continue;
        String key = BoardService.key(status.getName());
        names.putIfAbsent(key, status.getName());
        members.computeIfAbsent(key, ignored -> new ArrayList<>()).add(status);
      }
    return names.entrySet().stream()
        .map(entry -> new Column(entry.getValue(), sorted.getOrDefault(entry.getKey(), BoardCardSort.MANUAL), members.get(entry.getKey())))
        .toList();
  }

  /**
   * One page of a merged column. Cards from different boards mix: by manual position with tab order
   * breaking ties, or by priority first with that order breaking ties. The cursor is the index of
   * the last card returned.
   */
  @Transactional(readOnly = true)
  public Page columnPage(UUID userId, String name, int cursor, int limit) {
    String key = BoardService.key(name);
    Optional<Column> column = columns(userId).stream().filter(item -> BoardService.key(item.name()).equals(key)).findFirst();
    if (column.isEmpty()) return new Page(List.of(), null);
    Map<UUID, Integer> statusRank = new HashMap<>();
    List<BoardStatus> members = column.get().statuses();
    for (int i = 0; i < members.size(); i++) statusRank.put(members.get(i).getId(), i);
    List<BoardCard> ordered = new ArrayList<>(cards.findAllByStatusIdInAndArchivedAtIsNull(statusRank.keySet()));
    ordered.sort(order(column.get().cardSort(), statusRank));
    int from = Math.min(cursor + 1, ordered.size());
    int to = Math.min(from + limit, ordered.size());
    return new Page(ordered.subList(from, to), to < ordered.size() ? to - 1 : null);
  }

  /** Stores the user's sort for a merged column; MANUAL, the default, removes the stored sort. */
  @Transactional
  public BoardCardSort sortColumn(UUID userId, String name, BoardCardSort cardSort) {
    BoardColumnSort.Key id = new BoardColumnSort.Key(userId, BoardService.key(name));
    if (cardSort == BoardCardSort.MANUAL) {
      sorts.deleteById(id);
      return cardSort;
    }
    BoardColumnSort stored = sorts.findById(id).orElseGet(() -> new BoardColumnSort(userId, BoardService.key(name), cardSort));
    stored.sortBy(cardSort);
    sorts.save(stored);
    return cardSort;
  }

  /** Dated active cards of every tab board overlapping the window, by start date then tab order. */
  @Transactional(readOnly = true)
  public List<BoardCard> gantt(UUID userId, LocalDate from, LocalDate to) {
    List<BoardCard> result = new ArrayList<>();
    for (Board board : boardService.tabs(userId, false)) result.addAll(cards.findGanttCards(board.getId(), from, to));
    List<BoardCard> byTab = List.copyOf(result);
    result.sort(Comparator.comparing((BoardCard card) -> card.getStartDate() != null ? card.getStartDate() : card.getDueDate()).thenComparing(byTab::indexOf));
    return result;
  }

  private static Comparator<BoardCard> order(BoardCardSort sort, Map<UUID, Integer> statusRank) {
    Comparator<BoardCard> mixed = Comparator.comparingInt(BoardCard::getPosition)
        .thenComparing(card -> statusRank.get(card.getStatusId()))
        .thenComparing(BoardCard::getId);
    return switch (sort) {
      case PRIORITY -> Comparator.<BoardCard>comparingInt(card -> URGENT_FIRST.indexOf(card.getPriority())).thenComparing(mixed);
      case PRIORITY_LAST -> Comparator.<BoardCard>comparingInt(card -> -URGENT_FIRST.indexOf(card.getPriority())).thenComparing(mixed);
      case MANUAL -> mixed;
    };
  }
}
