<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { api } from "../lib/api";
import { formatTrackedDuration } from "../lib/format";
import PromptDialog from "../components/PromptDialog.vue";
import { paletteColors } from "../lib/color-palette";
import FloatingTimeTracker from "../components/FloatingTimeTracker.vue";

type Path = { id: string; name: string; status: string };
type Label = { id: string; name: string; color?: string | null };
type Timer = {
  id: string;
  pathId?: string;
  labelIds?: string[];
  startedAt: string;
  endedAt?: string;
  description?: string;
  running?: boolean;
};
type Entry = {
  id: string;
  pathId?: string;
  labelIds?: string[];
  startedAt: string;
  endedAt?: string;
  durationSeconds?: number;
  description?: string;
};
type Stats = {
  todaySeconds: number;
  weekSeconds: number;
  monthSeconds: number;
  todayByPath: Record<string, number>;
  todayByLabel: Record<string, number>;
  weekByPath: Record<string, number>;
  weekByLabel: Record<string, number>;
};
type Result = { kind: string; id: string; title: string; detail?: string };

const paths = ref<Path[]>([]),
  labels = ref<Label[]>([]),
  timer = ref<Timer | null>(null),
  stats = ref<Stats | null>(null),
  history = ref<Entry[]>([]),
  results = ref<Result[]>([]);
const pathId = ref(""),
  labelIds = ref<string[]>([]),
  description = ref(""),
  timerStartedAt = ref(""),
  query = ref(""),
  error = ref(""),
  newTimerLabelName = ref("");
const timerNow = ref(Date.now());
const promptDialog = ref<InstanceType<typeof PromptDialog> | null>(null);
const elapsed = () =>
  timer.value
    ? Math.max(
        0,
        Math.floor((timerNow.value - Date.parse(timer.value.startedAt)) / 1000),
      )
    : 0;
const clock = (seconds: number) =>
  `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
const pathName = (id: string) =>
  paths.value.find((path) => path.id === id)?.name || id;
const labelName = (id: string) =>
  labels.value.find((label) => label.id === id)?.name || id;
const entryPathName = (entry: Entry) =>
  entry.pathId ? pathName(entry.pathId) : "Unassigned";
const shortDescription = (entry: Entry) => {
  const text = entry.description?.trim() || "Tracked session";
  return text.length > 72 ? `${text.slice(0, 72)}…` : text;
};
const activePaths = computed(() =>
  paths.value.filter((path) => path.status === "ACTIVE"),
);
const recentPaths = computed(() => {
  const seen = new Set<string>();
  const recentPathIds = history.value
    .map((entry) => entry.pathId)
    .filter((id): id is string => Boolean(id))
    .filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  return recentPathIds
    .map((id) => paths.value.find((path) => path.id === id))
    .filter((path): path is Path => Boolean(path && path.status === "ACTIVE"))
    .slice(0, 5);
});
const addPathOption = "__add_new_path__";
const timerLabels = computed(() => labels.value);
const localDateTime = (iso: string) => {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const isoDateTime = (value: string) => new Date(value).toISOString();
function applyTimer(value: Timer | null, resetIdleForm = true) {
  timer.value = value;
  timerNow.value = Date.now();
  if (value) {
    pathId.value = value.pathId || "";
    labelIds.value = value.labelIds || [];
    description.value = value.description || "";
    timerStartedAt.value = localDateTime(value.startedAt);
  } else if (resetIdleForm) {
    pathId.value = "";
    labelIds.value = [];
    description.value = "";
    timerStartedAt.value = "";
    newTimerLabelName.value = "";
  }
}
async function load(preserveIdleForm = false) {
  const loadId = ++latestLoad;
  try {
    const data = await Promise.all([
      api<Path[]>("/paths"),
      api<Label[]>("/labels?scope=TIME_ENTRY").then(value => value ?? api<Label[]>("/calendar/labels")).catch(() => api<Label[]>("/calendar/labels")),
      api<Timer | null>("/timers/current"),
      api<Stats>("/statistics"),
      api<Entry[]>("/time-entries"),
    ]);
    if (loadId !== latestLoad) return;
    paths.value = data[0];
    labels.value = data[1];
    const hadActiveTimer = Boolean(timer.value);
    applyTimer(data[2], !preserveIdleForm || hadActiveTimer);
    stats.value = data[3];
    history.value = data[4];
  } catch {
    error.value = "Unable to load your workspace.";
  }
}
async function toggle() {
  try {
    if (timer.value) {
      await api(`/timers/${timer.value.id}/stop`, {
        method: "POST",
        body: "{}",
      });
      applyTimer(null);
      await load();
    } else {
      applyTimer(
        await api<Timer>("/timers", {
          method: "POST",
          body: JSON.stringify({
            pathId: pathId.value || null,
            labelIds: labelIds.value,
            description: description.value || null,
          }),
        }),
      );
    }
  } catch {
    error.value =
      "Could not update the timer. Only one timer can run at a time.";
  }
}
async function configureTimer() {
  if (!timer.value || !timerStartedAt.value) return;
  try {
    const updated = await api<Timer>(`/timers/${timer.value.id}`, {
        method: "PUT",
        body: JSON.stringify({
          pathId: pathId.value || null,
          labelIds: labelIds.value,
          startedAt: isoDateTime(timerStartedAt.value),
          description: description.value || null,
        }),
      });
    applyTimer(updated.running === false ? null : updated);
    await load();
  } catch {
    error.value = "Could not save the active timer settings.";
  }
}
async function choosePath() {
  if (pathId.value !== addPathOption) {
    await configureTimer();
    return;
  }

  const name = (await promptDialog.value!.open("New path name"))?.trim();
  pathId.value = "";
  if (!name) return;

  try {
    const created = await api<Path>("/paths", {
      method: "POST",
      body: JSON.stringify({
        name,
        description: null,
        color: paletteColors[6],
      }),
    });
    await load();
    pathId.value = created.id;
    await configureTimer();
  } catch {
    error.value = "Could not create path.";
  }
}
async function chooseRecentPath(id: string) {
  pathId.value = id;
  await configureTimer();
}
async function cancel() {
  try {
    await api("/timers/cancel", { method: "POST", body: "{}" });
    applyTimer(null);
    await load();
  } catch {
    error.value = "Could not cancel the timer.";
  }
}
async function search() {
  if (!query.value.trim()) {
    results.value = [];
    return;
  }
  try {
    results.value = await api<Result[]>(
      `/search?q=${encodeURIComponent(query.value)}`,
    );
  } catch {
    error.value = "Search failed.";
  }
}
async function editEntry(entry: Entry) {
  const start = await promptDialog.value!.open(
    "Start (ISO time)",
    entry.startedAt,
  );
  if (!start) return;
  const end = await promptDialog.value!.open(
    "End (ISO time)",
    entry.endedAt || "",
  );
  if (!end) return;
  try {
    await api(`/time-entries/${entry.id}`, {
      method: "PUT",
      body: JSON.stringify({
        pathId: entry.pathId || null,
        labelIds: entry.labelIds || [],
        startedAt: new Date(start).toISOString(),
        endedAt: new Date(end).toISOString(),
        description: entry.description || null,
      }),
    });
    await load();
  } catch {
    error.value = "Could not edit time entry.";
  }
}
async function createTimerLabel() {
  if (!newTimerLabelName.value.trim()) return;
  try {
    const created = await api<Label>("/labels", {
      method: "POST",
      body: JSON.stringify({
        name: newTimerLabelName.value.trim(), scopes: ["TIME_ENTRY"],
        color: null,
      }),
    }) ?? await api<Label>("/calendar/labels", {
      method: "POST",
      body: JSON.stringify({ name: newTimerLabelName.value.trim(), color: null }),
    });
    newTimerLabelName.value = "";
    await load();
    labelIds.value = [created.id];
    await configureTimer();
  } catch {
    error.value = "Could not create the session label.";
  }
}
let timerTicker: number | undefined;
let timerSyncTicker: number | undefined;
let timerSyncInFlight = false;
let latestLoad = 0;

const sameTimer = (left: Timer | null, right: Timer | null) =>
  left?.id === right?.id &&
  left?.startedAt === right?.startedAt &&
  left?.endedAt === right?.endedAt &&
  left?.description === right?.description &&
  left?.pathId === right?.pathId &&
  JSON.stringify([...(left?.labelIds || [])].sort()) ===
    JSON.stringify([...(right?.labelIds || [])].sort()) &&
  left?.running === right?.running;

async function syncTimerState() {
  if (timerSyncInFlight) return;
  timerSyncInFlight = true;
  try {
    const serverTimer = await api<Timer | null>("/timers/current");
    if (sameTimer(timer.value, serverTimer)) return;

    // The timer endpoint is authoritative because another client (such as the
    // extension) may have started or stopped the session since this page loaded.
    applyTimer(serverTimer);
    await load();
  } catch {
    // A transient sync failure should not interrupt an otherwise usable page.
  } finally {
    timerSyncInFlight = false;
  }
}

onMounted(() => {
  void load();
  timerTicker = window.setInterval(() => {
    timerNow.value = Date.now();
  }, 1000);
  timerSyncTicker = window.setInterval(() => {
    void syncTimerState();
  }, 2000);
});
onUnmounted(() => {
  if (timerTicker) window.clearInterval(timerTicker);
  if (timerSyncTicker) window.clearInterval(timerSyncTicker);
});
</script>

<template>
  <div class="dashboard-page">
    <PromptDialog ref="promptDialog" appearance="flat" />

    <FloatingTimeTracker inline @changed="load(true)" />

    <section class="metrics-strip" aria-label="Activity summary">
      <div class="metric">
        <h2>Today</h2>
        <strong>{{ formatTrackedDuration(stats?.todaySeconds || 0) }}</strong>
      </div>
      <div class="metric">
        <h2>This week</h2>
        <strong>{{ formatTrackedDuration(stats?.weekSeconds || 0) }}</strong>
      </div>
      <div class="metric">
        <h2>This month</h2>
        <strong>{{ formatTrackedDuration(stats?.monthSeconds || 0) }}</strong>
      </div>
    </section>

    <div class="section-columns">
      <section class="workspace-section" aria-labelledby="path-time-heading">
        <div class="section-heading"><h2 id="path-time-heading">TIME BY PATH THIS WEEK</h2></div>
        <dl class="data-list">
          <div v-for="(seconds, id) in stats?.weekByPath" :key="id" class="data-row">
            <dt>{{ pathName(id) }}</dt><dd>{{ formatTrackedDuration(seconds) }}</dd>
          </div>
        </dl>
        <p v-if="!Object.keys(stats?.weekByPath || {}).length" class="empty-state">No path time yet.</p>
      </section>
      <section class="workspace-section" aria-labelledby="label-time-heading">
        <div class="section-heading"><h2 id="label-time-heading">TIME BY LABEL THIS WEEK</h2></div>
        <dl class="data-list">
          <div v-for="(seconds, id) in stats?.weekByLabel" :key="id" class="data-row">
            <dt>{{ labelName(id) }}</dt><dd>{{ formatTrackedDuration(seconds) }}</dd>
          </div>
        </dl>
        <p v-if="!Object.keys(stats?.weekByLabel || {}).length" class="empty-state">No label time yet.</p>
      </section>
    </div>

    <section class="workspace-section history-box" aria-labelledby="recent-sessions-heading">
      <div class="section-heading"><h2 id="recent-sessions-heading">RECENT SESSIONS</h2></div>
      <div v-if="history.length" class="data-list">
        <article v-for="entry in history" :key="entry.id" class="data-row history-row">
          <div>
            <strong>{{ shortDescription(entry) }}</strong>
            <span class="subtle">{{ entryPathName(entry) }} · {{ formatTrackedDuration(entry.durationSeconds || 0) }}</span>
          </div>
          <button v-if="entry.endedAt" type="button" class="text-button" @click="editEntry(entry)">Edit…</button>
        </article>
      </div>
      <p v-else class="empty-state">No recorded sessions yet.</p>
    </section>

    <section class="workspace-section search-box" aria-labelledby="search-heading">
      <div class="section-heading"><h2 id="search-heading">Retrieve knowledge</h2></div>
      <form class="inline-field search-form" @submit.prevent="search">
        <input v-model="query" type="search" name="knowledge-search" autocomplete="off" placeholder="Search paths, labels, notes, and activity…" aria-label="Search knowledge" />
        <button class="primary">Search</button>
      </form>
      <div class="data-list" aria-live="polite">
        <div v-for="result in results" :key="result.kind + result.id" class="data-row result-row">
          <span class="result-kind">{{ result.kind.toLowerCase() }}</span>
          <strong>{{ result.title }}</strong>
          <span class="subtle">{{ result.detail }}</span>
        </div>
      </div>
    </section>
    <p v-if="error" class="notice" role="alert" aria-live="polite">{{ error }}</p>
  </div>
</template>

<style scoped src="./dashboard.css"></style>
