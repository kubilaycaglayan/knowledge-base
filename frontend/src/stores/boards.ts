import { acceptHMRUpdate, defineStore } from "pinia";
import { api } from "../lib/api";
import { ALL_BOARDS, columnCursor, columnKey } from "../lib/board-merge";

// pathId is set on the board every path owns; only path boards can be hidden and only custom boards pinned.
export type Board = { id: string; name: string; archived: boolean; pathId?: string | null; hidden?: boolean; pinned?: boolean; createdAt: string; updatedAt: string };
export type BoardCardSort = "MANUAL" | "PRIORITY" | "PRIORITY_LAST";
export type BoardStatus = { id: string; boardId?: string; name: string; position: number; archived: boolean; cardSort?: BoardCardSort };
export type BoardCard = { id: string; boardId?: string; statusId: string; title: string; body: string; priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT"; startDate?: string; dueDate?: string; position: number; archived: boolean; pathIds: string[]; labelIds: string[]; createdAt: string; updatedAt: string };
/** A column of the All boards view: every tab board's active status with that name, in tab order. */
export type MergedColumn = { name: string; key: string; cardSort: BoardCardSort; statusIds: string[] };
export type PlacedCard = { card: BoardCard; status: BoardStatus; statusCreated: boolean };
type CardPage = { items: BoardCard[]; nextCursor: number | null };
type ApiColumn = { name: string; cardSort: BoardCardSort; statuses: BoardStatus[] };
type CardInput = Pick<BoardCard, "title" | "body" | "priority"> & { startDate?: string; dueDate?: string; pathIds?: string[]; labelIds?: string[]; expectedUpdatedAt?: string };
type NewCardInput = CardInput & { statusId?: string };
/** A board (or the All boards view) loaded once and kept while the user moves around the app. */
type CachedView = { statuses: BoardStatus[]; cards: BoardCard[]; pageCursors: Record<string, number | null>; columns: MergedColumn[] };

function cardOverlapsWindow(card: BoardCard, from: string, to: string) {
  const start = card.startDate || card.dueDate;
  const end = card.dueDate || card.startDate;
  return Boolean(start && end && start <= to && end >= from);
}
const pageUrl = (boardId: string, statusId: string, cursor: number | string) => `/boards/${boardId}/cards/page?statusId=${statusId}&cursor=${cursor}&limit=20`;
const columnPageUrl = (name: string, cursor: number | string) => `/boards/all/columns/cards/page?name=${encodeURIComponent(name)}&cursor=${cursor}&limit=20`;
const ganttKey = (boardId: string, from: string, to: string) => `${boardId}|${from}|${to}`;

/**
 * Boards, their columns, and their cards. `statuses`, `cards`, and `pageCursors` hold the open
 * view (one board, or every tab board when `selectedId` is ALL_BOARDS). A view is fetched once and
 * then served from `views`; the same card and status objects are shared by every cached view, so a
 * change made in one view shows in all of them.
 */
export const useBoardsStore = defineStore("boards", {
  state: () => ({ boards: [] as Board[], archivedBoards: [] as Board[], statuses: [] as BoardStatus[], cards: [] as BoardCard[], allColumns: [] as MergedColumn[], views: {} as Record<string, CachedView>, viewKey: "", boardsLoaded: false, ganttCache: {} as Record<string, BoardCard[]>, ganttCards: [] as BoardCard[], ganttFrom: "", ganttTo: "", ganttLoadRevision: 0, boardListRevision: 0, moveRevisions: {} as Record<string, number>, cardUpdateRevisions: {} as Record<string, number>, boardMutations: {} as Record<string, boolean>, archivedCards: [] as BoardCard[], pageCursors: {} as Record<string, number | null>, pageLoading: {} as Record<string, boolean>, pageErrors: {} as Record<string, string>, selectedId: "", loading: false, creatingBoard: false, updatingBoard: false, creatingCard: false, error: "", boardLoadRevision: 0 }),
  getters: {
    selected: (state) => state.boards.find((board) => board.id === state.selectedId),
    isAll: (state) => state.selectedId === ALL_BOARDS,
    mergedColumns: (state) => state.allColumns.map((column) => ({ ...column, statuses: column.statusIds.map((id) => state.statuses.find((status) => status.id === id)).filter((status): status is BoardStatus => Boolean(status && !status.archived)) })),
  },
  actions: {
    reset() { this.boardLoadRevision++; this.ganttLoadRevision++; this.boardListRevision++; this.boards = []; this.archivedBoards = []; this.statuses = []; this.cards = []; this.allColumns = []; this.views = {}; this.viewKey = ""; this.boardsLoaded = false; this.ganttCache = {}; this.ganttCards = []; this.ganttFrom = ""; this.ganttTo = ""; this.moveRevisions = {}; this.cardUpdateRevisions = {}; this.boardMutations = {}; this.archivedCards = []; this.pageCursors = {}; this.pageLoading = {}; this.pageErrors = {}; this.selectedId = ""; this.loading = false; this.creatingBoard = false; this.updatingBoard = false; this.creatingCard = false; this.error = ""; },
    // Boards changed outside this page (paths, imports): forget every cached view so the next visit fetches.
    invalidate() { this.boardsLoaded = false; this.views = {}; this.viewKey = ""; this.ganttCache = {}; },
    // The All boards view depends on every board's columns and the tab order.
    forgetAllView() { delete this.views[ALL_BOARDS]; if (this.viewKey !== ALL_BOARDS) this.allColumns = []; Object.keys(this.ganttCache).filter((key) => key.startsWith(`${ALL_BOARDS}|`)).forEach((key) => delete this.ganttCache[key]); },
    boardOf(item: { boardId?: string }) { return item.boardId || (this.isAll ? "" : this.selectedId); },
    // The open view and every other cached view, each with its own arrays.
    eachView(visit: (view: { statuses: BoardStatus[]; cards: BoardCard[]; columns: MergedColumn[] }, key: string) => void) {
      if (this.viewKey) visit({ statuses: this.statuses, cards: this.cards, columns: this.allColumns }, this.viewKey);
      for (const [key, view] of Object.entries(this.views)) if (key !== this.viewKey) visit(view, key);
    },
    knownCards() { const known = new Map<string, BoardCard>(); this.cards.forEach((card) => known.set(card.id, card)); this.eachView((view) => view.cards.forEach((card) => { if (!known.has(card.id)) known.set(card.id, card); })); return [...known.values()]; },
    // Keeps one object per card and per status: a fetched copy updates the object already shown.
    adoptCard(card: BoardCard) { const existing = this.knownCards().find((item) => item.id === card.id); if (!existing) return card; Object.assign(existing, card); return existing; },
    adoptStatus(status: BoardStatus) { let existing: BoardStatus | undefined = this.statuses.find((item) => item.id === status.id); this.eachView((view) => { existing ||= view.statuses.find((item) => item.id === status.id); }); if (!existing) return status; Object.assign(existing, status); return existing; },
    addCard(card: BoardCard, fallbackBoardId?: string) { const boardId = card.boardId || fallbackBoardId || this.selectedId; this.eachView((view, key) => { if ((key === boardId || key === ALL_BOARDS) && !view.cards.some((item) => item.id === card.id)) view.cards.push(card); }); if (!this.viewKey && !this.cards.some((item) => item.id === card.id)) this.cards.push(card); },
    removeCard(id: string, onlyBoard?: string) { if (!onlyBoard || this.viewKey === onlyBoard || !this.viewKey) this.cards = this.cards.filter((item) => item.id !== id); for (const [key, view] of Object.entries(this.views)) if (key !== this.viewKey && (!onlyBoard || key === onlyBoard)) view.cards = view.cards.filter((item) => item.id !== id); },
    addStatus(status: BoardStatus) {
      const shared = this.adoptStatus(status);
      const boardId = status.boardId || this.selectedId;
      this.eachView((view, key) => {
        if (key !== boardId && key !== ALL_BOARDS) return;
        if (!view.statuses.some((item) => item.id === shared.id)) view.statuses.push(shared);
        if (key !== ALL_BOARDS) return;
        const column = view.columns.find((item) => item.key === columnKey(shared.name));
        if (column) { if (!column.statusIds.includes(shared.id)) column.statusIds.push(shared.id); }
        else view.columns.push({ name: shared.name, key: columnKey(shared.name), cardSort: "MANUAL", statusIds: [shared.id] });
      });
      if (!this.viewKey && !this.statuses.some((item) => item.id === shared.id)) this.statuses.push(shared);
      return shared;
    },
    // Renumbers a column's known cards after the server closed the gap a card left.
    closeGap(statusId: string, leavingId: string) { this.knownCards().filter((item) => item.statusId === statusId && item.id !== leavingId && !item.archived).sort((a, b) => a.position - b.position).forEach((item, index) => { item.position = index; }); },
    adoptPlacement(placed: PlacedCard, card: BoardCard) {
      const sourceBoard = this.boardOf(card), sourceStatus = card.statusId;
      const status = placed.statusCreated ? this.addStatus(placed.status) : this.adoptStatus(placed.status);
      if (sourceStatus !== placed.card.statusId) this.closeGap(sourceStatus, card.id);
      const shared = this.adoptCard(placed.card);
      if (shared !== card) Object.assign(card, placed.card);
      const targetBoard = placed.card.boardId || sourceBoard;
      if (targetBoard !== sourceBoard) { this.removeCard(card.id, sourceBoard); this.addCard(card); }
      this.syncGanttCard(card);
      return { card, status, statusCreated: placed.statusCreated };
    },
    async loadBoards(includeArchived = false, force = false) { if (!includeArchived && this.boardsLoaded && !force) return; const revision = ++this.boardListRevision; this.loading = true; this.error = ""; try { const items = await api<Board[]>(`/boards?archived=${includeArchived}`); if (revision !== this.boardListRevision) return; if (includeArchived) this.archivedBoards = items; else { this.boards = items; this.boardsLoaded = true; if (this.selectedId !== ALL_BOARDS && (!this.selectedId || !items.some((b) => b.id === this.selectedId))) this.selectedId = items[0]?.id || ""; } } catch { if (revision === this.boardListRevision) this.error = "Unable to load boards."; } finally { if (revision === this.boardListRevision) this.loading = false; } },
    async createBoard(name: string) { if (this.creatingBoard) return null; this.creatingBoard = true; try { const board = await api<Board>("/boards", { method: "POST", body: JSON.stringify({ name }) }); this.boards.push(board); this.selectedId = board.id; await this.loadBoard(); /* After the switch, which caches the view being left. */ this.forgetAllView(); return board; } finally { this.creatingBoard = false; } },
    async updateBoard(id: string, name: string) { if (this.updatingBoard) return null; this.updatingBoard = true; try { const board = await api<Board>(`/boards/${id}`, { method: "PUT", body: JSON.stringify({ name }) }); const current = this.boards.find((item) => item.id === id); if (current) Object.assign(current, board); const archived = this.archivedBoards.find((item) => item.id === id); if (archived) Object.assign(archived, board); return board; } finally { this.updatingBoard = false; } },
    async archiveBoard(id: string, restore = false) { if (this.boardMutations[id]) return null; this.boardMutations[id] = true; try { const board = await api<Board>(`/boards/${id}/${restore ? "restore" : "archive"}`, { method: "POST" }); const wasSelected = this.selectedId === id; const shouldSelectRestored = restore && !this.selectedId; this.boards = this.boards.filter((item) => item.id !== id); this.archivedBoards = this.archivedBoards.filter((item) => item.id !== id); if (restore) this.boards.unshift(board); delete this.views[id]; this.forgetAllView(); if (wasSelected || shouldSelectRestored) { this.selectedId = restore ? board.id : this.boards[0]?.id || ""; this.statuses = []; this.cards = []; this.ganttCards = []; this.archivedCards = []; await this.loadBoard(); } else if (this.isAll) await this.loadBoard(true); return board; } finally { delete this.boardMutations[id]; } },
    async pinBoard(id: string, pinned: boolean) { const board = await api<Board>(`/boards/${id}/pin`, { method: "POST", body: JSON.stringify({ pinned }) }); await this.loadBoards(false, true); await this.tabOrderChanged(); return board; },
    // ids is one group's full order (pinned or unpinned, path and custom boards alike); other boards keep their slots.
    async reorderBoards(ids: string[]) { const previous = [...this.boards]; const byId = new Map(this.boards.map((board) => [board.id, board])); const queue = ids.map((id) => byId.get(id)).filter((board): board is Board => Boolean(board)); this.boards = this.boards.map((board) => ids.includes(board.id) ? queue.shift() || board : board); try { await api(`/boards/order`, { method: "PUT", body: JSON.stringify({ ids }) }); await this.tabOrderChanged(); } catch (error) { this.boards = previous; throw error; } },
    // Merged columns follow the tab order, so the All boards view is fetched again.
    async tabOrderChanged() { this.forgetAllView(); if (this.isAll) await this.loadBoard(true); },
    async loadBoard(force = false) {
      const key = this.selectedId;
      // Coming back to the page with this view still open needs nothing new.
      if (!force && key && this.viewKey === key) { this.loading = false; return; }
      if (this.viewKey && (this.viewKey !== key || force)) this.views[this.viewKey] = { statuses: this.statuses, cards: this.cards, pageCursors: this.pageCursors, columns: this.allColumns };
      const revision = ++this.boardLoadRevision; this.ganttLoadRevision++; this.archivedCards = []; this.ganttCards = []; this.ganttFrom = ""; this.ganttTo = ""; this.pageLoading = {}; this.pageErrors = {};
      const cached = this.views[key];
      if (cached && !force) { this.statuses = cached.statuses; this.cards = cached.cards; this.pageCursors = cached.pageCursors; this.allColumns = cached.columns; this.viewKey = key; delete this.views[key]; this.loading = false; return; }
      delete this.views[key]; this.viewKey = ""; this.statuses = []; this.cards = []; this.allColumns = []; this.pageCursors = {};
      if (!key) return;
      this.loading = true;
      try {
        if (key === ALL_BOARDS) {
          const columns = await api<ApiColumn[]>("/boards/all/columns");
          if (revision !== this.boardLoadRevision || this.selectedId !== key) return;
          const pages = await Promise.all(columns.map((column) => api<CardPage>(columnPageUrl(column.name, -1))));
          if (revision !== this.boardLoadRevision || this.selectedId !== key) return;
          const statuses = columns.flatMap((column) => column.statuses).map((status) => this.adoptStatus(status));
          const cards = new Map<string, BoardCard>();
          pages.flatMap((page) => page.items).forEach((card) => cards.set(card.id, this.adoptCard(card)));
          this.statuses = statuses; this.cards = [...cards.values()];
          this.allColumns = columns.map((column) => ({ name: column.name, key: columnKey(column.name), cardSort: column.cardSort, statusIds: column.statuses.map((status) => status.id) }));
          this.pageCursors = Object.fromEntries(columns.map((column, index) => [columnCursor(columnKey(column.name)), pages[index].nextCursor]));
        } else {
          const nextStatuses = await api<BoardStatus[]>(`/boards/${key}/statuses`);
          if (revision !== this.boardLoadRevision || this.selectedId !== key) return;
          const active = nextStatuses.filter((status) => !status.archived);
          const pages = await Promise.all(active.map((status) => api<CardPage>(pageUrl(key, status.id, -1))));
          if (revision !== this.boardLoadRevision || this.selectedId !== key) return;
          this.statuses = nextStatuses.map((status) => this.adoptStatus(status));
          this.cards = pages.flatMap((page) => page.items).map((card) => this.adoptCard(card));
          this.pageCursors = Object.fromEntries(active.map((status, index) => [status.id, pages[index].nextCursor]));
        }
        this.viewKey = key;
      } catch { if (revision === this.boardLoadRevision) this.error = "Unable to load this board."; } finally { if (revision === this.boardLoadRevision) this.loading = false; }
    },
    appendCards(items: BoardCard[]) { const known = new Set(this.cards.map((card) => card.id)); this.cards = [...this.cards, ...items.map((card) => this.adoptCard(card)).filter((card) => !known.has(card.id))]; },
    async loadMore(statusId: string) { const cursor = this.pageCursors[statusId]; if (cursor === null || cursor === undefined || this.pageLoading[statusId] || this.pageErrors[statusId]) return; const selected = this.selectedId; const boardId = this.statuses.find((status) => status.id === statusId)?.boardId || selected; const revision = this.boardLoadRevision; this.pageLoading[statusId] = true; try { const page = await api<CardPage>(pageUrl(boardId, statusId, cursor)); if (this.selectedId !== selected || this.boardLoadRevision !== revision) return; this.appendCards(page.items); this.pageCursors[statusId] = page.nextCursor; delete this.pageErrors[statusId]; this.error = ""; } catch (error) { if (this.selectedId !== selected || this.boardLoadRevision !== revision) return; this.pageErrors[statusId] = "Unable to load more cards. Try again."; this.error = this.pageErrors[statusId]; throw error; } finally { this.pageLoading[statusId] = false; } },
    async loadMoreColumn(key: string) { const cursorKey = columnCursor(key); const cursor = this.pageCursors[cursorKey]; const column = this.allColumns.find((item) => item.key === key); if (!column || cursor === null || cursor === undefined || this.pageLoading[cursorKey] || this.pageErrors[cursorKey]) return; const revision = this.boardLoadRevision; this.pageLoading[cursorKey] = true; try { const page = await api<CardPage>(columnPageUrl(column.name, cursor)); if (!this.isAll || this.boardLoadRevision !== revision) return; this.appendCards(page.items); this.pageCursors[cursorKey] = page.nextCursor; delete this.pageErrors[cursorKey]; this.error = ""; } catch (error) { if (!this.isAll || this.boardLoadRevision !== revision) return; this.pageErrors[cursorKey] = "Unable to load more cards. Try again."; this.error = this.pageErrors[cursorKey]; throw error; } finally { this.pageLoading[cursorKey] = false; } },
    // Saving a column's sort reloads that column from its first page, since the server orders its pages.
    async setStatusSort(status: BoardStatus, cardSort: BoardCardSort) { const selected = this.selectedId; const boardId = status.boardId || selected; const revision = this.boardLoadRevision; const saved = await api<BoardStatus>(`/boards/${boardId}/statuses/${status.id}/sort`, { method: "PUT", body: JSON.stringify({ cardSort }) }); if (this.selectedId !== selected || this.boardLoadRevision !== revision) return; status.cardSort = saved.cardSort; const page = await api<CardPage>(pageUrl(boardId, status.id, -1)); if (this.selectedId !== selected || this.boardLoadRevision !== revision) return; this.cards = [...this.cards.filter((card) => card.statusId !== status.id || card.archived), ...page.items.map((card) => this.adoptCard(card))]; this.pageCursors[status.id] = page.nextCursor; delete this.pageErrors[status.id]; },
    // A merged column's sort belongs to the user, not the boards; it reloads that column's first page.
    async setColumnSort(key: string, cardSort: BoardCardSort) { const column = this.allColumns.find((item) => item.key === key); if (!column) return; const revision = this.boardLoadRevision; const saved = await api<{ cardSort: BoardCardSort }>("/boards/all/columns/sort", { method: "PUT", body: JSON.stringify({ name: column.name, cardSort }) }); if (!this.isAll || this.boardLoadRevision !== revision) return; column.cardSort = saved.cardSort; const page = await api<CardPage>(columnPageUrl(column.name, -1)); if (!this.isAll || this.boardLoadRevision !== revision) return; this.cards = [...this.cards.filter((card) => !column.statusIds.includes(card.statusId) || card.archived), ...page.items.map((card) => this.adoptCard(card))]; this.pageCursors[columnCursor(key)] = page.nextCursor; delete this.pageErrors[columnCursor(key)]; },
    async retryLoadMore(statusId: string) { delete this.pageErrors[statusId]; return this.loadMore(statusId); },
    async retryLoadMoreColumn(key: string) { delete this.pageErrors[columnCursor(key)]; return this.loadMoreColumn(key); },
    async loadGantt(from: string, to: string) { const revision = ++this.ganttLoadRevision; const boardId = this.selectedId; if (!boardId) { this.ganttCards = []; return; } const key = ganttKey(boardId, from, to); const cached = this.ganttCache[key]; if (cached) { this.ganttFrom = from; this.ganttTo = to; this.ganttCards = cached; return; } try { const path = boardId === ALL_BOARDS ? "/boards/all/gantt" : `/boards/${boardId}/gantt`; const items = await api<BoardCard[]>(`${path}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`); if (revision !== this.ganttLoadRevision || this.selectedId !== boardId) return; this.ganttFrom = from; this.ganttTo = to; this.ganttCards = items; this.ganttCache[key] = items; this.error = ""; } catch { if (revision === this.ganttLoadRevision && this.selectedId === boardId) { this.ganttCards = []; this.error = "Unable to load the timeline. Try again."; } } },
    async loadArchivedCards() { if (!this.selectedId || this.isAll) return; this.archivedCards = await api<BoardCard[]>(`/boards/${this.selectedId}/cards?archived=true`); },
    // Other cached timelines are dropped; the open one is kept in step.
    syncGanttCard(card: BoardCard) { const openKey = this.ganttFrom && this.ganttTo ? ganttKey(this.selectedId, this.ganttFrom, this.ganttTo) : ""; this.ganttCache = openKey && this.ganttCache[openKey] ? { [openKey]: this.ganttCards } : {}; const index = this.ganttCards.findIndex((item) => item.id === card.id); const visible = Boolean(this.ganttFrom && this.ganttTo && !card.archived && cardOverlapsWindow(card, this.ganttFrom, this.ganttTo)); if (!visible) { if (index >= 0) this.ganttCards.splice(index, 1); return; } if (index >= 0) this.ganttCards[index] = card; else this.ganttCards.push(card); },
    async createCard(input: NewCardInput, boardId?: string) { if (this.creatingCard) return null; this.creatingCard = true; try { const card = await api<BoardCard>(`/boards/${boardId || this.selectedId}/cards`, { method: "POST", body: JSON.stringify(input) }); this.addCard(card, boardId); const shared = this.cards.find((item) => item.id === card.id) || card; this.syncGanttCard(shared); return shared; } finally { this.creatingCard = false; } },
    // Creates a card in the board's column with this name, adding the column when the board has none.
    async createCardInColumn(boardId: string, columnName: string, input: CardInput) { this.creatingCard = true; try { const placed = await api<PlacedCard>(`/boards/${boardId}/cards/in-column`, { method: "POST", body: JSON.stringify({ columnName, ...input }) }); const status = placed.statusCreated ? this.addStatus(placed.status) : this.adoptStatus(placed.status); this.addCard(placed.card); const card = this.knownCards().find((item) => item.id === placed.card.id) || placed.card; this.syncGanttCard(card); return { card, status, statusCreated: placed.statusCreated }; } finally { this.creatingCard = false; } },
    async moveCardToColumn(card: BoardCard, columnName: string, position: number) { const placed = await api<PlacedCard>(`/boards/${this.boardOf(card)}/cards/${card.id}/move-to-column`, { method: "POST", body: JSON.stringify({ columnName, position }) }); return this.adoptPlacement(placed, card); },
    // Moves a card to another board, into its column with the same name.
    async transferCard(card: BoardCard, boardId: string) { const placed = await api<PlacedCard>(`/boards/${this.boardOf(card)}/cards/${card.id}/transfer`, { method: "POST", body: JSON.stringify({ boardId }) }); return this.adoptPlacement(placed, card); },
    async updateCard(card: BoardCard, input: CardInput) { const revision = (this.cardUpdateRevisions[card.id] || 0) + 1; this.cardUpdateRevisions[card.id] = revision; const boardId = this.boardOf(card); try { const saved = await api<BoardCard>(`/boards/${boardId}/cards/${card.id}`, { method: "PUT", body: JSON.stringify({ ...input, expectedUpdatedAt: input.expectedUpdatedAt || card.updatedAt }) }); if (this.cardUpdateRevisions[card.id] !== revision) return card; const shared = this.adoptCard(saved); this.syncGanttCard(shared); return shared; } catch (error) { if (this.cardUpdateRevisions[card.id] !== revision) return card; if (typeof error === "object" && error !== null && "status" in error && (error as { status?: number }).status === 409) { try { const latest = await api<BoardCard>(`/boards/${boardId}/cards/${card.id}`); if (this.cardUpdateRevisions[card.id] === revision) { Object.assign(card, latest); this.adoptCard(latest); this.syncGanttCard(latest); } } catch { /* Preserve the draft and original conflict when refresh also fails. */ } } throw error; } },
    async moveCard(card: BoardCard, statusId: string, position: number) { const destination = this.statuses.find((status) => status.id === statusId); if ((this.statuses.length > 0 && (!destination || destination.archived)) || !Number.isInteger(position) || position < 0) throw new Error("Invalid card destination."); const revision = (this.moveRevisions[card.id] || 0) + 1; this.moveRevisions[card.id] = revision; const known = this.knownCards(); const sourceId = card.statusId; const sourceCards = known.filter((item) => !item.archived && item.statusId === sourceId && item.id !== card.id).sort((a, b) => a.position - b.position); const destinationCards = sourceId === statusId ? sourceCards : known.filter((item) => !item.archived && item.statusId === statusId && item.id !== card.id).sort((a, b) => a.position - b.position); const previous = [...new Set([card, ...sourceCards, ...destinationCards])].map((item) => ({ item, statusId: item.statusId, position: item.position })); const destinationPosition = Math.min(position, destinationCards.length); const nextDestination = [...destinationCards]; nextDestination.splice(destinationPosition, 0, card); card.statusId = statusId; sourceCards.forEach((item, index) => { item.statusId = sourceId; item.position = index; }); nextDestination.forEach((item, index) => { item.statusId = statusId; item.position = index; }); const ganttCards = this.ganttCards.filter((item) => previous.some((snapshot) => snapshot.item.id === item.id)); ganttCards.forEach((item) => { const source = known.find((candidate) => candidate.id === item.id); if (source) { item.statusId = source.statusId; item.position = source.position; } }); try { const saved = await api<BoardCard>(`/boards/${this.boardOf(card)}/cards/${card.id}/move`, { method: "POST", body: JSON.stringify({ statusId, position: destinationPosition }) }); if (this.moveRevisions[card.id] !== revision) return card; Object.assign(card, saved); const timelineCard = this.ganttCards.find((item) => item.id === card.id); if (timelineCard) Object.assign(timelineCard, saved); else this.syncGanttCard(saved); return saved; } catch (error) { if (this.moveRevisions[card.id] !== revision) return card; previous.forEach((snapshot) => { snapshot.item.statusId = snapshot.statusId; snapshot.item.position = snapshot.position; }); ganttCards.forEach((item) => { const snapshot = previous.find((value) => value.item.id === item.id); if (snapshot) { item.statusId = snapshot.statusId; item.position = snapshot.position; } }); throw error; } },
    async archiveCard(card: BoardCard, restore = false) { const saved = await api<BoardCard>(`/boards/${this.boardOf(card) || this.selectedId}/cards/${card.id}/${restore ? "restore" : "archive"}`, { method: "POST" }); if (restore) { this.cards = this.cards.filter((item) => item.id !== card.id); this.cards.push(saved); for (const [key, view] of Object.entries(this.views)) if (key === (saved.boardId || this.selectedId) || key === ALL_BOARDS) delete this.views[key]; this.syncGanttCard(saved); } else { this.removeCard(card.id); this.closeGap(card.statusId, card.id); this.syncGanttCard(saved); } return saved; },
    // Status actions default to the open board; board settings can pass another
    // board's id and its status list without switching the open board. Another
    // board's cached view is dropped, and the All boards view is fetched again.
    async statusesChanged(boardId: string) { if (boardId !== this.viewKey) delete this.views[boardId]; if (this.isAll) await this.loadBoard(true); else this.forgetAllView(); },
    async fetchStatuses(boardId: string) { return api<BoardStatus[]>(`/boards/${boardId}/statuses`); },
    async createStatus(name: string, targetBoardId?: string) { const boardId = targetBoardId ?? this.selectedId; const status = await api<BoardStatus>(`/boards/${boardId}/statuses`, { method: "POST", body: JSON.stringify({ name }) }); if (boardId === this.selectedId) this.statuses.push(status); await this.statusesChanged(boardId); return status; },
    async updateStatus(status: BoardStatus, name: string, targetBoardId?: string) { const boardId = targetBoardId ?? this.selectedId; const saved = await api<BoardStatus>(`/boards/${boardId}/statuses/${status.id}`, { method: "PUT", body: JSON.stringify({ name }) }); Object.assign(status, saved); this.adoptStatus(saved); await this.statusesChanged(boardId); return saved; },
    async reorderStatuses(ids: string[], targetBoardId?: string, knownStatuses?: BoardStatus[]) { const boardId = targetBoardId ?? this.selectedId; const allStatuses = knownStatuses ?? this.statuses; const activeIds = [...ids]; const normalizedIds = ids.length === allStatuses.length ? ids : allStatuses.map((status) => status.archived ? status.id : activeIds.shift()!).filter(Boolean); const saved = await api<BoardStatus[]>(`/boards/${boardId}/statuses/order`, { method: "PUT", body: JSON.stringify({ ids: normalizedIds }) }); if (boardId === this.selectedId) this.statuses = saved.map((status) => this.adoptStatus(status)); await this.statusesChanged(boardId); return saved; },
    async archiveStatus(status: BoardStatus, restore = false, targetBoardId?: string) { const boardId = targetBoardId ?? this.selectedId; await api(`/boards/${boardId}/statuses/${status.id}/${restore ? "restore" : "archive"}`, { method: "POST" }); status.archived = !restore; if (boardId === this.selectedId) await this.loadBoard(true); await this.statusesChanged(boardId); },
  },
});

// Keep the live store in step with edited actions during development.
if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(useBoardsStore, import.meta.hot));
