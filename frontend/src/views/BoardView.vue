<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { useBoardsStore, type BoardCard, type BoardStatus } from "../stores/boards";
import { usePathsStore } from "../stores/paths";
import { useLabelsStore } from "../stores/labels";
import { addCalendarDays, barPosition, timelineDays } from "../lib/board-gantt";

const store = useBoardsStore();
const pathsStore = usePathsStore();
const labelsStore = useLabelsStore();
const { boards, statuses, cards, ganttCards, loading } = storeToRefs(store);
const route = useRoute(); const router = useRouter();
const view = computed(() => route.query.view === "gantt" ? "gantt" : "kanban");
const showArchived = ref(false), newBoard = ref(""), newCardTitle = ref(""), newStatus = ref(""), error = ref("");
function dismissError() { error.value = ""; store.error = ""; }
const editing = ref<BoardCard | null>(null), discardOpen = ref(false), originalDraft = ref(""), draft = ref({ title: "", body: "{}", priority: "MEDIUM" as BoardCard["priority"], startDate: "", dueDate: "", pathIds: [] as string[], labelIds: [] as string[] });
const editingStatusId = ref(""), statusDraft = ref(""), showArchivedCards = ref(false);
const pageObservers = new Map<string, IntersectionObserver>();
const today = new Date().toISOString().slice(0, 10);
const ganttFrom = ref(typeof route.query.from === "string" ? route.query.from : today);
const ganttTo = ref(typeof route.query.to === "string" ? route.query.to : addCalendarDays(ganttFrom.value, 13));
const visibleDays = computed(() => timelineDays(ganttFrom.value, ganttTo.value));
const timelineWidth = computed(() => Math.max(100, visibleDays.value.length * 56));
const isWeekend = (value: string) => [0, 6].includes(new Date(`${value}T00:00:00Z`).getUTCDay());
const activeStatuses = computed(() => statuses.value.filter((status) => !status.archived));
const cardsFor = (statusId: string) => cards.value.filter((card) => card.statusId === statusId && !card.archived).sort((a, b) => a.position - b.position);
const statusName = (statusId: string) => statuses.value.find((status) => status.id === statusId)?.name || "Status";
const cardAccent = (card: BoardCard) => pathsStore.activePaths.find((path) => card.pathIds.includes(path.id))?.color || undefined;
const barStyle = (card: BoardCard) => { const position = barPosition(card.startDate || card.dueDate, card.dueDate || card.startDate, visibleDays.value); return position ? { left: `${position.left}%`, width: `${position.width}%` } : {}; };
function selectBoard(id: string) { store.selectedId = id; void router.replace({ query: { ...route.query, board: id } }); void store.loadBoard(); }
function setView(next: string) { if (view.value === next) return; void router.push({ query: { ...route.query, view: next } }); }
function updateGanttRange() { if (!ganttFrom.value || !ganttTo.value || ganttTo.value < ganttFrom.value) { error.value = "Choose a valid inclusive date range."; return; } error.value = ""; void router.replace({ query: { ...route.query, view: "gantt", from: ganttFrom.value, to: ganttTo.value } }); void store.loadGantt(ganttFrom.value, ganttTo.value); }
function shiftGantt(amount: number) { ganttFrom.value = addCalendarDays(ganttFrom.value, amount); ganttTo.value = addCalendarDays(ganttTo.value, amount); updateGanttRange(); }
async function createBoard() { if (!newBoard.value.trim()) return; try { await store.createBoard(newBoard.value); newBoard.value = ""; await router.replace({ query: { ...route.query, board: store.selectedId } }); } catch { error.value = "Could not create board."; } }
async function createCard() { if (!store.selectedId) return; try { await store.createCard({ title: newCardTitle.value, body: "{}", priority: "MEDIUM" }); newCardTitle.value = ""; } catch { error.value = "Could not create card."; } }
function editCard(card: BoardCard) { editing.value = card; draft.value = { title: card.title, body: card.body, priority: card.priority, startDate: card.startDate || "", dueDate: card.dueDate || "", pathIds: [...card.pathIds], labelIds: [...card.labelIds] }; originalDraft.value = JSON.stringify(draft.value); discardOpen.value = false; }
function requestCloseEditor() { if (editing.value && JSON.stringify(draft.value) !== originalDraft.value) discardOpen.value = true; else editing.value = null; }
function discardChanges() { discardOpen.value = false; editing.value = null; }
async function saveCard() { if (!editing.value) return; try { await store.updateCard(editing.value, { ...draft.value, startDate: draft.value.startDate || undefined, dueDate: draft.value.dueDate || undefined }); editing.value = null; discardOpen.value = false; } catch { error.value = "Could not save card."; } }
async function addStatus() { if (!newStatus.value.trim()) return; try { await store.createStatus(newStatus.value); newStatus.value = ""; } catch { error.value = "Could not create status."; } }
function editStatus(status: BoardStatus) { editingStatusId.value = status.id; statusDraft.value = status.name; }
async function saveStatus(status: BoardStatus) { if (!statusDraft.value.trim()) return; try { await store.updateStatus(status, statusDraft.value); editingStatusId.value = ""; } catch { error.value = "Could not save status."; } }
async function moveCard(card: BoardCard, direction: number) { const currentIndex = activeStatuses.value.findIndex((status) => status.id === card.statusId); const next = activeStatuses.value[currentIndex + direction]; if (!next) return; try { await store.moveCard(card, next.id, cardsFor(next.id).length); } catch { error.value = "Could not move card. The change was rolled back."; } }
async function restoreArchivedCard(card: BoardCard) { try { await store.archiveCard(card, true); await store.loadBoard(); } catch { error.value = "Could not restore card."; } }
function observeSentinel(statusId: string, element: Element | null) { pageObservers.get(statusId)?.disconnect(); if (!element || typeof IntersectionObserver === "undefined" || store.pageCursors[statusId] === null) return; const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) void store.loadMore(statusId); }); observer.observe(element); pageObservers.set(statusId, observer); }
async function archiveCurrent() { if (!store.selectedId) return; await store.archiveBoard(store.selectedId); await router.replace({ query: {} }); }
async function toggleArchived() { showArchived.value = !showArchived.value; if (showArchived.value) await store.loadBoards(true); }
async function restoreBoard(id: string) { await store.archiveBoard(id, true); await store.loadBoards(true); }
onMounted(async () => { await Promise.all([store.loadBoards(), pathsStore.load(), labelsStore.loadScope("BOARD")]); const requested = typeof route.query.board === "string" ? route.query.board : ""; if (requested && boards.value.some((board) => board.id === requested)) store.selectedId = requested; await store.loadBoard(); if (view.value === "gantt") await store.loadGantt(ganttFrom.value, ganttTo.value); });
watch(() => store.selectedId, (id) => { if (id && route.query.board !== id) void router.replace({ query: { ...route.query, board: id } }); });
watch(view, (next) => { if (next === "gantt") void store.loadGantt(ganttFrom.value, ganttTo.value); });
onBeforeUnmount(() => pageObservers.forEach((observer) => observer.disconnect()));
</script>

<template>
  <section class="board-page" aria-labelledby="board-heading">
    <header class="board-header">
      <div><p class="eyebrow">Workspace</p><h1 id="board-heading">Boards</h1></div>
      <div class="board-actions"><button class="secondary" type="button" @click="toggleArchived">{{ showArchived ? "Active boards" : "Archived boards" }}</button><button v-if="store.selectedId" class="secondary" type="button" @click="archiveCurrent">Archive board</button></div>
    </header>
    <p v-if="error || store.error" class="board-error" role="alert">{{ error || store.error }}<button type="button" class="error-dismiss" aria-label="Dismiss board error" @click="dismissError">×</button></p>
    <div class="board-toolbar">
      <label class="board-select-label" for="board-select">Current board</label>
      <select id="board-select" :value="store.selectedId" @change="selectBoard(($event.target as HTMLSelectElement).value)"><option value="" disabled>Select a board…</option><option v-for="board in boards" :key="board.id" :value="board.id">{{ board.name }}</option></select>
      <div class="view-switch" role="group" aria-label="Board view"><button :class="{ selected: view === 'kanban' }" type="button" @click="setView('kanban')">Kanban</button><button :class="{ selected: view === 'gantt' }" type="button" @click="setView('gantt')">Gantt</button></div>
    </div>
    <form class="create-board" @submit.prevent="createBoard"><input v-model="newBoard" aria-label="New board name" name="boardName" placeholder="New board name…" maxlength="120" /><button type="submit">Create board</button></form>
    <div v-if="showArchived" class="archived-list"><p class="muted">Archived boards</p><p v-if="!store.archivedBoards.length">No archived boards.</p><div v-for="board in store.archivedBoards" :key="board.id" class="gantt-row"><strong>{{ board.name }}</strong><button type="button" @click="restoreBoard(board.id)">Restore</button></div></div>
    <div v-if="loading" class="board-empty" aria-live="polite">Loading board…</div>
    <div v-else-if="!store.selectedId" class="board-empty"><h2>Create your first board</h2><p>Keep projects, priorities, and dates together in one focused workspace.</p></div>
    <template v-else-if="view === 'kanban'">
      <form class="create-card" @submit.prevent="createCard"><input v-model="newCardTitle" aria-label="New card title" name="cardTitle" placeholder="Add a card…" /><button type="submit">Add card</button></form>
      <div class="status-create"><input v-model="newStatus" aria-label="New status name" placeholder="New status…" /><button type="button" @click="addStatus">Add status</button></div>
      <div class="kanban" tabindex="0" aria-label="Kanban board">
        <section v-for="status in activeStatuses" :key="status.id" class="kanban-column" :aria-labelledby="`status-${status.id}`" @dragover.prevent @drop="($event) => { const id = ($event as DragEvent).dataTransfer?.getData('text/plain'); const card = cards.find((item) => item.id === id); if (card) void store.moveCard(card, status.id, cardsFor(status.id).length); }"><header><div v-if="editingStatusId === status.id" class="status-edit"><input v-model="statusDraft" :aria-label="`Rename ${status.name}`" @keydown.enter.prevent="saveStatus(status)" /><button type="button" @click="saveStatus(status)">Save</button></div><h2 v-else :id="`status-${status.id}`">{{ status.name }}</h2><div class="column-tools"><span>{{ cardsFor(status.id).length }}</span><button type="button" :aria-label="`Rename ${status.name}`" @click="editStatus(status)">Rename</button><button type="button" :aria-label="`Archive ${status.name}`" @click="store.archiveStatus(status)">Archive</button></div></header><article v-for="card in cardsFor(status.id)" :key="card.id" class="board-card" :style="{ borderInlineStartColor: cardAccent(card) }" draggable="true" tabindex="0" @dragstart="($event) => ($event as DragEvent).dataTransfer?.setData('text/plain', card.id)" @click="editCard(card)" @keydown.enter="editCard(card)"><div class="priority" :class="card.priority.toLowerCase()">{{ card.priority }}</div><h3>{{ card.title || "Untitled card" }}</h3><p v-if="card.startDate || card.dueDate">{{ card.startDate || "Any date" }} → {{ card.dueDate || "Open" }}</p><div class="card-actions"><button type="button" aria-label="Move card to previous status" @click.stop="moveCard(card, -1)">←</button><button type="button" aria-label="Move card to next status" @click.stop="moveCard(card, 1)">→</button><button type="button" class="card-archive" :aria-label="`Archive ${card.title || 'untitled card'}`" @click.stop="store.archiveCard(card)">Archive</button></div></article><div v-if="store.pageCursors[status.id] !== null" :ref="(element) => observeSentinel(status.id, element as Element | null)" class="load-more-sentinel" aria-hidden="true"></div><p v-if="!cardsFor(status.id).length" class="column-empty">No cards yet</p></section>
      </div>
      <button class="secondary archive-toggle" type="button" @click="showArchivedCards = !showArchivedCards; showArchivedCards && store.loadArchivedCards()">{{ showArchivedCards ? "Hide archived cards" : "Show archived cards" }}</button><div v-if="showArchivedCards" class="archived-list"><p class="muted">Archived cards</p><p v-if="!store.archivedCards.length">No archived cards.</p><div v-for="card in store.archivedCards" :key="card.id" class="gantt-row"><strong>{{ card.title || "Untitled card" }}</strong><button type="button" @click="restoreArchivedCard(card)">Restore</button></div></div>
    </template>
    <section v-else class="gantt" aria-labelledby="gantt-heading">
      <div class="gantt-heading"><div><h2 id="gantt-heading">Timeline</h2><p class="muted">The timeline uses the same active cards as Kanban. Date ranges are inclusive.</p></div><div class="gantt-controls"><button class="secondary" type="button" aria-label="Previous timeline window" @click="shiftGantt(-visibleDays.length)">←</button><label>From<input v-model="ganttFrom" type="date" aria-label="Timeline start date" @change="updateGanttRange" /></label><label>To<input v-model="ganttTo" type="date" aria-label="Timeline end date" @change="updateGanttRange" /></label><button class="secondary" type="button" aria-label="Next timeline window" @click="shiftGantt(visibleDays.length)">→</button></div></div>
      <div class="timeline-scroll" tabindex="0" aria-label="Board card timeline"><div class="timeline" :style="{ minWidth: `${timelineWidth}px` }"><div class="timeline-header"><span class="timeline-label">Card</span><div class="timeline-days" :style="{ gridTemplateColumns: `repeat(${visibleDays.length}, minmax(56px, 1fr))` }"><span v-for="day in visibleDays" :key="day">{{ day.slice(5) }}</span></div></div><div v-for="card in ganttCards" :key="card.id" class="timeline-row"><div class="timeline-label"><strong>{{ card.title || "Untitled card" }}</strong><small>{{ statusName(card.statusId) }}</small></div><div class="timeline-track"><span v-for="day in visibleDays" :key="day" class="timeline-cell" :class="{ weekend: isWeekend(day) }"></span><button class="timeline-bar" :style="barStyle(card)" type="button" @click="editCard(card)">{{ card.title || "Untitled card" }}</button></div></div><p v-if="!ganttCards.length" class="board-empty">No dated active cards overlap this timeline window. Cards without dates stay in Kanban.</p></div></div>
    </section>
    <div v-if="editing" class="dialog-backdrop" role="presentation" @click.self="requestCloseEditor"><form class="card-editor" aria-labelledby="editor-title" @submit.prevent="saveCard"><h2 id="editor-title">Edit card</h2><label>Title<input v-model="draft.title" name="title" /></label><label>Body<textarea v-model="draft.body" name="body" rows="5" spellcheck="true" /></label><label>Priority<select v-model="draft.priority" name="priority"><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>URGENT</option></select></label><div class="date-fields"><label>Start date<input v-model="draft.startDate" type="date" name="startDate" /></label><label>Due date<input v-model="draft.dueDate" type="date" name="dueDate" /></label></div><fieldset><legend>Paths</legend><label v-for="path in pathsStore.activePaths" :key="path.id" class="check-row"><input v-model="draft.pathIds" type="checkbox" :value="path.id" />{{ path.name }}</label><p v-if="!pathsStore.activePaths.length" class="muted">No active paths.</p></fieldset><fieldset><legend>Board labels</legend><label v-for="label in labelsStore.forScope('BOARD')" :key="label.id" class="check-row"><input v-model="draft.labelIds" type="checkbox" :value="label.id" />{{ label.name }}</label><p v-if="!labelsStore.forScope('BOARD').length" class="muted">No BOARD labels.</p></fieldset><div class="editor-actions"><button class="secondary" type="button" @click="requestCloseEditor">Cancel</button><button type="submit">Save card</button></div></form><div v-if="discardOpen" class="confirm-dialog" role="alertdialog" aria-labelledby="discard-title"><h2 id="discard-title">Discard unsaved changes?</h2><p>Your card edits have not been saved.</p><div class="editor-actions"><button class="secondary" type="button" @click="discardOpen = false">Keep editing</button><button type="button" @click="discardChanges">Discard changes</button></div></div></div>
  </section>
</template>

<style scoped src="./board.css"></style>
