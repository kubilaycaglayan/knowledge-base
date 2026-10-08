<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { useBoardsStore, type BoardCard, type BoardStatus } from "../stores/boards";

const store = useBoardsStore();
const { boards, statuses } = storeToRefs(store);
const route = useRoute(); const router = useRouter();
const error = ref(""), restoring = ref("");
function dismissError() { error.value = ""; store.error = ""; }
const archivedStatuses = computed(() => statuses.value.filter((status) => status.archived));
const boardName = computed(() => store.selected?.name || "");
// A bare /board reopens the remembered board state, with the board chosen here.
const backTo = { path: "/board" };
async function loadArchive() { await store.loadArchivedCards().catch(() => { error.value = "Could not load archived cards."; }); }
async function restoreBoard(id: string) { if (restoring.value) return; restoring.value = id; dismissError(); try { await store.archiveBoard(id, true); await store.loadBoards(true); } catch { error.value = "Could not restore board."; } finally { restoring.value = ""; } }
async function restoreStatus(status: BoardStatus) { if (restoring.value) return; restoring.value = status.id; dismissError(); try { await store.archiveStatus(status, true); await loadArchive(); } catch { error.value = "Could not restore status."; } finally { restoring.value = ""; } }
async function restoreCard(card: BoardCard) { if (restoring.value) return; restoring.value = card.id; dismissError(); try { await store.archiveCard(card, true); await store.loadBoard(); await loadArchive(); } catch { error.value = "Could not restore card."; } finally { restoring.value = ""; } }
// Search links name an archived card (?card=) or an archived board (?archivedBoard=, or a
// ?board= that is itself archived); that row is scrolled to and marked.
const highlightCard = ref(typeof route.query.card === "string" ? route.query.card : "");
const highlightBoard = ref(typeof route.query.archivedBoard === "string" ? route.query.archivedBoard : "");
function revealHighlight() {
  const id = highlightCard.value ? `archive-card-${highlightCard.value}` : highlightBoard.value ? `archive-board-${highlightBoard.value}` : "";
  const row = id ? document.getElementById(id) : null;
  row?.scrollIntoView({ block: "center" });
  row?.focus({ preventScroll: true });
}
onMounted(async () => {
  await store.loadBoards();
  const requested = typeof route.query.board === "string" ? route.query.board : "";
  const active = Boolean(requested) && boards.value.some((board) => board.id === requested);
  if (active) store.selectedId = requested;
  await Promise.all([store.loadBoards(true), store.loadBoard()]);
  if (!active && requested && store.archivedBoards.some((board) => board.id === requested)) highlightBoard.value = requested;
  else if (!active && !highlightBoard.value && store.selectedId && route.query.board !== store.selectedId) void router.replace({ path: "/board/archive", query: { board: store.selectedId } });
  await loadArchive();
  if (highlightCard.value && !store.archivedCards.some((card) => card.id === highlightCard.value)) highlightCard.value = "";
  await nextTick();
  revealHighlight();
});
</script>

<template>
  <section class="board-page archive-page" aria-labelledby="archive-heading">
    <header class="board-header">
      <div><p class="eyebrow">Workspace</p><h1 id="archive-heading">Archive</h1></div>
      <div class="board-actions"><RouterLink class="icon-button link-button secondary" :to="backTo" aria-label="Back to board" title="Back to board">←</RouterLink></div>
    </header>
    <p v-if="error || store.error" class="board-error" role="alert">{{ error || store.error }}<button type="button" class="error-dismiss" aria-label="Dismiss archive error" @click="dismissError">×</button></p>
    <section class="archived-list" aria-labelledby="archived-boards-heading">
      <h2 id="archived-boards-heading" class="muted">Archived boards</h2>
      <p v-if="!store.archivedBoards.length" class="column-empty">No archived boards.</p>
      <div v-for="board in store.archivedBoards" :id="`archive-board-${board.id}`" :key="board.id" class="archive-row" :class="{ 'archive-row-highlight': highlightBoard === board.id }" :tabindex="highlightBoard === board.id ? -1 : undefined"><strong>{{ board.name }}</strong><span v-if="board.pathId" class="archive-note">Returns when its path is restored</span><button v-else class="icon-button" type="button" :aria-label="`Restore ${board.name} board`" :title="`Restore ${board.name} board`" :disabled="Boolean(restoring) || store.boardMutations[board.id]" @click="restoreBoard(board.id)">↩</button></div>
    </section>
    <section class="archived-list" aria-labelledby="archived-statuses-heading">
      <h2 id="archived-statuses-heading" class="muted">Archived statuses<span v-if="boardName"> · {{ boardName }}</span></h2>
      <p v-if="!archivedStatuses.length" class="column-empty">No archived statuses.</p>
      <div v-for="status in archivedStatuses" :key="status.id" class="archive-row"><strong>{{ status.name }}</strong><button class="icon-button" type="button" :aria-label="`Restore ${status.name} status`" :title="`Restore ${status.name} status`" :disabled="Boolean(restoring)" @click="restoreStatus(status)">↩</button></div>
    </section>
    <section class="archived-list" aria-labelledby="archived-cards-heading">
      <h2 id="archived-cards-heading" class="muted">Archived cards<span v-if="boardName"> · {{ boardName }}</span></h2>
      <p v-if="!store.archivedCards.length" class="column-empty">No archived cards.</p>
      <div v-for="card in store.archivedCards" :id="`archive-card-${card.id}`" :key="card.id" class="archive-row" :class="{ 'archive-row-highlight': highlightCard === card.id }" :tabindex="highlightCard === card.id ? -1 : undefined"><strong>{{ card.title }}</strong><button class="icon-button" type="button" :aria-label="`Restore ${card.title || 'untitled card'}`" :title="`Restore ${card.title || 'untitled card'}`" :disabled="Boolean(restoring)" @click="restoreCard(card)">↩</button></div>
    </section>
  </section>
</template>

<style scoped src="./board.css"></style>
<style scoped>
.archive-row-highlight {
  border-radius: var(--workspace-radius);
  background: var(--workspace-selected);
  box-shadow: inset 3px 0 0 var(--workspace-selected-border);
}
.archive-row-highlight:focus {
  outline: none;
}
</style>
