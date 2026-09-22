package com.know.api;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.know.domain.*;
import java.time.LocalDate;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(BoardController.class)
@Import(com.know.security.SecurityConfig.class)
@TestPropertySource(properties = {"app.jwt-secret=board-api-test-secret-with-at-least-32-characters", "app.cors-origins=http://localhost"})
class BoardControllerApiTest {
  @Autowired MockMvc mvc;
  @MockBean BoardRepository boards;
  @MockBean BoardStatusRepository statuses;
  @MockBean BoardCardRepository cards;
  @MockBean PathRepository paths;
  @MockBean LabelRepository labels;
  @MockBean LabelScopeRepository scopes;
  @MockBean PasswordEncoder encoder;

  private final UUID owner = UUID.randomUUID();
  private UsernamePasswordAuthenticationToken auth() { return new UsernamePasswordAuthenticationToken(owner.toString(), null, List.of()); }

  @Test void unauthenticatedBoardReadIsRejected() throws Exception {
    mvc.perform(get("/api/v1/boards")).andExpect(status().isUnauthorized());
  }

  @Test void createBoardSeedsTheFourOrderedStatuses() throws Exception {
    when(boards.save(any(Board.class))).thenAnswer(invocation -> invocation.getArgument(0));
    when(statuses.save(any(BoardStatus.class))).thenAnswer(invocation -> invocation.getArgument(0));
    mvc.perform(post("/api/v1/boards").with(authentication(auth())).contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"  Product  \"}"))
        .andExpect(status().isCreated()).andExpect(jsonPath("$.name").value("Product"));
    verify(statuses, times(4)).save(any(BoardStatus.class));
    verify(statuses).save(argThat(status -> status.getName().equals("Backlog") && status.getPosition() == 0));
    verify(statuses).save(argThat(status -> status.getName().equals("Done") && status.getPosition() == 3));
  }

  @Test void foreignBoardIsNotObservable() throws Exception {
    UUID boardId = UUID.randomUUID();
    when(boards.findByIdAndUserId(boardId, owner)).thenReturn(Optional.empty());
    mvc.perform(get("/api/v1/boards/" + boardId).with(authentication(auth()))).andExpect(status().isNotFound());
  }

  @Test void archivedBoardRejectsMutationsButRemainsReadable() throws Exception {
    Board board = new Board(owner, "Archived");
    board.archive();
    UUID boardId = board.getId();
    when(boards.findByIdAndUserId(boardId, owner)).thenReturn(Optional.of(board));
    mvc.perform(get("/api/v1/boards/" + boardId).with(authentication(auth()))).andExpect(status().isOk()).andExpect(jsonPath("$.archived").value(true));
    mvc.perform(post("/api/v1/boards/" + boardId + "/cards").with(authentication(auth())).contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"blocked\"}"))
        .andExpect(status().isConflict());
    verifyNoInteractions(statuses, cards);
  }

  @Test void finalActiveStatusCannotBeArchived() throws Exception {
    Board board = new Board(owner, "Board");
    UUID boardId = board.getId(), statusId = UUID.randomUUID();
    BoardStatus status = new BoardStatus(boardId, "Only", 0);
    when(boards.findByIdAndUserId(boardId, owner)).thenReturn(Optional.of(board));
    when(statuses.findByIdAndBoardId(statusId, boardId)).thenReturn(Optional.of(status));
    when(statuses.findAllByBoardIdOrderByPosition(boardId)).thenReturn(List.of(status));
    mvc.perform(post("/api/v1/boards/" + boardId + "/statuses/" + statusId + "/archive").with(authentication(auth())))
        .andExpect(status().isConflict());
    verify(statuses, never()).save(any(BoardStatus.class));
  }

  @Test void restoringCardFallsBackWhenItsStatusWasArchived() throws Exception {
    Board board = new Board(owner, "Board");
    UUID boardId = board.getId(), archivedStatusId = UUID.randomUUID(), activeStatusId = UUID.randomUUID(), cardId = UUID.randomUUID();
    BoardStatus archived = new BoardStatus(boardId, "Archived status", 0);
    archived.archive();
    BoardStatus active = new BoardStatus(boardId, "Backlog", 1);
    BoardCard card = new BoardCard(boardId, archivedStatusId, 0);
    card.archive();
    when(boards.findByIdAndUserId(boardId, owner)).thenReturn(Optional.of(board));
    cardId = card.getId();
    when(cards.findByIdAndBoardId(cardId, boardId)).thenReturn(Optional.of(card));
    when(statuses.findByIdAndBoardId(archivedStatusId, boardId)).thenReturn(Optional.of(archived));
    when(statuses.findAllByBoardIdOrderByPosition(boardId)).thenReturn(List.of(archived, active));
    when(cards.findAllByBoardIdAndStatusIdAndArchivedAtIsNullOrderByPositionAsc(boardId, active.getId())).thenReturn(List.of());
    when(cards.save(card)).thenReturn(card);
    mvc.perform(post("/api/v1/boards/" + boardId + "/cards/" + cardId + "/restore").with(authentication(auth())))
        .andExpect(status().isOk());
    assertEquals(active.getId(), card.getStatusId());
    assertEquals(false, card.isArchived());
  }

  @Test void invalidCardDateRangeIsRejectedBeforePersistence() throws Exception {
    Board board = new Board(owner, "Board");
    UUID boardId = board.getId();
    when(boards.findByIdAndUserId(boardId, owner)).thenReturn(Optional.of(board));
    mvc.perform(post("/api/v1/boards/" + boardId + "/cards").with(authentication(auth())).contentType(MediaType.APPLICATION_JSON)
        .content("{\"title\":\"bad\",\"startDate\":\"2026-04-10\",\"dueDate\":\"2026-04-01\"}"))
        .andExpect(status().isBadRequest());
    verifyNoInteractions(cards);
  }

  @Test void cardRejectsMoreThanOnePath() throws Exception {
    Board board = new Board(owner, "Board");
    UUID boardId = board.getId(), statusId = UUID.randomUUID(), firstPath = UUID.randomUUID(), secondPath = UUID.randomUUID();
    BoardStatus status = new BoardStatus(boardId, "Backlog", 0);
    when(boards.findByIdAndUserId(boardId, owner)).thenReturn(Optional.of(board));
    when(statuses.findAllByBoardIdOrderByPosition(boardId)).thenReturn(List.of(status));
    when(paths.findByUserIdAndIdIn(owner, List.of(firstPath, secondPath))).thenReturn(List.of(
        Path.imported(firstPath, owner, "One", null, "#111111", PathStatus.ACTIVE, null, null),
        Path.imported(secondPath, owner, "Two", null, "#222222", PathStatus.ACTIVE, null, null)));
    when(scopes.existsByIdLabelIdAndIdScope(any(), eq(LabelScopeType.BOARD))).thenReturn(true);
    mvc.perform(post("/api/v1/boards/" + boardId + "/cards").with(authentication(auth())).contentType(MediaType.APPLICATION_JSON)
        .content("{\"title\":\"single path\",\"pathIds\":[\"" + firstPath + "\",\"" + secondPath + "\"]}"))
        .andExpect(status().isBadRequest());
    verify(cards, never()).save(any(BoardCard.class));
  }

  @Test void ganttAcceptsSingleDayAndOpenEndedCardsThatOverlapTheWindow() throws Exception {
    Board board = new Board(owner, "Board");
    UUID boardId = board.getId();
    BoardCard oneDay = new BoardCard(boardId, UUID.randomUUID(), 0);
    oneDay.update("One day", "{}", BoardPriority.HIGH, LocalDate.of(2026, 4, 5), LocalDate.of(2026, 4, 5));
    BoardCard openEnd = new BoardCard(boardId, UUID.randomUUID(), 1);
    openEnd.update("Open end", "{}", BoardPriority.MEDIUM, LocalDate.of(2026, 4, 1), null);
    when(boards.findByIdAndUserId(boardId, owner)).thenReturn(Optional.of(board));
    when(cards.findGanttCards(boardId, LocalDate.of(2026, 4, 5), LocalDate.of(2026, 4, 5))).thenReturn(List.of(oneDay, openEnd));
    mvc.perform(get("/api/v1/boards/" + boardId + "/gantt?from=2026-04-05&to=2026-04-05").with(authentication(auth())))
        .andExpect(status().isOk()).andExpect(jsonPath("$[0].title").value("One day"));
    verify(cards).findGanttCards(boardId, LocalDate.of(2026, 4, 5), LocalDate.of(2026, 4, 5));
  }

  @Test void ganttRejectsReversedDateWindows() throws Exception {
    Board board = new Board(owner, "Board");
    UUID boardId = board.getId();
    when(boards.findByIdAndUserId(boardId, owner)).thenReturn(Optional.of(board));
    mvc.perform(get("/api/v1/boards/" + boardId + "/gantt?from=2026-04-10&to=2026-04-01").with(authentication(auth())))
        .andExpect(status().isBadRequest());
    verifyNoInteractions(cards);
  }

  @Test void cardPagesUseTwentyAsTheSafeDefaultAndReturnAStableCursor() throws Exception {
    Board board = new Board(owner, "Board");
    UUID boardId = board.getId(), statusId = UUID.randomUUID();
    BoardStatus status = new BoardStatus(boardId, "Backlog", 0);
    when(boards.findByIdAndUserId(boardId, owner)).thenReturn(Optional.of(board));
    when(statuses.findByIdAndBoardId(statusId, boardId)).thenReturn(Optional.of(status));
    List<BoardCard> page = new ArrayList<>();
    for (int i = 0; i < 21; i++) page.add(new BoardCard(boardId, statusId, i));
    when(cards.findAllByBoardIdAndStatusIdAndArchivedAtIsNullAndPositionGreaterThanOrderByPositionAsc(eq(boardId), eq(statusId), eq(-1), any())).thenReturn(page);
    mvc.perform(get("/api/v1/boards/" + boardId + "/cards/page?statusId=" + statusId).with(authentication(auth())))
        .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(20)).andExpect(jsonPath("$.nextCursor").value(19));
  }
}
