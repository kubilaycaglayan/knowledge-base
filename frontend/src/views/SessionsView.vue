<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { api } from "../lib/api";
import { formatDateTime } from "../lib/date";
import { formatTrackedDuration } from "../lib/format";
import PromptDialog from "../components/PromptDialog.vue";
import FloatingTimeTracker from "../components/FloatingTimeTracker.vue";
import { useLabelsStore } from "../stores/labels";
import { usePathsStore } from "../stores/paths";
import { useSessionsStore, type Session, type SessionPage } from "../stores/sessions";
import { useReportsStore } from "../stores/reports";

type Path = { id: string; name: string; description?: string; status: string; color?: string | null };
type Label = {
  id: string;
  name: string;
  color?: string | null;
  scopes: ("NOTE" | "CALENDAR" | "TIME_ENTRY")[];
};
type Draft = {
  pathId: string;
  labelIds: string[];
  startedAt: string;
  endedAt: string;
  description: string;
  source: string;
};
type SessionGroup = { key: string; label: string; sessions: Session[] };

const sessions = ref<Session[]>([]);
const pathsStore = usePathsStore();
const labelsStore = useLabelsStore();
const sessionsStore = useSessionsStore();
const reportsStore = useReportsStore();
const { paths } = storeToRefs(pathsStore);
const sessionLabels = computed(() => labelsStore.forScope("TIME_ENTRY"));
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
const sessionTitleStyle = (session: Session) => {
  const color = pathFor(session.pathId)?.color;
  return color ? { "--session-path-color": color } : undefined;
};
const labelFor = (id?: string) => sessionLabels.value.find((label) => label.id === id);
const sessionLabelStyle = (labelId: string) => {
  const color = labelFor(labelId)?.color;
  return color ? { "--session-label-color": color } : undefined;
};
const sessionLabelIds = (session: Session) => session.labelIds || [];
const availableLabels = sessionLabels;
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

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());
const sameDay = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();
const sessionGroupLabel = (startedAt: string) => {
  const date = startOfDay(new Date(startedAt));
  const today = startOfDay(new Date());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const thisWeekStart = new Date(today);
  thisWeekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(thisWeekStart.getDate() - 7);
  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);

  if (sameDay(date, today)) return "Today";
  if (sameDay(date, yesterday)) return "Yesterday";
  if (date >= thisWeekStart) return "This week";
  if (date >= lastWeekStart) return "Last week";
  if (date.getFullYear() === lastMonth.getFullYear() && date.getMonth() === lastMonth.getMonth()) return "Last month";
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(date);
};
const sessionGroups = computed<SessionGroup[]>(() => {
  const groups: SessionGroup[] = [];
  for (const session of sessions.value) {
    const label = sessionGroupLabel(session.startedAt);
    const group = groups.at(-1);
    if (group?.label === label) {
      group.sessions.push(session);
    } else {
      groups.push({ key: `${label}-${session.id}`, label, sessions: [session] });
    }
  }
  return groups;
});

const pageNumbers = computed(() => Array.from({ length: totalPages.value }, (_, index) => index + 1));
async function load(nextPage = page.value, force = false) {
  try {
    const cacheKey = `${nextPage - 1}:50`;
    const cached = !force && sessionsStore.cachedPage(cacheKey);
    const [history, loadedPaths, loadedLabels] = await Promise.all([
      cached ? Promise.resolve(cached) : api<SessionPage>(`/time-entries?page=${nextPage - 1}&size=50`),
      pathsStore.load(),
      labelsStore.loadScope("TIME_ENTRY"),
    ]);
    sessionsStore.setPage(cacheKey, history);
    sessions.value = history.sessions;
    page.value = history.page + 1;
    totalPages.value = history.totalPages;
    totalSessions.value = history.totalSessions;
    void loadedPaths;
    labelsStore.setAll(loadedLabels, "TIME_ENTRY");
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
function addSessionLabel(event: Event) {
  const select = event.target as HTMLSelectElement;
  const labelId = select.value;
  if (labelId && draft.value && !draft.value.labelIds.includes(labelId)) {
    draft.value.labelIds = [...draft.value.labelIds, labelId];
  }
  select.value = "";
}
function removeSessionLabel(labelId: string) {
  if (draft.value) {
    draft.value.labelIds = draft.value.labelIds.filter((id) => id !== labelId);
  }
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
    sessionsStore.clearPages();
    reportsStore.clear();
    await load(page.value, true);
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
    sessionsStore.clearPages();
    reportsStore.clear();
    await load(page.value, true);
  } catch {
    error.value = "Could not remove this session.";
  }
}
onMounted(load);
</script>

<template>
  <FloatingTimeTracker inline @changed="load(1, true)" />
  <PromptDialog ref="promptDialog" />
  <section>
    <p v-if="error" class="notice" role="alert" aria-live="polite">{{ error }}</p>
    <div class="session-list" role="region" aria-label="Sessions">
      <section v-for="group in sessionGroups" :key="group.key" class="session-group" :aria-labelledby="`session-group-${group.key}`">
        <h2 :id="`session-group-${group.key}`" class="session-group-heading">{{ group.label }}</h2>
        <div class="session-group-list">
      <article v-for="session in group.sessions" :key="session.id" class="card session-card">
        <div v-if="editingId !== session.id" class="session-heading">
          <div>
            <h3 v-if="pathFor(session.pathId)"><span class="session-title-chip" :style="sessionTitleStyle(session)">{{ pathFor(session.pathId)?.name }}</span></h3>
            <div class="session-card-labels" aria-label="Session labels">
              <span v-for="labelId in sessionLabelIds(session)" :key="labelId" :style="sessionLabelStyle(labelId)">{{ labelFor(labelId)?.name || "Removed label" }}</span>
            </div>
            <p v-if="session.description" class="session-description">{{ session.description }}</p>
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
          <span>{{ session.source }} · {{ sessionDate(session.startedAt) }}</span>
        </div>
        <form v-else-if="draft" class="session-edit" @submit.prevent="save(session)">
          <label class="session-edit-path">Path<select v-model="draft.pathId" name="session-path" autocomplete="off" aria-label="Edit session path">
            <option value="">Unassigned</option>
            <option v-for="path in paths" :key="path.id" :value="path.id">{{ path.name }}</option>
          </select></label>
          <div class="session-edit-grid">
            <label class="session-edit-description">Description <span>(optional)</span><input v-model="draft.description" name="session-description" autocomplete="off" aria-label="Edit session description" placeholder="What did you work on…" /></label>
            <fieldset class="session-edit-labels">
              <legend>Labels</legend>
              <div class="session-label-picker">
                <div v-if="draft.labelIds.length" class="session-label-chips" aria-label="Selected session labels">
                  <button v-for="labelId in draft.labelIds" :key="labelId" type="button" :aria-label="`Remove ${labelFor(labelId)?.name || 'removed label'}`" @click="removeSessionLabel(labelId)">
                    {{ labelFor(labelId)?.name || "Removed label" }} <span aria-hidden="true">×</span>
                  </button>
                </div>
                <select name="session-labels" autocomplete="off" aria-label="Add session label" @change="addSessionLabel">
                  <option value="">Add a label…</option>
                  <option v-for="label in availableLabels.filter((label) => !draft.labelIds.includes(label.id))" :key="label.id" :value="label.id">{{ label.name }}</option>
                </select>
              </div>
            </fieldset>
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
      </article>
        </div>
      </section>
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
