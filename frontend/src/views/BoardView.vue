<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { EditorContent } from "@tiptap/vue-3";
import { Editor } from "@tiptap/core";
import { RICH_TEXT_CLASS, richTextEditorProps, richTextExtensions } from "../lib/rich-text";
import { BOARD_PRIORITIES } from "../lib/board-priority";
import { ALL_BOARDS, columnCursor, compareCards, dropPosition, nextSort } from "../lib/board-merge";
import { formatCardDates } from "../lib/card-dates";
import { fitTabs } from "../lib/fit-tabs";
import TimerRunButton from "../components/TimerRunButton.vue";
import { useTimerStore } from "../stores/timer";
import { useNoticesStore } from "../stores/notices";
import { usePreferencesStore } from "../stores/preferences";
import { useBoardsStore, type Board, type BoardCard, type BoardCardSort, type BoardStatus, type MergedColumn } from "../stores/boards";
import { usePathsStore } from "../stores/paths";
import { useLabelsStore } from "../stores/labels";
import { addCalendarDays, barPosition, timelineDays } from "../lib/board-gantt";
import { ApiError } from "../lib/api";
import { vDialogFocus } from "../lib/dialog-focus";
import { vBackdropClose } from "../lib/backdrop-close";
import { VueDatePicker } from "@vuepic/vue-datepicker";
import "@vuepic/vue-datepicker/dist/main.css";
import { format, parseISO } from "date-fns";
import { theme } from "../lib/theme";
import { mdiArchiveOutline, mdiArrowCollapseHorizontal, mdiArrowExpandHorizontal, mdiArrowLeft, mdiCheck, mdiChevronDown, mdiClose, mdiDragVertical, mdiCogOutline, mdiAllInclusive, mdiPin, mdiPinOutline, mdiPlus, mdiSort, mdiSortAscending, mdiSortDescending, mdiTrashCanOutline } from "@mdi/js";

const store = useBoardsStore();
const pathsStore = usePathsStore();
const labelsStore = useLabelsStore();
const { boards, statuses, cards, ganttCards, loading } = storeToRefs(store);
const route = useRoute(); const router = useRouter();
const view = computed(() => route.query.view === "gantt" ? "gantt" : "kanban");
const archiveConfirmOpen = ref(false), archiveCardConfirm = ref<BoardCard | null>(null), archiveStatusConfirm = ref<BoardStatus | null>(null), archivingStatusId = ref(""), newBoardOpen = ref(false), newBoardError = ref(""), newBoard = ref(""), newStatus = ref(""), error = ref("");
// Action results go to the app snackbar; the inline banner keeps load failures
// (and the timeline's date check) that need a lasting way to recover.
const notices = useNoticesStore();
function dismissError() { error.value = ""; store.error = ""; notices.dismiss(); }
const editing = ref<BoardCard | null>(null), lastFocusedCardId = ref(""), lastFocusedCard = shallowRef<HTMLElement | null>(null), saveState = ref<"" | "saving" | "saved" | "error">(""), saveError = ref(""), cardDateError = ref(""), savedSnapshot = ref(""), closeAnyway = ref(false), draft = ref({ title: "", body: "{}", priority: "MEDIUM" as BoardCard["priority"], startDate: "", dueDate: "", pathIds: [] as string[], labelIds: [] as string[] });
const cardEditor = shallowRef<Editor | null>(null);
// Card edits save themselves: changes are debounced into a serial queue so
// each save carries the updatedAt returned by the previous one.
const AUTOSAVE_DELAY_MS = 600;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let saveChain: Promise<void> = Promise.resolve();
// A path board's cards all belong to its path, so the path picker is hidden and the path colour is the accent.
// In the All boards view every card follows its own board.
const selectedBoard = computed(() => boards.value.find((board) => board.id === store.selectedId));
const isAll = computed(() => store.selectedId === ALL_BOARDS);
const cardBoardId = (card: BoardCard) => card.boardId || (isAll.value ? "" : store.selectedId);
const cardBoard = (card: BoardCard) => boards.value.find((board) => board.id === cardBoardId(card));
const editingBoard = computed(() => editing.value ? cardBoard(editing.value) : undefined);
const pathColor = (pathId?: string | null) => (pathId && pathsStore.byId(pathId)?.color) || undefined;
const draftAccent = computed(() => editingBoard.value?.pathId ? undefined : pathsStore.activePaths.find((path) => draft.value.pathIds.includes(path.id))?.color || undefined);
const draftDates = computed(() => draft.value.startDate ? [parseISO(draft.value.startDate), ...(draft.value.dueDate ? [parseISO(draft.value.dueDate)] : [])] : null);
const dateFormats = { input: (value: Date[] | null) => value?.[0] ? formatCardDates(format(value[0], "yyyy-MM-dd"), format(value[1] || value[0], "yyyy-MM-dd")) : "" };
const settingsOpen = ref(false), settingsName = ref(""), settingsBoardId = ref(""), otherBoardStatuses = ref<BoardStatus[]>([]);
// Settings can edit any board without opening it: the open board uses the
// store's statuses, any other board a list fetched for the dialog.
const settingsBoard = computed(() => boards.value.find((board) => board.id === settingsBoardId.value));
const settingsForOpenBoard = computed(() => settingsBoardId.value === store.selectedId);
const settingsAllStatuses = computed(() => settingsForOpenBoard.value ? statuses.value : otherBoardStatuses.value);
const settingsActiveStatuses = computed(() => settingsAllStatuses.value.filter((status) => !status.archived));
const statusDragId = ref(""), statusDragOrder = ref<string[] | null>(null), settingsStatusList = ref<HTMLElement | null>(null);
// While a status is dragged the dialog previews the new order; it is saved on release.
const settingsStatuses = computed(() => statusDragOrder.value ? statusDragOrder.value.map((id) => settingsActiveStatuses.value.find((status) => status.id === id)).filter((status): status is BoardStatus => Boolean(status)) : settingsActiveStatuses.value);
const pageObservers = new Map<string, IntersectionObserver>();
// The Kanban can break out of the page's max width. The preference is a
// per-browser convenience, and the viewport width is measured so the
// breakout never adds a horizontal scrollbar.
const preferences = usePreferencesStore(), kanbanWide = computed(() => preferences.kanbanWide), viewportWidth = ref(0), contentLeft = ref(0), boardPage = ref<HTMLElement | null>(null);

function toggleKanbanWide() { measureViewport(); void preferences.setKanbanWide(!kanbanWide.value); }
// Columns share the tallest column's height but never run past the visible
// viewport (which shrinks for an on-screen keyboard or a showing address bar)
// or under the floating tracker; each column scrolls its own cards.
const KANBAN_BOTTOM_RESERVE = 88, KANBAN_MIN_HEIGHT = 240;
const kanbanEl = ref<HTMLElement | null>(null), kanbanMaxHeight = ref(0);
function measureKanbanHeight() { const kanban = kanbanEl.value; if (!kanban) return; const viewport = window.visualViewport?.height || window.innerHeight; const top = kanban.getBoundingClientRect().top + window.scrollY; kanbanMaxHeight.value = Math.max(KANBAN_MIN_HEIGHT, Math.floor(viewport - top - KANBAN_BOTTOM_RESERVE)); }
const kanbanResize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => measureKanbanHeight());
watch(kanbanEl, (kanban) => { kanbanResize?.disconnect(); if (kanban) { if (boardPage.value) kanbanResize?.observe(boardPage.value); void nextTick(measureKanbanHeight); } });
function measureViewport() { measureKanbanHeight(); viewportWidth.value = document.documentElement.clientWidth; const page = boardPage.value; if (page) contentLeft.value = page.getBoundingClientRect().left + parseFloat(getComputedStyle(page).paddingLeft || "0"); }
const today = new Date().toISOString().slice(0, 10);
const ganttFrom = ref(typeof route.query.from === "string" ? route.query.from : today);
const ganttTo = ref(typeof route.query.to === "string" ? route.query.to : addCalendarDays(ganttFrom.value, 13));
const visibleDays = computed(() => timelineDays(ganttFrom.value, ganttTo.value));
const timelineWidth = computed(() => Math.max(100, visibleDays.value.length * 56));
const isWeekend = (value: string) => [0, 6].includes(new Date(`${value}T00:00:00Z`).getUTCDay());
const activeStatuses = computed(() => statuses.value.filter((status) => !status.archived));
// The All boards view shows every tab board's columns merged by name; each merged column keeps its own sort.
const mergedColumns = computed(() => store.mergedColumns);
const mergedColumnOf = (statusId: string) => mergedColumns.value.find((column) => column.statusIds.includes(statusId));
const sortOf = (statusId: string): BoardCardSort => (isAll.value ? mergedColumnOf(statusId)?.cardSort : store.statuses.find((status) => status.id === statusId)?.cardSort) || "MANUAL";
const sortedByPriority = (statusId: string) => sortOf(statusId) !== "MANUAL";
const cardsFor = (statusId: string) => cards.value.filter((card) => card.statusId === statusId && !card.archived).sort(compareCards(store.statuses.find((status) => status.id === statusId)?.cardSort));
// A merged column mixes its boards' cards: by position with tab order breaking ties, or by priority.
const cardsForMerged = (column: MergedColumn) => { const rank = (statusId: string) => column.statusIds.indexOf(statusId); return cards.value.filter((card) => !card.archived && column.statusIds.includes(card.statusId)).sort(compareCards(column.cardSort, rank)); };
type KanbanColumn = { id: string; name: string; sort: BoardCardSort; cursor: string; status?: BoardStatus; merged?: MergedColumn & { statuses: BoardStatus[] } };
// Merged column ids encode the name's key: an id with spaces would split into several aria IDREFs.
const kanbanColumns = computed<KanbanColumn[]>(() => isAll.value
  ? mergedColumns.value.map((column) => ({ id: `column-${encodeURIComponent(column.key)}`, name: column.name, sort: column.cardSort, cursor: columnCursor(column.key), merged: column }))
  : activeStatuses.value.map((status) => ({ id: status.id, name: status.name, sort: status.cardSort || "MANUAL", cursor: status.id, status })));
const columnCards = (column: KanbanColumn) => column.merged ? cardsForMerged(column.merged) : cardsFor(column.status!.id);
const SORT_LABELS: Record<BoardCardSort, string> = { MANUAL: "unsorted", PRIORITY: "priority first", PRIORITY_LAST: "priority last" };
const SORT_ICONS: Record<BoardCardSort, string> = { MANUAL: mdiSort, PRIORITY: mdiSortDescending, PRIORITY_LAST: mdiSortAscending };
const sortTitle = (sort: BoardCardSort) => `${SORT_LABELS[sort][0].toUpperCase()}${SORT_LABELS[sort].slice(1)}; change to ${SORT_LABELS[nextSort(sort)]}`;
async function cycleColumnSort(column: KanbanColumn) { dismissError(); try { if (column.merged) await store.setColumnSort(column.merged.key, nextSort(column.sort)); else await store.setStatusSort(column.status!, nextSort(column.sort)); } catch { notices.notify("Could not sort this column."); } }
const statusName = (statusId: string) => statuses.value.find((status) => status.id === statusId)?.name || "Status";
const timelineLabel = (card: BoardCard) => isAll.value && cardBoard(card) ? `${cardBoard(card)!.name} · ${statusName(card.statusId)}` : statusName(card.statusId);
const cardAccent = (card: BoardCard) => cardBoard(card)?.pathId ? undefined : pathsStore.activePaths.find((path) => card.pathIds.includes(path.id))?.color || undefined;
const barStyle = (card: BoardCard) => { const position = barPosition(card.startDate || card.dueDate, card.dueDate || card.startDate, visibleDays.value); return position ? { left: `${position.left}%`, width: `${position.width}%` } : {}; };
function selectBoard(id: string) { dismissError(); store.selectedId = id; void router.replace({ query: { ...route.query, board: id } }); void store.loadBoard(); }
// Tabs only switch boards; renaming lives in board settings.
// Cards tied to a path (through a path board or their own path) can start a
// session while no timer runs; the timer itself stays server-owned.
const timerStore = useTimerStore();
// Board labels: a searchable chip picker in the card editor and one row of
// chips on each card. Escape first closes the picker's menu, then the editor.
const boardLabels = computed(() => labelsStore.forScope("BOARD"));
const cardLabels = (card: BoardCard) => card.labelIds.map((id) => boardLabels.value.find((label) => label.id === id)).filter((label): label is NonNullable<typeof label> => Boolean(label));
const labelsMenuOpen = ref(false);
// The picker never grows past one row: it shows the chips that fit and a +N
// count, measured from a hidden copy of the chips. Its menu lists the labels
// selected when it opened first, so rows do not jump while ticking them.
const LABEL_TYPING_ROOM = 40, LABEL_CHIP_GAP = 3;
const labelsFocused = ref(false), labelsPicker = ref<HTMLElement | null>(null), labelsMeasure = ref<HTMLElement | null>(null), visibleLabelCount = ref(Number.POSITIVE_INFINITY), labelMenuOrder = ref<string[]>([]);
const draftLabels = computed(() => draft.value.labelIds.map((id) => boardLabels.value.find((label) => label.id === id)).filter((label): label is NonNullable<typeof label> => Boolean(label)));
const labelMenuItems = computed(() => { const order = labelMenuOrder.value; if (!order.length) return boardLabels.value; const rank = (id: string) => { const index = order.indexOf(id); return index < 0 ? order.length : index; }; return [...boardLabels.value].sort((a, b) => rank(a.id) - rank(b.id)); });
watch(labelsMenuOpen, (open) => { if (open) labelMenuOrder.value = [...draft.value.labelIds]; });
function removeDraftLabel(id: string) { draft.value.labelIds = draft.value.labelIds.filter((labelId) => labelId !== id); }
function measureLabelChips() { const input = labelsPicker.value?.querySelector<HTMLElement>(".v-field__input"), measure = labelsMeasure.value; if (!input || !measure || input.clientWidth <= 0) { visibleLabelCount.value = Number.POSITIVE_INFINITY; return; } const widths = [...measure.querySelectorAll<HTMLElement>("[data-measure-label]")].map((chip) => chip.offsetWidth); const moreWidth = measure.querySelector<HTMLElement>("[data-measure-more]")?.offsetWidth ?? 0; const style = getComputedStyle(input); const available = input.clientWidth - parseFloat(style.paddingLeft || "0") - parseFloat(style.paddingRight || "0") - (labelsFocused.value ? LABEL_TYPING_ROOM : 0); visibleLabelCount.value = fitTabs(widths, available, moreWidth, LABEL_CHIP_GAP); }
const labelsResize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => measureLabelChips());
watch(labelsPicker, (picker) => { labelsResize?.disconnect(); if (picker) { labelsResize?.observe(picker); void nextTick(() => { measureLabelChips(); requestAnimationFrame(measureLabelChips); }); } });
watch(() => `${labelsFocused.value}|${draftLabels.value.map((label) => label.name).join("|")}`, () => { void nextTick(measureLabelChips); });
let labelsMenuWasOpen = false;
function noteLabelsMenu(event: KeyboardEvent) { if (event.key === "Escape") labelsMenuWasOpen = labelsMenuOpen.value || pathMenuOpen.value; }
function escapeEditor() { if (labelsMenuWasOpen) { labelsMenuWasOpen = false; labelsMenuOpen.value = false; pathMenuOpen.value = false; return; } void closeEditor(); }
// The header's path picker: "No path" first, then the active paths.
const pathMenuOpen = ref(false);
const cardPathItems = computed(() => [{ id: "", name: "No path" }, ...pathsStore.activePaths.map((path) => ({ id: path.id, name: path.name }))]);
function setDraftPath(pathId: string | null) { draft.value.pathIds = pathId ? [pathId] : []; }
const cardPathId = (card: BoardCard) => cardBoard(card)?.pathId || card.pathIds[0] || "";
const canStartSession = (card: BoardCard) => Boolean(cardPathId(card)) && !timerStore.isRunning;
// Cards offer play only in the In Progress column; while a timer runs the button keeps its slot invisibly so cards do not shift.
const isInProgressName = (name: string) => name.trim().toLowerCase().replace(/[\s_-]+/g, " ") === "in progress";
const isInProgress = (card: BoardCard) => isInProgressName(statusName(card.statusId));
const hasCardPlay = (card: BoardCard) => Boolean(cardPathId(card)) && isInProgress(card);
const startSessionLabel = (title: string) => `Start a session for ${title || "untitled card"}`;
async function startCardSession(card: BoardCard, title = card.title) { dismissError(); try { await timerStore.startSession({ pathId: cardPathId(card), description: title || undefined }); return true; } catch (cause) { notices.notify((cause as { status?: number })?.status === 409 ? "A session is already running. Stop it before starting another." : "Could not start a session. Try again."); return false; } }
function onCardPlay(event: MouseEvent, card: BoardCard, title?: string) { event.stopPropagation(); void startCardSession(card, title); }
// Starting a session from the editor means work has begun, so the card moves to its board's In Progress column when there is one.
async function onEditorPlay(event: MouseEvent, card: BoardCard, title: string) { event.stopPropagation(); if (!(await startCardSession(card, title)) || isInProgress(card)) return; const inProgress = editingOwnStatuses.value.find((status) => isInProgressName(status.name)); if (inProgress && editing.value?.id === card.id) await changeCardStatus(inProgress.id); }
function activateBoardTab(id: string) { if (store.selectedId !== id) selectBoard(id); }
// Board tabs never scroll sideways. The open board keeps a fixed-width first
// slot; the other boards follow while they fit and the rest go under More.
// Widths come from a hidden copy of the tabs, so hiding a tab never changes
// what is measured.
const TAB_GAP = 8;
const tabBar = ref<HTMLElement | null>(null), allTab = ref<HTMLElement | null>(null), tabSlot = ref<HTMLElement | null>(null), tabMeasure = ref<HTMLElement | null>(null), moreButton = ref<HTMLButtonElement | null>(null), moreMenu = ref<HTMLElement | null>(null);
const fittingTabs = ref(Number.POSITIVE_INFINITY), moreOpen = ref(false);
const otherBoards = computed(() => boards.value.filter((board) => board.id !== store.selectedId));
const shownBoards = computed(() => otherBoards.value.slice(0, fittingTabs.value));
const moreBoards = computed(() => otherBoards.value.slice(fittingTabs.value));
function measureTabs() { const bar = tabBar.value, measure = tabMeasure.value; if (!bar || !measure) return; const available = bar.clientWidth - (allTab.value ? allTab.value.offsetWidth + TAB_GAP : 0) - (tabSlot.value?.offsetWidth ?? 0) - TAB_GAP; if (bar.clientWidth <= 0) { fittingTabs.value = Number.POSITIVE_INFINITY; return; } const widths = [...measure.querySelectorAll<HTMLElement>("[data-measure-tab]")].map((tab) => tab.offsetWidth); const moreWidth = measure.querySelector<HTMLElement>("[data-measure-more]")?.offsetWidth ?? 0; fittingTabs.value = phone.value ? fitTabs(widths, available - moreWidth - TAB_GAP, 0, TAB_GAP) : fitTabs(widths, available, moreWidth, TAB_GAP); }
const tabResize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => measureTabs());
watch(tabBar, (bar, previous) => { if (previous) tabResize?.unobserve(previous); if (bar) { tabResize?.observe(bar); void nextTick(measureTabs); } });
watch(() => [store.selectedId, ...otherBoards.value.map((board) => `${board.id}:${board.name}:${board.pathId || ""}`)].join("|"), () => { void nextTick(measureTabs); });
// On phones the view switch and the Manage boards gear move into this menu,
// so it is always there, even when every board fits.
const PHONE_QUERY = "(max-width: 700px)";
const phone = ref(false);
let phoneQuery: MediaQueryList | undefined;
const onPhoneChange = (event: MediaQueryListEvent) => { phone.value = event.matches; };
const showBoardMenu = computed(() => moreBoards.value.length > 0 || phone.value);
const boardMenuName = computed(() => (moreBoards.value.length ? "More boards" : "Board menu"));
const boardMenuLabel = computed(() => (moreBoards.value.length ? `More boards (${moreBoards.value.length})` : "Board menu"));
function pickView(next: string) { closeMore(); setView(next); }
function pickManageBoards() { closeMore(); openManager(); }
const moreItems = () => [...(moreMenu.value?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];
function openMore() { moreOpen.value = true; void nextTick(() => moreItems()[0]?.focus()); }
function closeMore(returnFocus = false) { moreOpen.value = false; if (returnFocus) moreButton.value?.focus(); }
function toggleMore() { if (moreOpen.value) closeMore(); else openMore(); }
function pickMoreBoard(id: string) { closeMore(); activateBoardTab(id); }
function moveMoreFocus(event: KeyboardEvent) { const items = moreItems(); const index = items.indexOf(document.activeElement as HTMLElement); const last = items.length - 1; const next = event.key === "ArrowDown" ? (index + 1) % items.length : event.key === "ArrowUp" ? (index <= 0 ? last : index - 1) : event.key === "Home" ? 0 : event.key === "End" ? last : -1; if (next < 0) return; event.preventDefault(); items[next]?.focus(); }
function closeMoreOnOutside(event: PointerEvent) { const target = event.target as Node | null; if (moreOpen.value && target && !moreMenu.value?.contains(target) && !moreButton.value?.contains(target)) closeMore(); }
watch(showBoardMenu, (shown) => { if (!shown) closeMore(); });
watch(phone, () => { void nextTick(measureTabs); });
function setView(next: string) { if (view.value === next) return; void router.push({ query: { ...route.query, view: next, ...(next === "gantt" ? { from: ganttFrom.value, to: ganttTo.value } : {}) } }); }
function updateGanttRange() { if (!ganttFrom.value || !ganttTo.value || ganttTo.value < ganttFrom.value) { error.value = "Choose a valid inclusive date range."; return; } error.value = ""; void router.push({ query: { ...route.query, view: "gantt", from: ganttFrom.value, to: ganttTo.value } }); void store.loadGantt(ganttFrom.value, ganttTo.value); }
function shiftGantt(amount: number) { ganttFrom.value = addCalendarDays(ganttFrom.value, amount); ganttTo.value = addCalendarDays(ganttTo.value, amount); updateGanttRange(); }
// Add board lives in the Boards dialog; cancelling New board goes back there.
const newBoardFromManager = ref(false);
function openNewBoard() { newBoard.value = ""; newBoardError.value = ""; newBoardOpen.value = true; }
function openNewBoardFromManager() { managerOpen.value = false; newBoardFromManager.value = true; openNewBoard(); }
function closeNewBoard() { if (store.creatingBoard) return; newBoardOpen.value = false; if (newBoardFromManager.value) { newBoardFromManager.value = false; managerOpen.value = true; } }
// The dialog stays open on failure so the typed name is kept for a retry.
function focusInline(selector: string) { void nextTick(() => { const field = document.querySelector<HTMLInputElement>(selector); field?.focus(); field?.select(); }); }
async function createBoard() { if (store.creatingBoard) return; const name = newBoard.value.trim(); if (!name) { newBoardError.value = "Enter a board name."; focusInline("#new-board-name"); return; } newBoardError.value = ""; dismissError(); try { await store.createBoard(name); newBoard.value = ""; newBoardOpen.value = false; newBoardFromManager.value = false; await router.replace({ query: { ...route.query, board: store.selectedId } }); } catch { newBoardError.value = "Could not create board."; } }
// A column's + adds a blank card at the end of that column and opens it for editing.
// In the All boards view the card goes to the last board chosen in the editor
// (else the first tab), and a board without that column gets it.
const newCardBoardId = computed(() => boards.value.find((board) => board.id === preferences.lastCardBoardId)?.id || boards.value[0]?.id || "");
const boardName = (boardId: string) => boards.value.find((board) => board.id === boardId)?.name || "Board";
function announceColumn(status: BoardStatus, created: boolean) { if (created) notices.notify(`Added “${status.name}” to “${boardName(status.boardId || "")}”.`, "info"); }
async function addCardTo(status: BoardStatus) { if (store.creatingCard) return; dismissError(); try { const card = await store.createCard({ title: "", body: "{}", priority: "MEDIUM", statusId: status.id }); if (card) editCard(card); } catch { notices.notify("Could not create card."); } }
async function addCardToColumn(column: KanbanColumn) {
  if (!column.merged) return addCardTo(column.status!);
  if (store.creatingCard) return; dismissError();
  const boardId = newCardBoardId.value; if (!boardId) return;
  const own = column.merged.statuses.find((status) => status.boardId === boardId);
  try {
    if (own) { const card = await store.createCard({ title: "", body: "{}", priority: "MEDIUM", statusId: own.id }, boardId); if (card) editCard(card); return; }
    const placed = await store.createCardInColumn(boardId, column.name, { title: "", body: "{}", priority: "MEDIUM" });
    announceColumn(placed.status, placed.statusCreated); editCard(placed.card);
  } catch { notices.notify("Could not create card."); }
}
function defaultBoardDocument() { return { type: "doc", content: [{ type: "paragraph" }] }; }
function parseBoardBody(body: string) { try { const parsed = JSON.parse(body); return parsed?.type === "doc" ? parsed : defaultBoardDocument(); } catch { return defaultBoardDocument(); } }
function destroyCardEditor() { cardEditor.value?.destroy(); cardEditor.value = null; }
function rememberCardFocus(event: PointerEvent) { const card = (event.target as HTMLElement | null)?.closest<HTMLElement>(".board-card"); if (card) lastFocusedCard.value = card; }
function restoreCardFocus() { const cardId = lastFocusedCardId.value; if (cardId) void nextTick(() => (lastFocusedCard.value || document.getElementById(`board-card-${cardId}`))?.focus()); }
function warnBeforeUnload(event: BeforeUnloadEvent) { if (editing.value && JSON.stringify(draft.value) !== savedSnapshot.value) { event.preventDefault(); event.returnValue = ""; } }
function editCard(card: BoardCard) { clearTimeout(saveTimer); destroyCardEditor(); lastFocusedCardId.value = card.id; editing.value = card; cardDateError.value = ""; saveState.value = ""; saveError.value = ""; closeAnyway.value = false; draft.value = { title: card.title, body: card.body, priority: card.priority, startDate: card.startDate || "", dueDate: card.dueDate || "", pathIds: [...card.pathIds], labelIds: [...card.labelIds] }; savedSnapshot.value = JSON.stringify(draft.value); cardEditor.value = new Editor({ extensions: richTextExtensions(), content: parseBoardBody(card.body), editorProps: { ...richTextEditorProps, attributes: { role: "textbox", "aria-label": "Card body", "aria-multiline": "true" }, handleKeyDown: (_view, event) => { if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return false; void closeEditor(); return true; } }, onUpdate: ({ editor }) => { draft.value.body = JSON.stringify(editor.getJSON()); } }); }
// A single confirmed day is both the start and the due date.
function setDraftDates(value: Date[] | null) { const [start, due] = value || []; draft.value.startDate = start ? format(start, "yyyy-MM-dd") : ""; draft.value.dueDate = start ? format(due || start, "yyyy-MM-dd") : ""; }
function queueSave() { clearTimeout(saveTimer); saveChain = saveChain.then(persistDraft); return saveChain; }
async function persistDraft() { const card = editing.value; if (!card) return; const snapshot = JSON.stringify(draft.value); if (snapshot === savedSnapshot.value) return; if (draft.value.startDate && draft.value.dueDate && draft.value.dueDate < draft.value.startDate) { cardDateError.value = "Due date must be on or after the start date."; return; } cardDateError.value = ""; saveState.value = "saving"; try { const saved = await store.updateCard(card, { ...draft.value, startDate: draft.value.startDate || undefined, dueDate: draft.value.dueDate || undefined }); if (editing.value?.id === card.id) editing.value = saved; savedSnapshot.value = snapshot; saveState.value = "saved"; saveError.value = ""; closeAnyway.value = false; } catch (saveFailure) { saveState.value = "error"; saveError.value = saveFailure instanceof ApiError && saveFailure.status === 408 ? "The request timed out. Your edits are kept." : saveFailure instanceof ApiError && saveFailure.status === 409 ? "This card changed elsewhere. Retry to save your version." : "Could not save card. Your edits are kept."; } }
// In the All boards view the status list also offers other boards' column
// names ("column:<key>"); picking one adds that column to the card's board.
const COLUMN_OPTION = "column:";
const editingOwnStatuses = computed(() => { const card = editing.value; if (!card) return []; const boardId = cardBoardId(card); return statuses.value.filter((status) => !status.archived && (status.boardId || boardId) === boardId).sort((a, b) => a.position - b.position); });
const editingOtherColumns = computed(() => { const card = editing.value; if (!card) return []; const boardId = cardBoardId(card); return mergedColumns.value.filter((column) => !column.statuses.some((status) => status.boardId === boardId)); });
async function changeCardStatus(value: string) {
  const card = editing.value; if (!card || card.statusId === value) return;
  saveChain = saveChain.then(async () => {
    try {
      if (value.startsWith(COLUMN_OPTION)) { const column = mergedColumns.value.find((item) => item.key === value.slice(COLUMN_OPTION.length)); if (!column) return; const placed = await store.moveCardToColumn(card, column.name, 0); announceColumn(placed.status, placed.statusCreated); return; }
      await store.moveCard(card, value, cardsFor(value).length);
    } catch { notices.notify("Could not move card. The change was rolled back."); }
  });
  await saveChain;
}
// Moving a card to another board keeps its column name; the board is remembered for new cards.
async function changeCardBoard(boardId: string) {
  const card = editing.value; if (!card || cardBoardId(card) === boardId) return;
  saveChain = saveChain.then(async () => {
    try { const placed = await store.transferCard(card, boardId); announceColumn(placed.status, placed.statusCreated); void preferences.setLastCardBoard(boardId); } catch { notices.notify("Could not move the card to that board."); }
  });
  await saveChain;
}
// Closing saves pending edits first; if that save fails the dialog stays open
// with the error, and closing again discards the unsaved edits.
async function closeEditor() { if (!editing.value) return; await queueSave(); if ((saveState.value === "error" || cardDateError.value) && !closeAnyway.value) { closeAnyway.value = true; return; } clearTimeout(saveTimer); destroyCardEditor(); editing.value = null; saveState.value = ""; restoreCardFocus(); }
async function addStatus() { if (!newStatus.value.trim()) return; dismissError(); try { const status = await store.createStatus(newStatus.value, settingsBoardId.value); if (!settingsForOpenBoard.value) otherBoardStatuses.value.push(status); newStatus.value = ""; } catch { notices.notify("Could not create status."); } }
function requestArchiveStatus(status: BoardStatus) { archiveStatusConfirm.value = status; }
async function confirmArchiveStatus() { const status = archiveStatusConfirm.value; archiveStatusConfirm.value = null; if (!status || archivingStatusId.value) return; archivingStatusId.value = status.id; try { const boardId = settingsBoardId.value; await store.archiveStatus(status, false, boardId); if (boardId !== store.selectedId) otherBoardStatuses.value = await store.fetchStatuses(boardId); } catch (archiveError) { error.value = archiveError instanceof ApiError && archiveError.status === 409 ? "A board must keep one active status." : "Could not archive status."; } finally { archivingStatusId.value = ""; } }
// Board settings hold the board name and all status management (create,
// rename, reorder, archive) so the Kanban columns stay free of controls.
async function openSettings(id: string) { settingsBoardId.value = id; settingsName.value = boards.value.find((board) => board.id === id)?.name || ""; newStatus.value = ""; otherBoardStatuses.value = []; settingsOpen.value = true; if (id === store.selectedId) return; try { const loaded = await store.fetchStatuses(id); if (settingsBoardId.value === id) otherBoardStatuses.value = loaded; } catch { notices.notify("Could not load board statuses."); } }
function closeSettings() { settingsOpen.value = false; settingsFromManager.value = false; }
async function saveSettingsName() { const board = settingsBoard.value; const name = settingsName.value.trim(); if (!board || store.updatingBoard) return; if (!name) { settingsName.value = board.name; return; } if (name === board.name) return; dismissError(); try { await store.updateBoard(board.id, name); } catch { notices.notify("Could not rename board."); } }
async function renameStatus(status: BoardStatus, event: Event) { const input = event.target as HTMLInputElement; const name = input.value.trim(); if (!name) { input.value = status.name; return; } if (name === status.name) return; dismissError(); try { await store.updateStatus(status, name, settingsBoardId.value); } catch { input.value = status.name; notices.notify("Could not save status."); } }
async function saveStatusOrder(ids: string[]) { try { const saved = await store.reorderStatuses(ids, settingsBoardId.value, settingsAllStatuses.value); if (!settingsForOpenBoard.value) otherBoardStatuses.value = saved; } catch { notices.notify("Could not reorder status."); } }
function startStatusDrag(event: PointerEvent, status: BoardStatus) { if (event.button !== 0) return; event.preventDefault(); (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId); statusDragId.value = status.id; statusDragOrder.value = settingsActiveStatuses.value.map((item) => item.id); }
function dragStatus(event: PointerEvent) { const order = statusDragOrder.value; if (!statusDragId.value || !order || !settingsStatusList.value) return; const others = [...settingsStatusList.value.querySelectorAll<HTMLElement>("li[data-status-id]")].filter((row) => row.dataset.statusId !== statusDragId.value); const index = others.filter((row) => { const box = row.getBoundingClientRect(); return box.top + box.height / 2 < event.clientY; }).length; const next = order.filter((id) => id !== statusDragId.value); next.splice(index, 0, statusDragId.value); if (next.join() !== order.join()) statusDragOrder.value = next; }
async function endStatusDrag() { const order = statusDragOrder.value; const changed = Boolean(order && order.join() !== settingsActiveStatuses.value.map((item) => item.id).join()); statusDragId.value = ""; statusDragOrder.value = null; if (order && changed) await saveStatusOrder(order); }
async function moveStatus(status: BoardStatus, direction: number) { const index = settingsActiveStatuses.value.findIndex((item) => item.id === status.id); const target = settingsActiveStatuses.value[index + direction]; if (!target) return; await saveStatusOrder(settingsActiveStatuses.value.map((item) => item.id).map((id, itemIndex, ids) => ids[itemIndex] === status.id ? ids[itemIndex + direction] : ids[itemIndex] === target.id ? status.id : id)); }
// In a merged column a card stays on its own board: it lands in its board's
// column with that name (created when missing), after the nearest card of
// that column shown above the drop point.
function placeInColumn(card: BoardCard, column: MergedColumn & { statuses: BoardStatus[] }, beforeId: string | null) {
  const own = column.statuses.find((status) => status.boardId === cardBoardId(card));
  if (!own) { void store.moveCardToColumn(card, column.name, 0).then((placed) => announceColumn(placed.status, placed.statusCreated)).catch(() => { notices.notify("Could not move card. The change was rolled back."); }); return; }
  if (column.cardSort !== "MANUAL" && card.statusId === own.id) return;
  const position = column.cardSort !== "MANUAL" || !beforeId ? cardsFor(own.id).filter((item) => item.id !== card.id).length : dropPosition(cardsForMerged(column), beforeId, card, own.id);
  void store.moveCard(card, own.id, position).catch(() => { notices.notify("Could not move card. The change was rolled back."); });
}
function dropOnColumn(event: DragEvent, column: KanbanColumn) { const id = event.dataTransfer?.getData("text/plain"); const card = cards.value.find((item) => item.id === id); if (!card) return; if (column.merged) { placeInColumn(card, column.merged, null); return; } void store.moveCard(card, column.status!.id, cardsFor(column.status!.id).length); }
function dropCard(event: DragEvent, target: BoardCard) { event.stopPropagation(); const cardId = event.dataTransfer?.getData("text/plain"); const card = cards.value.find((item) => item.id === cardId); if (!card || card.id === target.id) return; if (isAll.value) { const column = mergedColumns.value.find((item) => item.statusIds.includes(target.statusId)); if (column) placeInColumn(card, column, target.id); return; } if (sortedByPriority(target.statusId)) { if (card.statusId !== target.statusId) void store.moveCard(card, target.statusId, cardsFor(target.statusId).length).catch(() => { notices.notify("Could not move card. The change was rolled back."); }); return; } const position = cardsFor(target.statusId).findIndex((item) => item.id === target.id); if (position < 0) return; void store.moveCard(card, target.statusId, position).catch(() => { notices.notify("Could not reorder card. The change was rolled back."); }); }
async function reorderCard(card: BoardCard, direction: number) { if (sortedByPriority(card.statusId)) return; const column = cardsFor(card.statusId); const index = column.findIndex((item) => item.id === card.id); const target = index + direction; if (index < 0 || target < 0 || target >= column.length) return; try { await store.moveCard(card, card.statusId, target); } catch { notices.notify("Could not reorder card. The change was rolled back."); } }
function moveFocusedCard(event: KeyboardEvent) { if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return; const focused = document.activeElement?.closest<HTMLElement>(".board-card"); if (!focused) return; const elements = [...document.querySelectorAll<HTMLElement>(".board-card")]; const index = elements.indexOf(focused); const visible = kanbanColumns.value.flatMap(columnCards); const card = visible[index]; if (!card) return; event.preventDefault(); void reorderCard(card, event.key === "ArrowUp" ? -1 : 1); }
// Board columns page by status; merged columns by their "column:<key>" cursor.
const loadMoreFor = (cursor: string) => cursor.startsWith(COLUMN_OPTION) ? store.loadMoreColumn(cursor.slice(COLUMN_OPTION.length)) : store.loadMore(cursor);
const retryLoadMoreFor = (cursor: string) => cursor.startsWith(COLUMN_OPTION) ? store.retryLoadMoreColumn(cursor.slice(COLUMN_OPTION.length)) : store.retryLoadMore(cursor);
function observeSentinel(cursor: string, element: Element | null) { pageObservers.get(cursor)?.disconnect(); if (!element || typeof IntersectionObserver === "undefined" || store.pageCursors[cursor] === null) return; const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) void loadMoreFor(cursor).catch(() => undefined); }); observer.observe(element); pageObservers.set(cursor, observer); }
// The Boards dialog (the single gear beside Add board) lists every board, opens
// its settings, and pins or reorders any board within its group (pinned or not),
// so custom boards can sit between path boards. The Paths page keeps its own order.
const managerOpen = ref(false), managerDragId = ref(""), managerDragOrder = ref<string[] | null>(null), managerList = ref<HTMLElement | null>(null), pinningBoardId = ref("");
function boardGroup(board: Board) { return boards.value.filter((item) => Boolean(item.pinned) === Boolean(board.pinned)); }
// While a row is dragged the dialog previews the new order within its group; it is saved on release.
const managerBoards = computed(() => { const order = managerDragOrder.value; if (!order) return boards.value; const byId = new Map(boards.value.map((board) => [board.id, board])); const queue = order.map((id) => byId.get(id)!); return boards.value.map((board) => order.includes(board.id) ? queue.shift()! : board); });
function openManager() { managerOpen.value = true; }
function closeManager() { managerOpen.value = false; }
// Settings opened from the Boards dialog offer a Back button that returns to the list.
const settingsFromManager = ref(false);
function openBoardSettings(id: string) { managerOpen.value = false; settingsFromManager.value = true; void openSettings(id); }
function backToManager() { settingsOpen.value = false; settingsFromManager.value = false; managerOpen.value = true; }
function saveGroupOrder(group: Board[]) { store.reorderBoards(group.map((item) => item.id)).catch(() => { notices.notify("Could not reorder boards."); }); }
function moveBoard(board: Board, direction: number) { const group = boardGroup(board); const index = group.findIndex((item) => item.id === board.id); const target = index + direction; if (target < 0 || target >= group.length) return; const next = [...group]; [next[index], next[target]] = [next[target], next[index]]; saveGroupOrder(next); }
// The preview moves rows in the DOM, which drops pointer capture, so the drag listens on the window.
function startBoardDrag(event: PointerEvent, board: Board) { if (event.button !== 0) return; event.preventDefault(); managerDragId.value = board.id; managerDragOrder.value = boardGroup(board).map((item) => item.id); window.addEventListener("pointermove", dragBoard); window.addEventListener("pointerup", endBoardDrag); window.addEventListener("pointercancel", endBoardDrag); }
function dragBoard(event: PointerEvent) { const order = managerDragOrder.value; if (!managerDragId.value || !order || !managerList.value) return; const others = [...managerList.value.querySelectorAll<HTMLElement>("li[data-board-id]")].filter((row) => order.includes(row.dataset.boardId || "") && row.dataset.boardId !== managerDragId.value); const index = others.filter((row) => { const box = row.getBoundingClientRect(); return box.top + box.height / 2 < event.clientY; }).length; const next = order.filter((id) => id !== managerDragId.value); next.splice(index, 0, managerDragId.value); if (next.join() !== order.join()) managerDragOrder.value = next; }
function endBoardDrag() { window.removeEventListener("pointermove", dragBoard); window.removeEventListener("pointerup", endBoardDrag); window.removeEventListener("pointercancel", endBoardDrag); const order = managerDragOrder.value; const dragged = boards.value.find((board) => board.id === managerDragId.value); managerDragId.value = ""; managerDragOrder.value = null; if (!order || !dragged || order.join() === boardGroup(dragged).map((item) => item.id).join()) return; const byId = new Map(boards.value.map((board) => [board.id, board])); saveGroupOrder(order.map((id) => byId.get(id)!)); }
async function togglePinned(board: Board) { if (pinningBoardId.value) return; pinningBoardId.value = board.id; dismissError(); try { await store.pinBoard(board.id, !board.pinned); } catch { error.value = board.pinned ? "Could not unpin board." : "Could not pin board."; } finally { pinningBoardId.value = ""; } }
function requestArchiveBoard() { if (settingsBoardId.value) archiveConfirmOpen.value = true; }
function requestArchiveCard(card: BoardCard) { archiveCardConfirm.value = card; }
async function confirmArchiveCard() { const card = archiveCardConfirm.value; archiveCardConfirm.value = null; if (!card) return; try { if (editing.value?.id === card.id) { await queueSave(); clearTimeout(saveTimer); destroyCardEditor(); editing.value = null; } await store.archiveCard(card); } catch { notices.notify("Could not archive card."); } }
async function archiveBoard() { const id = settingsBoardId.value; if (!id) return; const wasOpen = id === store.selectedId; archiveConfirmOpen.value = false; settingsOpen.value = false; dismissError(); try { await store.archiveBoard(id); if (wasOpen) await router.replace({ query: {} }); } catch { notices.notify("Could not archive board."); } }
onMounted(async () => { phoneQuery = typeof window.matchMedia === "function" ? window.matchMedia(PHONE_QUERY) : undefined; phone.value = Boolean(phoneQuery?.matches); phoneQuery?.addEventListener("change", onPhoneChange); document.addEventListener("pointerdown", closeMoreOnOutside); window.visualViewport?.addEventListener("resize", measureKanbanHeight); measureViewport(); window.addEventListener("resize", measureViewport); document.addEventListener("pointerdown", rememberCardFocus); document.addEventListener("keydown", moveFocusedCard); window.addEventListener("beforeunload", warnBeforeUnload); // The URL's board is selected before the list loads, so loading never falls back to the first tab first.
  const requested = typeof route.query.board === "string" ? route.query.board : ""; if (requested) store.selectedId = requested; await Promise.all([store.loadBoards(), pathsStore.load(), labelsStore.loadScope("BOARD")]); await store.loadBoard(); if (view.value === "gantt") await store.loadGantt(ganttFrom.value, ganttTo.value); });
watch(() => store.selectedId, (id) => { if (id && route.query.board !== id) void router.replace({ query: { ...route.query, board: id } }); if (id && view.value === "gantt") void store.loadGantt(ganttFrom.value, ganttTo.value); });
watch(draft, () => { if (!editing.value) return; clearTimeout(saveTimer); saveTimer = setTimeout(() => void queueSave(), AUTOSAVE_DELAY_MS); }, { deep: true });
watch(view, (next) => { if (next === "gantt") void store.loadGantt(ganttFrom.value, ganttTo.value); });
watch(() => [route.query.from, route.query.to], ([from, to]) => { if (view.value !== "gantt" || typeof from !== "string" || typeof to !== "string" || from === ganttFrom.value && to === ganttTo.value) return; ganttFrom.value = from; ganttTo.value = to; void store.loadGantt(from, to); });
onBeforeUnmount(() => { phoneQuery?.removeEventListener("change", onPhoneChange); document.removeEventListener("pointerdown", closeMoreOnOutside); window.visualViewport?.removeEventListener("resize", measureKanbanHeight); kanbanResize?.disconnect(); tabResize?.disconnect(); endBoardDrag(); window.removeEventListener("resize", measureViewport); document.removeEventListener("pointerdown", rememberCardFocus); document.removeEventListener("keydown", moveFocusedCard); window.removeEventListener("beforeunload", warnBeforeUnload); pageObservers.forEach((observer) => observer.disconnect()); clearTimeout(saveTimer); destroyCardEditor(); });
</script>

<template>
  <section ref="boardPage" class="board-page" aria-labelledby="board-heading">
    <h1 id="board-heading" class="sr-only">Boards</h1>
    <div v-if="newBoardOpen" class="dialog-backdrop" role="presentation" v-backdrop-close="closeNewBoard"><form v-dialog-focus class="confirm-dialog new-board-dialog" role="dialog" aria-modal="true" aria-labelledby="new-board-title" tabindex="-1" novalidate @submit.prevent="createBoard" @keydown.esc.prevent="closeNewBoard"><h2 id="new-board-title">New board</h2><label for="new-board-name" class="sr-only">New board name</label><input id="new-board-name" v-model="newBoard" name="boardName" placeholder="e.g. Product launch…" maxlength="120" autocomplete="off" :aria-invalid="Boolean(newBoardError)" :aria-describedby="newBoardError ? 'new-board-error' : undefined" /><p v-if="newBoardError" id="new-board-error" class="field-error" role="alert">{{ newBoardError }}</p><div class="editor-actions"><button class="secondary" type="button" :disabled="store.creatingBoard" @click="closeNewBoard">Cancel</button><button type="submit" :aria-busy="store.creatingBoard" :disabled="store.creatingBoard">{{ store.creatingBoard ? "Creating…" : "Create" }}</button></div></form></div>
    <div v-if="managerOpen" class="dialog-backdrop" role="presentation" v-backdrop-close="closeManager"><section v-dialog-focus class="confirm-dialog board-settings boards-manager" role="dialog" aria-modal="true" aria-labelledby="boards-manager-title" tabindex="-1" @keydown.esc.prevent="closeManager">
      <header class="board-settings-header"><h2 id="boards-manager-title">Boards</h2><div class="board-settings-heading"><button class="icon-button quiet" type="button" aria-label="Add board" title="Add board" @click="openNewBoardFromManager"><v-icon :icon="mdiPlus" size="20" aria-hidden="true" /></button><button class="icon-button quiet" type="button" aria-label="Close boards" title="Close" @click="closeManager"><v-icon :icon="mdiClose" size="20" aria-hidden="true" /></button></div></header>
      <p id="board-reorder-help" class="sr-only">Drag the handle to reorder, or focus it and press the up or down arrow key. Pinned boards stay first.</p>
      <p v-if="!boards.length" class="column-empty">No boards yet.</p>
      <ul ref="managerList" class="settings-statuses boards-manager-list" :class="{ dragging: managerDragId }" aria-label="Boards">
        <li v-for="board in managerBoards" :key="board.id" :data-board-id="board.id" :class="{ 'is-dragged': managerDragId === board.id }"><button class="icon-button quiet drag-handle" type="button" :aria-label="`Reorder ${board.name}`" aria-describedby="board-reorder-help" title="Drag to reorder" @pointerdown="startBoardDrag($event, board)" @keydown.up.prevent="moveBoard(board, -1)" @keydown.down.prevent="moveBoard(board, 1)"><v-icon :icon="mdiDragVertical" size="20" aria-hidden="true" /></button><button class="boards-manager-name" type="button" @click="openBoardSettings(board.id)"><span v-if="board.pathId" class="board-tab-dot" :style="{ backgroundColor: pathColor(board.pathId) }" aria-hidden="true"></span>{{ board.name }}</button><button class="icon-button quiet boards-manager-pin" :class="{ pinned: board.pinned }" type="button" :aria-pressed="Boolean(board.pinned)" :aria-label="`${board.pinned ? 'Unpin' : 'Pin'} ${board.name}`" :title="board.pinned ? 'Unpin board' : 'Pin board'" :disabled="pinningBoardId === board.id" @click="togglePinned(board)"><v-icon :icon="board.pinned ? mdiPin : mdiPinOutline" size="20" aria-hidden="true" /></button></li>
      </ul>
      <footer class="board-settings-footer end-only"><button type="button" @click="closeManager">Done</button></footer>
    </section></div>
    <div v-if="settingsOpen && settingsBoard" class="dialog-backdrop" role="presentation" v-backdrop-close="closeSettings"><section v-dialog-focus class="confirm-dialog board-settings" role="dialog" aria-modal="true" aria-labelledby="board-settings-title" tabindex="-1" @keydown.esc.prevent="closeSettings">
      <header class="board-settings-header"><div class="board-settings-heading"><button v-if="settingsFromManager" class="icon-button quiet" type="button" aria-label="Back to boards" title="Back to boards" @click="backToManager"><v-icon :icon="mdiArrowLeft" size="20" aria-hidden="true" /></button><h2 id="board-settings-title">Board settings</h2></div><button class="icon-button quiet" type="button" aria-label="Close board settings" title="Close" @click="closeSettings"><v-icon :icon="mdiClose" size="20" aria-hidden="true" /></button></header>
      <template v-if="settingsBoard.pathId">
        <p class="settings-name-readonly">{{ settingsBoard.name }} <RouterLink to="/paths" class="settings-path-link" title="Rename or hide this board on the Paths page">Rename…</RouterLink></p>
      </template>
      <template v-else>
        <label class="sr-only" for="board-settings-name">Name</label>
        <input id="board-settings-name" v-model="settingsName" class="settings-input" name="boardSettingsName" maxlength="120" autocomplete="off" @keydown.enter.prevent="saveSettingsName" @blur="saveSettingsName" />
      </template>
      <h3 class="settings-label">Statuses</h3>
      <form class="settings-add-status" @submit.prevent="addStatus"><input v-model="newStatus" class="settings-input" aria-label="New status name" name="statusName" placeholder="New status…" maxlength="120" autocomplete="off" /><button class="icon-button quiet" type="submit" aria-label="Add status" title="Add status"><v-icon :icon="mdiPlus" size="20" aria-hidden="true" /></button></form>
      <p id="status-reorder-help" class="sr-only">Drag the handle to reorder, or focus it and press the up or down arrow key.</p>
      <ul ref="settingsStatusList" class="settings-statuses" :class="{ dragging: statusDragId }" aria-label="Statuses">
        <li v-for="status in settingsStatuses" :key="status.id" :data-status-id="status.id" :class="{ 'is-dragged': statusDragId === status.id }"><button class="icon-button quiet drag-handle" type="button" :aria-label="`Reorder ${status.name}`" aria-describedby="status-reorder-help" title="Drag to reorder" @pointerdown="startStatusDrag($event, status)" @pointermove="dragStatus" @pointerup="endStatusDrag" @pointercancel="endStatusDrag" @keydown.up.prevent="moveStatus(status, -1)" @keydown.down.prevent="moveStatus(status, 1)"><v-icon :icon="mdiDragVertical" size="20" aria-hidden="true" /></button><input class="settings-input" :value="status.name" :aria-label="`Status name ${status.name}`" maxlength="120" autocomplete="off" @keydown.enter.prevent="renameStatus(status, $event)" @blur="renameStatus(status, $event)" /><button class="icon-button quiet danger" type="button" :aria-label="`Archive ${status.name} status`" title="Archive status" :disabled="settingsActiveStatuses.length === 1 || archivingStatusId === status.id" @click="requestArchiveStatus(status)"><v-icon :icon="mdiTrashCanOutline" size="20" aria-hidden="true" /></button></li>
      </ul>
      <footer class="board-settings-footer" :class="{ 'end-only': settingsBoard.pathId }"><button v-if="!settingsBoard.pathId" class="quiet danger with-icon" type="button" @click="requestArchiveBoard"><v-icon :icon="mdiTrashCanOutline" size="18" aria-hidden="true" />Archive board</button><button type="button" @click="closeSettings">Done</button></footer>
    </section></div>
    <div v-if="archiveConfirmOpen" class="dialog-backdrop confirm-layer" role="presentation"><div class="confirm-dialog" role="alertdialog" aria-labelledby="archive-board-title" aria-describedby="archive-board-description"><h2 id="archive-board-title">Archive board?</h2><p id="archive-board-description">Cards and statuses stay retained and can be restored later.</p><div class="editor-actions"><button class="secondary" type="button" @click="archiveConfirmOpen = false">Cancel</button><button type="button" :disabled="Boolean(settingsBoardId && store.boardMutations[settingsBoardId])" @click="archiveBoard">Archive</button></div></div></div>
    <div v-if="archiveCardConfirm" class="dialog-backdrop confirm-layer" role="presentation"><div class="confirm-dialog" role="alertdialog" aria-labelledby="archive-card-title"><h2 id="archive-card-title">Archive card?</h2><div class="editor-actions"><button class="secondary" type="button" @click="archiveCardConfirm = null">Cancel</button><button type="button" @click="confirmArchiveCard">Archive</button></div></div></div>
    <div v-if="archiveStatusConfirm" class="dialog-backdrop confirm-layer" role="presentation"><div class="confirm-dialog" role="alertdialog" aria-labelledby="archive-status-title" aria-describedby="archive-status-description"><h2 id="archive-status-title">Archive status?</h2><p id="archive-status-description">{{ archiveStatusConfirm.name }} will be archived and its active cards will move to another status.</p><div class="editor-actions"><button class="secondary" type="button" @click="archiveStatusConfirm = null">Cancel</button><button type="button" :disabled="archivingStatusId === archiveStatusConfirm.id" @click="confirmArchiveStatus">Archive</button></div></div></div>
    <p v-if="error || store.error" class="board-error" role="alert">{{ error || store.error }}<button type="button" class="error-dismiss" aria-label="Dismiss board error" @click="dismissError">×</button></p>
    <div class="board-toolbar">
      <div ref="tabBar" class="board-tabs" role="group" aria-label="Boards">
        <button ref="allTab" class="board-all-tab" :class="{ selected: isAll }" type="button" aria-label="All boards" title="All boards" :aria-current="isAll ? 'true' : undefined" @click="activateBoardTab(ALL_BOARDS)"><v-icon :icon="mdiAllInclusive" size="20" aria-hidden="true" /></button>
        <div v-if="!isAll" ref="tabSlot" class="board-tab-current">
          <button v-if="selectedBoard" class="board-tab selected" type="button" aria-current="true" :title="selectedBoard.name" @click="activateBoardTab(selectedBoard.id)"><span v-if="selectedBoard.pathId" class="board-tab-dot" :style="{ backgroundColor: pathColor(selectedBoard.pathId) }" aria-hidden="true"></span>{{ selectedBoard.name }}</button>
          <button v-else class="board-tab empty" disabled type="button">No boards</button>
        </div>
        <div class="board-tab-list">
          <button v-for="board in shownBoards" :key="board.id" class="board-tab" type="button" @click="activateBoardTab(board.id)"><span v-if="board.pathId" class="board-tab-dot" :style="{ backgroundColor: pathColor(board.pathId) }" aria-hidden="true"></span>{{ board.name }}</button>
        </div>
        <div v-if="showBoardMenu" class="board-tab-more-anchor">
          <button ref="moreButton" class="board-tab-more" type="button" :aria-label="boardMenuLabel" aria-haspopup="menu" :aria-expanded="moreOpen" @click="toggleMore" @keydown.down.prevent="openMore">{{ moreBoards.length ? `${moreBoards.length} more` : "More" }}<v-icon :icon="mdiChevronDown" size="18" aria-hidden="true" /></button>
          <ul v-if="moreOpen && showBoardMenu" ref="moreMenu" class="board-more-menu" role="menu" :aria-label="boardMenuName" @keydown="moveMoreFocus" @keydown.esc.prevent="closeMore(true)" @keydown.tab="closeMore()">
            <li v-for="board in moreBoards" :key="board.id" role="none"><button class="board-more-item" type="button" role="menuitem" tabindex="-1" @click="pickMoreBoard(board.id)"><span v-if="board.pathId" class="board-tab-dot" :style="{ backgroundColor: pathColor(board.pathId) }" aria-hidden="true"></span>{{ board.name }}</button></li>
          <template v-if="phone"><li v-if="moreBoards.length" role="separator" class="board-more-separator"></li><li v-for="option in [{ value: 'kanban', label: 'Kanban' }, { value: 'gantt', label: 'Gantt' }]" :key="option.value" role="none"><button class="board-more-item" type="button" role="menuitemradio" tabindex="-1" :aria-checked="view === option.value" @click="pickView(option.value)"><v-icon class="board-more-check" :icon="mdiCheck" size="16" aria-hidden="true" />{{ option.label }}</button></li><li role="separator" class="board-more-separator"></li><li role="none"><button class="board-more-item" type="button" role="menuitem" tabindex="-1" @click="pickManageBoards"><v-icon class="board-more-check" :icon="mdiCogOutline" size="16" aria-hidden="true" />Manage boards…</button></li></template></ul>
        </div>
        <div ref="tabMeasure" class="board-tab-measure-row" aria-hidden="true">
          <span v-for="board in otherBoards" :key="board.id" class="board-tab-measure" data-measure-tab><span v-if="board.pathId" class="board-tab-measure-dot"></span>{{ board.name }}</span>
          <span class="board-tab-more" data-measure-more>{{ otherBoards.length }} more<v-icon :icon="mdiChevronDown" size="18" /></span>
        </div>
      </div>
      <div v-if="!phone" class="board-view-actions"><button class="secondary icon-button manage-boards" type="button" aria-label="Manage boards" title="Manage boards" aria-haspopup="dialog" @click="openManager"><v-icon :icon="mdiCogOutline" size="20" aria-hidden="true" /></button><div class="view-switch" role="group" aria-label="Board view"><button :class="{ selected: view === 'kanban' }" type="button" @click="setView('kanban')">Kanban</button><button :class="{ selected: view === 'gantt' }" type="button" @click="setView('gantt')">Gantt</button></div></div>
    </div>
    <div v-if="loading" class="board-empty" aria-live="polite">Loading board…</div>
    <div v-else-if="!store.selectedId" class="board-empty"><h2>Create your first board</h2><p>Keep projects, priorities, and dates together in one focused workspace.</p><button type="button" @click="openNewBoard">New board…</button></div>
    <template v-else-if="view === 'kanban'">
      <div class="kanban-area" :class="{ wide: kanbanWide }" :style="kanbanWide && viewportWidth ? { '--viewport-width': `${viewportWidth}px`, '--content-left': `${contentLeft}px` } : undefined"><button class="kanban-width-toggle" type="button" :aria-pressed="kanbanWide" :aria-label="kanbanWide ? 'Collapse board to page width' : 'Expand board to full width'" :title="kanbanWide ? 'Collapse to page width' : 'Expand to full width'" @click="toggleKanbanWide"><v-icon :icon="kanbanWide ? mdiArrowCollapseHorizontal : mdiArrowExpandHorizontal" size="16" aria-hidden="true" /></button>
      <div ref="kanbanEl" class="kanban" tabindex="0" aria-label="Kanban board" :style="kanbanMaxHeight ? { '--kanban-max-height': `${kanbanMaxHeight}px` } : undefined">
        <section v-for="column in kanbanColumns" :key="column.id" class="kanban-column" :aria-labelledby="`status-${column.id}`" @dragover.prevent @drop="dropOnColumn($event as DragEvent, column)"><header><h2 :id="`status-${column.id}`">{{ column.name }}</h2><div class="column-tools"><span>{{ columnCards(column).length }}</span><button type="button" class="column-sort" :class="{ active: column.sort !== 'MANUAL' }" :aria-label="`Sort ${column.name}: ${SORT_LABELS[column.sort]}`" :title="sortTitle(column.sort)" @click="cycleColumnSort(column)"><v-icon :icon="SORT_ICONS[column.sort]" size="18" aria-hidden="true" /></button><button type="button" class="add-card" :aria-label="`Add card to ${column.name}`" :title="`Add card to ${column.name}`" :disabled="store.creatingCard" @click="addCardToColumn(column)">＋</button></div></header><article v-for="card in columnCards(column)" :id="`board-card-${card.id}`" :key="card.id" class="board-card" :aria-label="card.title ? undefined : 'Untitled card'" :class="{ accented: cardAccent(card) }" :style="{ '--card-accent': cardAccent(card) }" draggable="true" tabindex="0" @dragstart="($event) => ($event as DragEvent).dataTransfer?.setData('text/plain', card.id)" @dragover.prevent @drop.stop="($event) => dropCard($event as DragEvent, card)" @click="editCard(card)" @keydown.enter="editCard(card)"><div class="board-card-top"><div class="priority" :class="card.priority.toLowerCase()">{{ card.priority }}</div><span v-if="isAll && cardBoard(card)" class="board-card-board" :title="cardBoard(card)!.name"><span v-if="cardBoard(card)!.pathId" class="board-tab-dot" :style="{ backgroundColor: pathColor(cardBoard(card)!.pathId) }" aria-hidden="true"></span><span class="board-card-board-name">{{ cardBoard(card)!.name }}</span></span><TimerRunButton v-if="hasCardPlay(card)" class="board-card-play" :class="{ 'play-hidden': timerStore.isRunning }" :label="startSessionLabel(card.title)" :busy="timerStore.actionBusy" draggable="false" @click="onCardPlay($event, card)" @keydown.enter.stop @keydown.space.stop /></div><div v-if="cardLabels(card).length" class="board-card-labels"><span v-for="label in cardLabels(card)" :key="label.id" class="board-card-label" :style="label.color ? { '--label-color': label.color } : undefined">{{ label.name }}</span></div><h3 v-if="card.title">{{ card.title }}</h3><p v-if="card.startDate || card.dueDate" class="card-dates">{{ formatCardDates(card.startDate, card.dueDate) }}</p></article><div v-if="store.pageCursors[column.cursor] !== null" :ref="(element) => observeSentinel(column.cursor, element as Element | null)" class="load-more-sentinel" aria-hidden="true"></div><button v-if="store.pageErrors[column.cursor]" type="button" class="secondary page-retry" aria-label="Retry loading cards" @click="retryLoadMoreFor(column.cursor).catch(() => undefined)">Retry loading cards</button><p v-if="!columnCards(column).length" class="column-empty">No cards yet</p></section>
      </div></div>
    </template>
    <section v-else class="gantt" aria-labelledby="gantt-heading">
      <div class="gantt-heading"><div><h2 id="gantt-heading">Timeline</h2><p class="muted">The timeline uses the same active cards as Kanban. Date ranges are inclusive.</p></div><div class="gantt-controls"><button class="secondary" type="button" aria-label="Previous timeline window" @click="shiftGantt(-visibleDays.length)">←</button><label>From<input v-model="ganttFrom" type="date" aria-label="Timeline start date" @change="updateGanttRange" /></label><label>To<input v-model="ganttTo" type="date" aria-label="Timeline end date" @change="updateGanttRange" /></label><button class="secondary" type="button" aria-label="Next timeline window" @click="shiftGantt(visibleDays.length)">→</button></div></div>
      <div class="timeline-scroll" tabindex="0" aria-label="Board card timeline"><div class="timeline" :style="{ minWidth: `${timelineWidth}px` }"><div class="timeline-header"><span class="timeline-label">Card</span><div class="timeline-days" :style="{ gridTemplateColumns: `repeat(${visibleDays.length}, minmax(56px, 1fr))` }"><span v-for="day in visibleDays" :key="day">{{ day.slice(5) }}</span></div></div><div v-for="card in ganttCards" :key="card.id" class="timeline-row"><div class="timeline-label"><strong>{{ card.title }}</strong><small>{{ timelineLabel(card) }}</small></div><div class="timeline-track"><span v-for="day in visibleDays" :key="day" class="timeline-cell" :class="{ weekend: isWeekend(day) }"></span><button class="timeline-bar" :style="barStyle(card)" type="button" :aria-label="card.title ? undefined : 'Untitled card'" @click="editCard(card)">{{ card.title }}</button></div></div><p v-if="!ganttCards.length" class="board-empty">No dated active cards overlap this timeline window. Cards without dates stay in Kanban.</p></div></div>
    </section>
    <footer class="board-footer"><RouterLink class="link-button secondary with-icon" :to="{ path: '/board/archive', query: store.selectedId && !isAll ? { board: store.selectedId } : {} }"><v-icon :icon="mdiArchiveOutline" size="18" aria-hidden="true" />Archived items</RouterLink></footer>
    <div v-if="editing" class="dialog-backdrop" role="presentation" v-backdrop-close="() => closeEditor()"><section v-dialog-focus class="card-editor" :class="{ accented: draftAccent }" :style="{ '--card-accent': draftAccent }" role="dialog" aria-modal="true" aria-label="Edit card" tabindex="-1" @keydown.capture="noteLabelsMenu" @keydown.esc.prevent="escapeEditor" @keydown.meta.enter.prevent="closeEditor()" @keydown.ctrl.enter.prevent="closeEditor()">
      <div class="card-editor-header"><textarea v-model="draft.title" class="card-title-input" name="title" aria-label="Title" maxlength="240" rows="1" autocomplete="off" @keydown.enter.exact.prevent="cardEditor?.commands.focus('start')"></textarea><v-select v-if="!editingBoard?.pathId" v-model:menu="pathMenuOpen" class="card-path-picker" :model-value="draft.pathIds[0] || ''" :items="cardPathItems" item-title="name" item-value="id" name="cardPath" aria-label="Path" hide-details flat variant="solo-filled" density="compact" :menu-props="{ contentClass: 'card-path-menu', location: 'bottom start' }" @update:model-value="setDraftPath" /><TimerRunButton v-if="canStartSession(editing)" class="board-card-play" :label="startSessionLabel(draft.title)" :busy="timerStore.actionBusy" @click="onEditorPlay($event, editing, draft.title)" /><button class="icon-button quiet editor-close" type="button" aria-label="Close card" title="Close" @click="closeEditor()"><v-icon :icon="mdiClose" size="20" aria-hidden="true" /></button></div>
      <div v-if="isAll" class="card-meta">
        <select v-if="isAll" :value="cardBoardId(editing)" class="meta-field" name="board" aria-label="Board" @change="changeCardBoard(($event.target as HTMLSelectElement).value)"><option v-for="board in boards" :key="board.id" :value="board.id">{{ board.name }}</option></select>
        
        
      </div>
      <EditorContent v-if="cardEditor" class="card-body-editor" :class="RICH_TEXT_CLASS" :editor="cardEditor" />
      <p v-if="cardDateError" class="field-error" role="alert">{{ cardDateError }}</p>
      <p v-if="saveState === 'error'" class="field-error" role="alert">{{ saveError }} <button class="quiet link-like" type="button" @click="queueSave()">Retry</button><span v-if="closeAnyway"> Close again to discard.</span></p>
      <footer class="card-editor-footer"><div class="meta-dates"><VueDatePicker :dark="theme === 'dark'" :model-value="draftDates" :range="{ partialRange: true }" :formats="dateFormats" :time-config="{ enableTimePicker: false }" :action-row="{ showCancel: false, showSelect: true, selectBtnLabel: 'OK', showNow: false, showPreview: false }" :input-attrs="{ clearable: true }" :text-input="false" week-start="1" placeholder="Dates" :aria-labels="{ input: 'Card dates', clearInput: 'Clear card dates' }" teleport="body" @update:model-value="setDraftDates" /></div><select v-model="draft.priority" class="meta-field" name="priority" aria-label="Priority"><option v-for="priority in BOARD_PRIORITIES" :key="priority.value" :value="priority.value">{{ priority.label }}</option></select><select :value="editing.statusId" class="meta-field" name="status" aria-label="Status" @change="changeCardStatus(($event.target as HTMLSelectElement).value)"><template v-if="isAll"><optgroup :label="editingBoard?.name || 'This board'"><option v-for="status in editingOwnStatuses" :key="status.id" :value="status.id">{{ status.name }}</option></optgroup><optgroup v-if="editingOtherColumns.length" label="Other columns"><option v-for="column in editingOtherColumns" :key="column.key" :value="`column:${column.key}`">{{ column.name }}</option></optgroup></template><template v-else><option v-for="status in activeStatuses" :key="status.id" :value="status.id">{{ status.name }}</option></template></select><div ref="labelsPicker" class="card-labels-picker-wrap"><v-autocomplete v-model="draft.labelIds" v-model:menu="labelsMenuOpen" v-model:focused="labelsFocused" class="card-labels-picker" :items="labelMenuItems" item-title="name" item-value="id" multiple auto-select-first clear-on-select hide-details flat variant="solo-filled" density="compact" :placeholder="draft.labelIds.length ? undefined : 'Labels'" aria-label="Card labels" no-data-text="No matching labels" :menu-props="{ contentClass: 'card-labels-menu' }"><template #selection="{ item, index }"><v-chip v-if="index < visibleLabelCount" class="card-labels-chip" size="small" label closable :text="item.name" :close-label="`Remove ${item.name}`" @click:close="removeDraftLabel(item.id)" /><span v-else-if="index === visibleLabelCount" class="card-labels-more" :aria-label="`${draft.labelIds.length - visibleLabelCount} more labels`">+{{ draft.labelIds.length - visibleLabelCount }}</span></template></v-autocomplete><div ref="labelsMeasure" class="card-labels-measure" aria-hidden="true"><span v-for="label in draftLabels" :key="label.id" class="card-labels-measure-chip" data-measure-label>{{ label.name }}</span><span class="card-labels-more" data-measure-more>+{{ draftLabels.length }}</span></div></div><button class="icon-button quiet danger card-archive-button" type="button" aria-label="Archive card" title="Archive card" @click="requestArchiveCard(editing)"><v-icon :icon="mdiTrashCanOutline" size="20" aria-hidden="true" /></button></footer>
    </section></div>
  </section>
</template>

<style scoped src="./board.css"></style>
