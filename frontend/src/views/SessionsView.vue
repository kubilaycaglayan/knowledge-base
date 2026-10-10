<script setup lang="ts">
import { computed, inject, onMounted, ref, watch } from "vue";
import { RouterLink, routeLocationKey, routerKey } from "vue-router";
import { storeToRefs } from "pinia";
import { api } from "../lib/api";
import { formatDateTime } from "../lib/date";
import { formatTrackedDuration } from "../lib/format";
import PromptDialog from "../components/PromptDialog.vue";
import FloatingTimeTracker from "../components/FloatingTimeTracker.vue";
import SessionEditForm, { type SessionDraft } from "../components/SessionEditForm.vue";
import SessionDialog from "../components/SessionDialog.vue";
import { useLabelsStore } from "../stores/labels";
import { usePathsStore } from "../stores/paths";
import {
  useSessionsStore,
  type Session,
  type SessionPage,
} from "../stores/sessions";
import { useReportsStore } from "../stores/reports";
import { useTimerStore, type Timer } from "../stores/timer";

type Path = {
  id: string;
  name: string;
  description?: string;
  status: string;
  color?: string | null;
};
type SessionGroup = { key: string; label: string; sessions: Session[] };

const sessions = ref<Session[]>([]);
const initialLoading = ref(true);
const pathsStore = usePathsStore();
const labelsStore = useLabelsStore();
const sessionsStore = useSessionsStore();
const reportsStore = useReportsStore();
const { paths } = storeToRefs(pathsStore);
const sessionLabels = computed(() => labelsStore.forScope("TIME_ENTRY"));
const editingId = ref("");
const error = ref("");
const saving = ref(false);
const page = ref(1);
const totalPages = ref(1);
const totalSessions = ref(0);
const promptDialog = ref<InstanceType<typeof PromptDialog> | null>(null);
const router = inject(routerKey, undefined);
const route = inject(routeLocationKey, undefined);
// /sessions/:id opens one session over the list, whichever page it is on.
const routeSessionId = computed(() => (typeof route?.params.id === "string" ? route.params.id : ""));
function closeSessionDialog() {
  if (router) void router.replace({ path: "/" });
}
async function sessionChanged() {
  sessionsStore.clearPages();
  reportsStore.clear();
  await load(page.value, true);
}

const pathFor = (id?: string) => paths.value.find((path) => path.id === id);
const sessionTitleStyle = (session: Session) => {
  const color = pathFor(session.pathId)?.color;
  return color ? { "--session-path-color": color } : undefined;
};
const labelFor = (id?: string) =>
  sessionLabels.value.find((label) => label.id === id);
const sessionLabelStyle = (labelId: string) => {
  const color = labelFor(labelId)?.color;
  return color ? { "--session-label-color": color } : undefined;
};
const sessionLabelIds = (session: Session) => session.labelIds || [];
const isoDateTime = (value: string) => new Date(value).toISOString();
const sessionDate = (iso: string) => formatDateTime(iso);
const duration = (session: Session) =>
  session.running
    ? "Running"
    : formatTrackedDuration(session.durationSeconds || 0);
const groupDuration = (group: SessionGroup) => {
  const totalMinutes = Math.floor(
    group.sessions.reduce(
      (total, session) => total + (session.durationSeconds || 0),
      0,
    ) / 60,
  );
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
};

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());
const sameDay = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();
const sessionGroupLabel = (startedAt: string) => {
  // Group ownership is based on the start instant. A session crossing a
  // boundary therefore stays with the earlier group and keeps its full
  // server-calculated duration there.
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
  if (
    date.getFullYear() === lastMonth.getFullYear() &&
    date.getMonth() === lastMonth.getMonth()
  )
    return "Last month";
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(date);
};
const sessionGroups = computed<SessionGroup[]>(() => {
  const groups: SessionGroup[] = [];
  for (const session of sessions.value) {
    const label = sessionGroupLabel(session.startedAt);
    const group = groups.at(-1);
    if (group?.label === label) {
      group.sessions.push(session);
    } else {
      groups.push({
        key: `${label}-${session.id}`,
        label,
        sessions: [session],
      });
    }
  }
  return groups;
});

const pageNumbers = computed(() =>
  Array.from({ length: totalPages.value }, (_, index) => index + 1),
);
async function load(nextPage = page.value, force = false) {
  try {
    const cacheKey = `${nextPage - 1}:50`;
    const cached = !force && sessionsStore.cachedPage(cacheKey);
    const [history, loadedPaths, loadedLabels] = await Promise.all([
      cached
        ? Promise.resolve(cached)
        : api<SessionPage>(`/time-entries?page=${nextPage - 1}&size=50`),
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
  } finally {
    initialLoading.value = false;
  }
}
function beginEdit(session: Session) {
  editingId.value = session.id;
  error.value = "";
}
function cancelEdit() {
  editingId.value = "";
}
async function save(session: Session, draft: SessionDraft) {
  if (!draft.startedAt || !draft.endedAt) {
    error.value = "A session needs both a start and an end time.";
    return;
  }
  if (saving.value) return;
  saving.value = true;
  try {
    await api(`/time-entries/${session.id}`, {
      method: "PUT",
      body: JSON.stringify({
        pathId: draft.pathId || null,
        labelIds: draft.labelIds,
        startedAt: isoDateTime(draft.startedAt),
        endedAt: isoDateTime(draft.endedAt),
        description: draft.description || null,
        source: draft.source,
      }),
    });
    cancelEdit();
    sessionsStore.clearPages();
    reportsStore.clear();
    await load(page.value, true);
  } catch {
    error.value =
      "Could not update this session. Check its time range and selections.";
  } finally {
    saving.value = false;
  }
}
async function startFromSession(session: Session) {
  if (session.running) return;
  try {
    const started = await api<Timer>("/timers", {
      method: "POST",
      body: JSON.stringify({
        pathId: session.pathId || null,
        labelIds: session.labelIds || [],
        description: session.description || null,
      }),
    });
    useTimerStore().setCurrent(started);
    sessionsStore.clearPages();
    await load(page.value, true);
  } catch {
    error.value =
      "Could not start a session from this session. Stop the active timer first.";
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
  <SessionDialog
    v-if="routeSessionId"
    :session-id="routeSessionId"
    :paths="paths"
    :labels="sessionLabels"
    @close="closeSessionDialog"
    @changed="sessionChanged"
  />
  <section>
    <h1>Sessions</h1>
    <p v-if="error" class="notice" role="alert" aria-live="polite">
      {{ error }}
    </p>
    <div class="session-list" role="region" aria-label="Sessions">
      <section
        v-for="group in sessionGroups"
        :key="group.key"
        class="session-group"
        :aria-labelledby="`session-group-${group.key}`"
      >
        <h2 :id="`session-group-${group.key}`" class="session-group-heading">
          <span>{{ group.label }}</span
          ><span class="session-group-duration">{{
            groupDuration(group)
          }}</span>
        </h2>
        <div class="session-group-list">
          <article
            v-for="session in group.sessions"
            :key="session.id"
            class="card session-card"
          >
            <button
              v-if="
                !session.running &&
                editingId !== session.id &&
                (pathFor(session.pathId) || sessionLabelIds(session).length)
              "
              class="session-restart-button"
              type="button"
              aria-label="Start again"
              title="Start again"
              @click="startFromSession(session)"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M3 12a9 9 0 1 0 3-6.7" />
                <path d="M3 4v6h6" />
              </svg>
            </button>
            <div v-if="editingId !== session.id" class="session-heading">
              <div>
                <h3
                  v-if="
                    pathFor(session.pathId) || sessionLabelIds(session).length
                  "
                  class="session-card-title"
                >
                  <span
                    v-if="pathFor(session.pathId)"
                    class="session-title-chip"
                    :style="sessionTitleStyle(session)"
                    >{{ pathFor(session.pathId)?.name }}</span
                  >
                  <div class="session-card-labels" aria-label="Session labels">
                    <span
                      v-for="labelId in sessionLabelIds(session)"
                      :key="labelId"
                      :style="sessionLabelStyle(labelId)"
                      >{{ labelFor(labelId)?.name || "Removed label" }}</span
                    >
                  </div>
                </h3>
                <p v-if="session.description" class="session-description">
                  {{ session.description }}
                </p>
              </div>
            </div>
            <div v-if="editingId !== session.id" class="session-card-footer">
              <div class="session-summary">
                <span>{{ duration(session) }}</span>
                <span
                  >{{ session.source }} ·
                  <RouterLink
                    v-if="router"
                    class="session-date-link"
                    :to="`/sessions/${session.id}`"
                    :aria-label="`Open session from ${sessionDate(session.startedAt)}`"
                    >{{ sessionDate(session.startedAt) }}</RouterLink
                  ><template v-else>{{ sessionDate(session.startedAt) }}</template></span
                >
              </div>
              <div class="session-card-actions">
                <button
                  class="text-button"
                  :disabled="session.running"
                  @click="beginEdit(session)"
                >
                  {{ session.running ? "Stop to edit" : "Edit" }}
                </button>
                <button
                  v-if="!session.running"
                  class="text-button danger"
                  @click="remove(session)"
                >
                  Remove
                </button>
              </div>
            </div>
            <SessionEditForm
              v-else
              :session="session"
              :paths="paths"
              :labels="sessionLabels"
              :saving="saving"
              @save="save(session, $event)"
              @cancel="cancelEdit"
            />
          </article>
        </div>
      </section>
      <p v-if="initialLoading" class="empty" role="status">Loading sessions…</p>
      <p v-else-if="!sessions.length && !error" class="empty">
        No sessions recorded yet.
      </p>
    </div>
    <nav
      v-if="totalSessions"
      class="session-pagination"
      aria-label="Session pages"
    >
      <button
        v-for="number in pageNumbers"
        :key="number"
        class="page-number"
        :aria-current="number === page ? 'page' : undefined"
        @click="load(number)"
      >
        {{ number }}
      </button>
    </nav>
  </section>
</template>
