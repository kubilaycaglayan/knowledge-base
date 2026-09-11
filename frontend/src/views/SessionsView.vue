<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { api } from "../lib/api";
import { formatDateTime } from "../lib/date";
import { formatTrackedDuration } from "../lib/format";
import PromptDialog from "../components/PromptDialog.vue";

type Path = { id: string; name: string; description?: string; status: string };
type Label = {
  id: string;
  name: string;
  color?: string | null;
};
type Session = {
  id: string;
  pathId?: string;
  labelIds?: string[];
  startedAt: string;
  endedAt?: string;
  durationSeconds?: number;
  description?: string;
  source: string;
  running?: boolean;
};
type Draft = {
  pathId: string;
  labelIds: string[];
  startedAt: string;
  endedAt: string;
  description: string;
  source: string;
};

const sessions = ref<Session[]>([]);
const paths = ref<Path[]>([]);
const labels = ref<Label[]>([]);
const editingId = ref("");
const draft = ref<Draft | null>(null);
const error = ref("");
const saving = ref(false);
const page = ref(1);
const totalPages = ref(1);
const totalSessions = ref(0);
const sources = ["WEB", "IOS", "CHROME_EXTENSION", "MANUAL", "IMPORT"];
const promptDialog = ref<InstanceType<typeof PromptDialog> | null>(null);

const pathFor = (id?: string) => paths.value.find((path) => path.id === id);
const labelFor = (id?: string) => labels.value.find((label) => label.id === id);
const sessionLabelIds = (session: Session) => session.labelIds || [];
const sessionLabelSummary = (session: Session) =>
  sessionLabelIds(session)
    .map((id) => {
      const label = labelFor(id);
      return label?.name || "Removed label";
    })
    .join(", ");
const availableLabels = computed(() => labels.value);
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
    const [history, loadedPaths, loadedLabels] = await Promise.all([
      api<{ sessions: Session[]; page: number; totalPages: number; totalSessions: number }>(`/time-entries?page=${nextPage - 1}&size=50`),
      api<Path[]>("/paths"),
      api<Label[]>("/labels?scope=TIME_ENTRY").then(value => value ?? api<Label[]>("/calendar/labels")).catch(() => api<Label[]>("/calendar/labels")),
    ]);
    sessions.value = history.sessions;
    page.value = history.page + 1;
    totalPages.value = history.totalPages;
    totalSessions.value = history.totalSessions;
    paths.value = loadedPaths;
    labels.value = loadedLabels;
  } catch {
    error.value = "Unable to load sessions.";
  }
}
function beginEdit(session: Session) {
  editingId.value = session.id;
  draft.value = {
    pathId: session.pathId || "",
    labelIds: session.labelIds || [],
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
        labelIds: draft.value.labelIds,
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
async function remove(session: Session) {
  const confirmation = await promptDialog.value!.open(
    "Remove this session? This cannot be undone.",
    "",
    { confirmation: true },
  );
  if (confirmation === null) return;
  try {
    await api(`/time-entries/${session.id}`, { method: "DELETE" });
    await load(page.value);
  } catch {
    error.value = "Could not remove this session.";
  }
}
onMounted(load);
</script>

<template>
  <PromptDialog ref="promptDialog" />
  <section>
    <p class="eyebrow">TIME TRACKING</p>
    <h1>Sessions</h1>
    <p class="lede">Every recorded session, with the newest one first.</p>
    <p v-if="error" class="notice" role="alert" aria-live="polite">{{ error }}</p>
    <div class="session-list" role="region" aria-label="Sessions">
      <article v-for="session in sessions" :key="session.id" class="card session-card">
        <div v-if="editingId !== session.id" class="session-heading">
          <div>
            <p class="eyebrow">{{ session.source }} · {{ sessionDate(session.startedAt) }}</p>
            <h2>{{ session.description || "Untitled session" }}</h2>
          </div>
          <button class="text-button" :disabled="session.running" @click="beginEdit(session)">
            {{ session.running ? "Stop to edit" : "Edit session" }}
          </button>
          <button v-if="!session.running" class="text-button danger" @click="remove(session)">
            Remove session
          </button>
        </div>
        <div v-if="editingId !== session.id" class="session-summary">
          <span>{{ duration(session) }}</span>
          <span>{{ pathFor(session.pathId)?.name || "Unassigned path" }}</span>
          <span>{{ sessionLabelSummary(session) || "Unassigned labels" }}</span>
        </div>
        <form v-else-if="draft" class="session-edit" @submit.prevent="save(session)">
          <label class="session-edit-path">Path<select v-model="draft.pathId" name="session-path" autocomplete="off" aria-label="Edit session path">
            <option value="">Unassigned</option>
            <option v-for="path in paths" :key="path.id" :value="path.id">{{ path.name }}</option>
          </select></label>
          <div class="session-edit-grid">
            <label class="session-edit-description">Description <span>(optional)</span><input v-model="draft.description" name="session-description" autocomplete="off" aria-label="Edit session description" placeholder="What did you work on…" /></label>
            <label>Labels<select v-model="draft.labelIds" name="session-labels" autocomplete="off" aria-label="Edit session labels" multiple>
              <option v-for="label in availableLabels" :key="label.id" :value="label.id">{{ label.name }}</option>
            </select></label>
            <label>Source<select v-model="draft.source" name="session-source" autocomplete="off" aria-label="Edit session source">
              <option v-for="source in sources" :key="source">{{ source }}</option>
            </select></label>
            <label>Started<input v-model="draft.startedAt" type="datetime-local" name="session-started-at" autocomplete="off" aria-label="Edit session start" required /></label>
            <label>Ended<input v-model="draft.endedAt" type="datetime-local" name="session-ended-at" autocomplete="off" aria-label="Edit session end" required /></label>
          </div>
          <div class="session-actions">
            <button class="primary" :disabled="saving">{{ saving ? "Saving…" : "Save session" }}</button>
            <button type="button" class="text-button" @click="cancelEdit">Cancel</button>
          </div>
        </form>
        <div v-if="editingId !== session.id && (pathFor(session.pathId) || sessionLabelIds(session).length)" class="session-context">
          <span v-if="pathFor(session.pathId)"><strong>Path:</strong> {{ pathFor(session.pathId)?.name }} · {{ pathFor(session.pathId)?.description || "No description" }}</span>
          <span v-if="sessionLabelIds(session).length"><strong>Labels:</strong> {{ sessionLabelSummary(session) }}</span>
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
