<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { api } from "../lib/api";
import { formatDateTime } from "../lib/date";
import { formatTrackedDuration } from "../lib/format";

type Path = { id: string; name: string; description?: string; status: string };
type Item = {
  id: string;
  title: string;
  description?: string;
  status: string;
  progress?: number;
  pathIds?: string[];
};
type Session = {
  id: string;
  pathId?: string;
  itemId?: string;
  itemIds?: string[];
  startedAt: string;
  endedAt?: string;
  durationSeconds?: number;
  description?: string;
  source: string;
  running?: boolean;
};
type Draft = {
  pathId: string;
  itemIds: string[];
  startedAt: string;
  endedAt: string;
  description: string;
  source: string;
};

const sessions = ref<Session[]>([]);
const paths = ref<Path[]>([]);
const items = ref<Item[]>([]);
const editingId = ref("");
const draft = ref<Draft | null>(null);
const error = ref("");
const saving = ref(false);
const page = ref(1);
const totalPages = ref(1);
const totalSessions = ref(0);
const sources = ["WEB", "IOS", "CHROME_EXTENSION", "MANUAL", "IMPORT"];

const pathFor = (id?: string) => paths.value.find((path) => path.id === id);
const itemFor = (id?: string) => items.value.find((item) => item.id === id);
const sessionItemIds = (session: Session) =>
  session.itemIds?.length ? session.itemIds : session.itemId ? [session.itemId] : [];
const sessionItemSummary = (session: Session) =>
  sessionItemIds(session)
    .map((id) => {
      const item = itemFor(id);
      if (!item) return "Removed item";
      return `${item.title} · ${item.status}${item.progress !== undefined ? ` · ${item.progress}%` : ""}`;
    })
    .join(", ");
const availableItems = computed(() => {
  if (!draft.value?.pathId) return items.value;
  return items.value.filter((item) => item.pathIds?.includes(draft.value!.pathId));
});
const localDateTime = (iso?: string) => {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const isoDateTime = (value: string) => new Date(value).toISOString();
const sessionDate = (iso: string) => formatDateTime(iso);
const duration = (session: Session) =>
  session.running ? "Running" : formatTrackedDuration(session.durationSeconds || 0);

const pageNumbers = computed(() => Array.from({ length: totalPages.value }, (_, index) => index + 1));
async function load(nextPage = page.value) {
  try {
    const [history, loadedPaths, loadedItems] = await Promise.all([
      api<{ sessions: Session[]; page: number; totalPages: number; totalSessions: number }>(`/time-entries?page=${nextPage - 1}&size=50`),
      api<Path[]>("/paths"),
      api<Item[]>("/items"),
    ]);
    sessions.value = history.sessions;
    page.value = history.page + 1;
    totalPages.value = history.totalPages;
    totalSessions.value = history.totalSessions;
    paths.value = loadedPaths;
    items.value = loadedItems;
  } catch {
    error.value = "Unable to load sessions.";
  }
}
function beginEdit(session: Session) {
  editingId.value = session.id;
  draft.value = {
    pathId: session.pathId || "",
    itemIds: session.itemIds?.length ? session.itemIds : session.itemId ? [session.itemId] : [],
    startedAt: localDateTime(session.startedAt),
    endedAt: localDateTime(session.endedAt),
    description: session.description || "",
    source: session.source,
  };
  error.value = "";
}
function cancelEdit() {
  editingId.value = "";
  draft.value = null;
}
async function save(session: Session) {
  if (!draft.value || !draft.value.startedAt || !draft.value.endedAt) {
    error.value = "A session needs both a start and an end time.";
    return;
  }
  saving.value = true;
  try {
    await api(`/time-entries/${session.id}`, {
      method: "PUT",
      body: JSON.stringify({
        pathId: draft.value.pathId || null,
        itemIds: draft.value.itemIds,
        startedAt: isoDateTime(draft.value.startedAt),
        endedAt: isoDateTime(draft.value.endedAt),
        description: draft.value.description || null,
        source: draft.value.source,
      }),
    });
    cancelEdit();
    await load(page.value);
  } catch {
    error.value = "Could not update this session. Check its time range and selections.";
  } finally {
    saving.value = false;
  }
}
onMounted(load);
</script>

<template>
  <section>
    <p class="eyebrow">TIME TRACKING</p>
    <h1>Sessions</h1>
    <p class="lede">Every recorded session, with the newest one first.</p>
    <p v-if="error" class="notice" role="alert">{{ error }}</p>
    <div class="session-list" aria-label="Sessions">
      <article v-for="session in sessions" :key="session.id" class="card session-card">
        <div v-if="editingId !== session.id" class="session-heading">
          <div>
            <p class="eyebrow">{{ session.source }} · {{ sessionDate(session.startedAt) }}</p>
            <h2>{{ session.description || "Untitled session" }}</h2>
          </div>
          <button class="text-button" :disabled="session.running" @click="beginEdit(session)">
            {{ session.running ? "Stop to edit" : "Edit session" }}
          </button>
        </div>
        <div v-if="editingId !== session.id" class="session-summary">
          <span>{{ duration(session) }}</span>
          <span>{{ pathFor(session.pathId)?.name || "Unassigned path" }}</span>
          <span>{{ sessionItemSummary(session) || "Unassigned items" }}</span>
        </div>
        <form v-else-if="draft" class="session-edit" @submit.prevent="save(session)">
          <label>Description<input v-model="draft.description" aria-label="Edit session description" /></label>
          <div class="session-edit-grid">
            <label>Path<select v-model="draft.pathId" aria-label="Edit session path">
              <option value="">Unassigned</option>
              <option v-for="path in paths" :key="path.id" :value="path.id">{{ path.name }}</option>
            </select></label>
            <label>Items<select v-model="draft.itemIds" aria-label="Edit session item" multiple>
              <option value="">Unassigned</option>
              <option v-for="item in availableItems" :key="item.id" :value="item.id">{{ item.title }}</option>
            </select></label>
            <label>Source<select v-model="draft.source" aria-label="Edit session source">
              <option v-for="source in sources" :key="source">{{ source }}</option>
            </select></label>
            <label>Started<input v-model="draft.startedAt" type="datetime-local" aria-label="Edit session start" required /></label>
            <label>Ended<input v-model="draft.endedAt" type="datetime-local" aria-label="Edit session end" required /></label>
          </div>
          <div class="item-actions">
            <button class="primary" :disabled="saving">{{ saving ? "Saving…" : "Save session" }}</button>
            <button type="button" class="text-button" @click="cancelEdit">Cancel</button>
          </div>
        </form>
        <div v-if="editingId !== session.id && (pathFor(session.pathId) || itemFor(session.itemId))" class="session-context">
          <span v-if="pathFor(session.pathId)"><strong>Path:</strong> {{ pathFor(session.pathId)?.name }} · {{ pathFor(session.pathId)?.description || "No description" }}</span>
          <span v-if="session.itemIds?.length || session.itemId"><strong>Item:</strong> {{ sessionItemSummary(session) }}</span>
        </div>
      </article>
      <p v-if="!sessions.length && !error" class="empty">No sessions recorded yet.</p>
    </div>
    <nav v-if="totalSessions" class="session-pagination" aria-label="Session pages">
      <button v-for="number in pageNumbers" :key="number" class="page-number"
        :aria-current="number === page ? 'page' : undefined" @click="load(number)">
        {{ number }}
      </button>
    </nav>
  </section>
</template>
