<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { api } from "../lib/api";
import { formatTrackedDuration } from "../lib/format";
import PromptDialog from "../components/PromptDialog.vue";

type Path = { id: string; name: string; status: string };
type Item = { id: string; title: string; pathIds: string[] };
type Timer = {
  id: string;
  pathId?: string;
  itemId?: string;
  itemIds?: string[];
  startedAt: string;
  endedAt?: string;
  description?: string;
  running?: boolean;
};
type Entry = {
  id: string;
  pathId?: string;
  itemId?: string;
  itemIds?: string[];
  startedAt: string;
  endedAt?: string;
  durationSeconds?: number;
  description?: string;
};
type ProgressChange = {
  itemId: string;
  previousProgress: number;
  newProgress: number;
  changedAt: string;
};
type Stats = {
  todaySeconds: number;
  weekSeconds: number;
  monthSeconds: number;
  todayByPath: Record<string, number>;
  todayByItem: Record<string, number>;
  weekByPath: Record<string, number>;
  weekByItem: Record<string, number>;
  completedItems: number;
  activeItems: number;
  recentProgressChanges: ProgressChange[];
};
type Result = { kind: string; id: string; title: string; detail?: string };

const paths = ref<Path[]>([]),
  items = ref<Item[]>([]),
  timer = ref<Timer | null>(null),
  stats = ref<Stats | null>(null),
  history = ref<Entry[]>([]),
  results = ref<Result[]>([]);
const pathId = ref(""),
  itemId = ref(""),
  itemIds = ref<string[]>([]),
  description = ref(""),
  timerStartedAt = ref(""),
  query = ref(""),
  error = ref(""),
  newTimerItemTitle = ref("");
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
const itemName = (id: string) =>
  items.value.find((item) => item.id === id)?.title || id;
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
const timerItems = computed(() => items.value);
const localDateTime = (iso: string) => {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const isoDateTime = (value: string) => new Date(value).toISOString();
watch(itemIds, (value) => {
  itemId.value = value[0] || "";
});
function applyTimer(value: Timer | null, resetIdleForm = true) {
  timer.value = value;
  timerNow.value = Date.now();
  if (value) {
    pathId.value = value.pathId || "";
    itemIds.value = value.itemIds?.length
      ? value.itemIds
      : value.itemId
        ? [value.itemId]
        : [];
    itemId.value = itemIds.value[0] || value.itemId || "";
    description.value = value.description || "";
    timerStartedAt.value = localDateTime(value.startedAt);
  } else if (resetIdleForm) {
    pathId.value = "";
    itemIds.value = [];
    itemId.value = "";
    description.value = "";
    timerStartedAt.value = "";
    newTimerItemTitle.value = "";
  }
}
async function load(preserveIdleForm = false) {
  const loadId = ++latestLoad;
  try {
    const data = await Promise.all([
      api<Path[]>("/paths"),
      api<Item[]>("/items"),
      api<Timer | null>("/timers/current"),
      api<Stats>("/statistics"),
      api<Entry[]>("/time-entries"),
    ]);
    if (loadId !== latestLoad) return;
    paths.value = data[0];
    items.value = data[1];
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
            itemId: itemId.value || null,
            itemIds: itemIds.value,
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
          itemId: itemId.value || null,
          itemIds: itemIds.value,
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
        color: "#E8754E",
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
        itemId: entry.itemId || null,
        itemIds: entry.itemIds?.length
          ? entry.itemIds
          : entry.itemId
            ? [entry.itemId]
            : [],
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
async function createTimerItem() {
  if (!newTimerItemTitle.value.trim()) return;
  try {
    const created = await api<Item>("/items", {
      method: "POST",
      body: JSON.stringify({
        title: newTimerItemTitle.value,
        type: "CUSTOM",
        pathIds: pathId.value ? [pathId.value] : [],
        tags: [],
      }),
    });
    newTimerItemTitle.value = "";
    await load();
    itemId.value = created.id;
    itemIds.value = [created.id];
    await configureTimer();
  } catch {
    error.value = "Could not create the session item.";
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
  left?.itemId === right?.itemId &&
  JSON.stringify([...(left?.itemIds || [])].sort()) ===
    JSON.stringify([...(right?.itemIds || [])].sort()) &&
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
    <div class="page-heading">
      <div>
        <p class="section-label">PERSONAL KNOWLEDGE SYSTEM</p>
        <h1>Overview</h1>
      </div>
      <p class="page-summary">Collect what you’re learning. Track the work.</p>
    </div>

    <section class="session-grid workspace-section" aria-labelledby="focus-heading">
      <div class="section-heading">
        <h2 id="focus-heading">FOCUS TODAY</h2>
        <span class="session-status" :class="{ running: timer }">
          <span class="status-dot" aria-hidden="true"></span>
          {{ timer ? "Session running" : "Ready to focus" }}
        </span>
      </div>
      <div class="session-workspace">
        <div class="focus">
          <strong class="timer-clock" role="timer" aria-live="off" aria-label="Elapsed session time">{{ timer ? clock(elapsed()) : "00:00:00" }}</strong>
          <p class="timer-summary">{{ timer?.description || "Choose a path or item to begin." }}</p>
          <div class="session-actions">
            <button class="primary" @click="toggle">
              <span class="timer-action-icon" :class="{ stop: timer }" aria-hidden="true"></span>
              {{ timer ? "Stop session" : "Start a session" }}
            </button>
            <button v-if="timer" class="text-button danger" @click="cancel">Cancel</button>
          </div>
        </div>
        <div class="session-fields">
          <div class="field">
            <label for="timer-path">Path</label>
            <select id="timer-path" v-model="pathId" name="timer-path" autocomplete="off" aria-label="Timer path" @focus="load(true)" @change="choosePath">
              <option value="">Choose a path</option>
              <option v-for="path in activePaths" :key="path.id" :value="path.id">{{ path.name }}</option>
              <option :value="addPathOption">＋ Add a new path…</option>
            </select>
            <div v-if="recentPaths.length" class="recent-paths" aria-label="Recently used paths">
              <span>Recent</span>
              <button
                v-for="path in recentPaths"
                :key="path.id"
                type="button"
                class="recent-path"
                :class="{ selected: path.id === pathId }"
                :aria-pressed="path.id === pathId"
                :aria-label="`Use ${path.name}`"
                @click="chooseRecentPath(path.id)"
              >{{ path.name }}</button>
            </div>
          </div>
          <div class="field">
            <div class="field-heading">
              <label for="timer-items">Items</label>
              <span class="subtle">{{ timerItems.length }} available</span>
            </div>
            <v-select
              id="timer-items"
              v-model="itemIds"
              :items="timerItems"
              item-title="title"
              item-value="id"
              label="Choose an item"
              aria-label="Timer item"
              name="timer-items"
              autocomplete="off"
              class="workspace-select"
              menu-icon=""
              :menu-props="{ contentClass: 'workspace-menu' }"
              multiple
              chips
              closable-chips
              variant="outlined"
              density="compact"
              hide-details
              @focus="load(true)"
              @update:model-value="configureTimer"
            >
              <template #item="{ props }">
                <v-list-item v-bind="props" class="workspace-option" role="option">
                  <template #prepend="{ isSelected }">
                    <span class="option-check" :class="{ checked: isSelected }" aria-hidden="true">{{ isSelected ? "✓" : "" }}</span>
                  </template>
                </v-list-item>
              </template>
              <template #append-inner>
                <svg class="select-chevron" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" />
                </svg>
              </template>
              <template #chip="{ item, props }">
                <v-chip v-bind="props" :text="item.title" closable size="small">
                  <template #close>×</template>
                </v-chip>
              </template>
            </v-select>
            <div class="inline-field">
              <input
                v-model="newTimerItemTitle"
                name="new-session-item"
                autocomplete="off"
                placeholder="New item for this session…"
                aria-label="New session item title"
              />
              <button class="text-button" :disabled="!newTimerItemTitle.trim()" @click="createTimerItem">Create item</button>
            </div>
          </div>
          <div class="field field-wide">
            <label for="timer-description">Description <span class="subtle">Optional</span></label>
            <textarea
              id="timer-description"
              v-model="description"
              name="timer-description"
              autocomplete="off"
              rows="2"
              placeholder="What are you working on…"
              aria-label="Timer description"
              @change="configureTimer"
            ></textarea>
          </div>
          <div v-if="timer" class="field field-wide">
            <label for="timer-start">Started at</label>
            <input id="timer-start" v-model="timerStartedAt" name="timer-start" autocomplete="off" type="datetime-local" aria-label="Timer start" @change="configureTimer" />
          </div>
        </div>
      </div>
    </section>

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
      <div class="metric">
        <h2>Completed items</h2>
        <strong>{{ stats?.completedItems || 0 }} <span class="subtle">{{ stats?.activeItems || 0 }} active</span></strong>
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
      <section class="workspace-section" aria-labelledby="item-time-heading">
        <div class="section-heading"><h2 id="item-time-heading">TIME BY ITEM THIS WEEK</h2></div>
        <dl class="data-list">
          <div v-for="(seconds, id) in stats?.weekByItem" :key="id" class="data-row">
            <dt>{{ itemName(id) }}</dt><dd>{{ formatTrackedDuration(seconds) }}</dd>
          </div>
        </dl>
        <p v-if="!Object.keys(stats?.weekByItem || {}).length" class="empty-state">No item time yet.</p>
      </section>
    </div>

    <div class="section-columns activity-columns">
      <section class="workspace-section history-box" aria-labelledby="history-heading">
        <div class="section-heading"><h2 id="history-heading">Recent time entries</h2></div>
        <ul class="data-list">
          <li v-for="entry in history.slice(0, 8)" :key="entry.id" class="data-row entry-row">
            <div class="entry-details">
              <strong>{{ entryPathName(entry) }}</strong>
              <span class="subtle" :title="entry.description">{{ shortDescription(entry) }}</span>
            </div>
            <span class="duration">{{ formatTrackedDuration(entry.durationSeconds || 0) }}</span>
            <button class="text-button" :aria-label="`Edit ${entryPathName(entry)} session`" @click="editEntry(entry)">Edit</button>
          </li>
        </ul>
        <p v-if="!history.length" class="empty-state">No recorded sessions yet.</p>
      </section>
      <section class="workspace-section" aria-labelledby="progress-heading">
        <div class="section-heading"><h2 id="progress-heading">Recent progress changes</h2></div>
        <dl class="data-list">
          <div v-for="change in stats?.recentProgressChanges || []" :key="change.itemId + change.changedAt" class="data-row">
            <dt>{{ itemName(change.itemId) }}</dt>
            <dd>{{ change.previousProgress }}% <span class="subtle">→</span> {{ change.newProgress }}%</dd>
          </div>
        </dl>
        <p v-if="!stats?.recentProgressChanges?.length" class="empty-state">No progress changes yet.</p>
      </section>
    </div>

    <section class="workspace-section search-box" aria-labelledby="search-heading">
      <div class="section-heading"><h2 id="search-heading">Retrieve knowledge</h2></div>
      <form class="inline-field search-form" @submit.prevent="search">
        <input v-model="query" type="search" name="knowledge-search" autocomplete="off" placeholder="Search paths, items, notes, and activity…" aria-label="Search knowledge" />
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
