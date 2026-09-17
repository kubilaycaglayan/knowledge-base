<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { api } from "../lib/api";
import { formatDate } from "../lib/date";
import { formatTrackedDuration } from "../lib/format";
import PromptDialog from "../components/PromptDialog.vue";
import MergePathDialog from "../components/MergePathDialog.vue";
import ColorPalette from "../components/ColorPalette.vue";
import { paletteColors } from "../lib/color-palette";
import { vDialogFocus } from "../lib/dialog-focus";
import { useLabelsStore } from "../stores/labels";
import { usePathsStore, type Path as StorePath } from "../stores/paths";
import { useReportsStore } from "../stores/reports";

type Path = StorePath & {
  id: string;
  name: string;
  description?: string;
  color?: string;
  status: string;
};
type Label = { id: string; name: string; color?: string | null };
type Activity = {
  id: string;
  timeEntryId?: string;
  type?: string;
  title: string;
  detail?: string;
  occurredAt: string;
  labelIds?: string[];
};
type Summary = {
  path: Path;
  trackedSeconds: number;
  recentActivity: Activity[];
};
type DescriptionPart = { text: string; url?: string };
type ActivityGroup = { key: string; label: string; activities: Activity[] };
type SessionDraft = {
  pathId: string;
  labelIds: string[];
  startedAt: string;
  endedAt: string;
  description: string;
  source: string;
};
const colors = paletteColors;
const pathsStore = usePathsStore();
const labelsStore = useLabelsStore();
const reportsStore = useReportsStore();
const { paths } = storeToRefs(pathsStore);
const sessionLabels = computed(() => labelsStore.forScope("TIME_ENTRY"));
const summaries = ref<Record<string, Summary>>({}),
  name = ref(""),
  description = ref(""),
  selectedColor = ref(colors[0]),
  error = ref(""),
  addDialogOpen = ref(false);
const editingId = ref(""),
  editName = ref(""),
  editDescription = ref(""),
  editColor = ref(colors[0]);
const selectedColorOpen = ref(false);
const editColorOpen = ref(false);
const promptDialog = ref<InstanceType<typeof PromptDialog> | null>(null);
const pendingDelete = ref<Path | null>(null);
const mergeSource = ref<Path | null>(null);
const historyPath = ref<Path | null>(null);
const editingSession = ref<Activity | null>(null);
const sessionDraft = ref<SessionDraft | null>(null);
const savingSession = ref(false);
const sessionSources = ["WEB", "IOS", "CHROME_EXTENSION", "MANUAL", "IMPORT"];
const merging = ref(false);
const draggingId = ref("");
let pendingDeleteTimer: ReturnType<typeof setTimeout> | undefined;
const activityDuration = (title: string) => {
  const match = title.match(/^Tracked (\d+) seconds$/);
  return match ? formatTrackedDuration(Number(match[1])) : "";
};
const labelFor = (id?: string) =>
  sessionLabels.value.find((label) => label.id === id);
const activityLabelIds = (activity: Activity) => activity.labelIds || [];
const linkPattern = /https?:\/\/[^\s<>]+/g;
function linkParts(text?: string): DescriptionPart[] {
  if (!text) return [];
  const parts: DescriptionPart[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(linkPattern)) {
    const url = match[0];
    const start = match.index ?? 0;
    const trailing = url.match(/[),.!?;:]+$/)?.[0] || "";
    const cleanUrl = trailing ? url.slice(0, -trailing.length) : url;
    if (start > lastIndex) parts.push({ text: text.slice(lastIndex, start) });
    parts.push({ text: cleanUrl, url: cleanUrl });
    if (trailing) parts.push({ text: trailing });
    lastIndex = start + url.length;
  }
  if (lastIndex < text.length) parts.push({ text: text.slice(lastIndex) });
  return parts;
}
function activityDescriptionParts(event: Activity): DescriptionPart[] {
  return [
    /^Tracked \d+ seconds$/.test(event.title) ? undefined : event.title,
    event.detail,
  ]
    .filter((value): value is string => Boolean(value))
    .flatMap((value, index, values) => [
      ...(index ? [{ text: " · " }] : []),
      ...linkParts(value),
    ]);
}
function recentActivity(pathId: string) {
  const activity = summaries.value[pathId]?.recentActivity || [];
  const stoppedTimers = activity.filter(
    (event) => event.type === "TIMER_STOPPED",
  );
  return activity.filter((event) => {
    if (event.type !== "TIMER_STARTED") return true;
    return !stoppedTimers.some(
      (stopped) =>
        stopped.detail === event.detail &&
        Date.parse(stopped.occurredAt) >= Date.parse(event.occurredAt),
    );
  });
}
const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());
const sameDay = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();
function activityGroupLabel(occurredAt: string) {
  const date = startOfDay(new Date(occurredAt));
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
}
function historyActivityGroups(pathId: string): ActivityGroup[] {
  const groups: ActivityGroup[] = [];
  for (const activity of recentActivity(pathId)) {
    const label = activityGroupLabel(activity.occurredAt);
    const group = groups.at(-1);
    if (group?.label === label) {
      group.activities.push(activity);
    } else {
      groups.push({
        key: `${label}-${activity.id}`,
        label,
        activities: [activity],
      });
    }
  }
  return groups;
}
async function load(force = false) {
  try {
    await Promise.all([
      pathsStore.load(force),
      labelsStore.loadScope("TIME_ENTRY", force),
    ]);
  } catch {
    error.value = "Unable to load paths.";
  }
}
async function add() {
  if (!name.value.trim()) {
    error.value = "Enter a path name.";
    return;
  }
  try {
    const created = await api<Path>("/paths", {
      method: "POST",
      body: JSON.stringify({
        name: name.value,
        description: description.value || null,
        color: selectedColor.value,
      }),
    });
    pathsStore.add(created);
    reportsStore.clear();
    name.value = "";
    description.value = "";
    selectedColor.value = colors[0];
    selectedColorOpen.value = false;
    addDialogOpen.value = false;
    await load();
  } catch {
    error.value = "Could not create path.";
  }
}
async function togglePinned(path: Path) {
  try {
    const saved = await api<Path>(`/paths/${path.id}/pin`, {
      method: "POST",
      body: JSON.stringify({ pinned: !path.pinned }),
    });
    pathsStore.setPinned(saved);
    await load(true);
  } catch {
    error.value = "Could not update the pinned path.";
  }
}
async function movePath(path: Path, target: Path) {
  if (path.id === target.id) return;
  const ordered = [...paths.value];
  const from = ordered.findIndex((value) => value.id === path.id);
  const to = ordered.findIndex((value) => value.id === target.id);
  ordered.splice(from, 1);
  ordered.splice(to, 0, path);
  try {
    await api("/paths/order", {
      method: "PUT",
      body: JSON.stringify({ pathIds: ordered.map((value) => value.id) }),
    });
    pathsStore.setOrder(ordered);
  } catch {
    error.value = "Could not reorder paths.";
  }
}
function openAddDialog() {
  error.value = "";
  selectedColorOpen.value = false;
  addDialogOpen.value = true;
}
function closeAddDialog() {
  addDialogOpen.value = false;
  selectedColorOpen.value = false;
  error.value = "";
}
async function loadSummary(path: Path) {
  try {
    summaries.value[path.id] = await api<Summary>(`/paths/${path.id}/summary`);
  } catch {
    error.value = "Could not load path history.";
  }
}
async function inspect(path: Path) {
  if (!summaries.value[path.id]) await loadSummary(path);
  if (!summaries.value[path.id]) return;
  historyPath.value = path;
  void nextTick(() =>
    document.querySelector<HTMLElement>(".path-history-dialog")?.focus(),
  );
}
function closeHistory() {
  historyPath.value = null;
}
const localDateTime = (iso?: string) => {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const isoDateTime = (value: string) => new Date(value).toISOString();
async function editSession(event: Activity) {
  if (!event.timeEntryId) return;
  try {
    const session = await api<{
      pathId?: string;
      labelIds?: string[];
      startedAt: string;
      endedAt?: string;
      description?: string;
      source: string;
    }>(`/time-entries/${event.timeEntryId}`);
    editingSession.value = event;
    sessionDraft.value = {
      pathId: session.pathId || historyPath.value?.id || "",
      labelIds: session.labelIds || [],
      startedAt: localDateTime(session.startedAt),
      endedAt: localDateTime(session.endedAt),
      description: session.description || "",
      source: session.source,
    };
    error.value = "";
  } catch {
    error.value = "Could not load this session for editing.";
  }
}
function closeSessionEdit() {
  editingSession.value = null;
  sessionDraft.value = null;
}
function addSessionLabel(event: Event) {
  const select = event.target as HTMLSelectElement;
  if (
    sessionDraft.value &&
    select.value &&
    !sessionDraft.value.labelIds.includes(select.value)
  ) {
    sessionDraft.value.labelIds = [
      ...sessionDraft.value.labelIds,
      select.value,
    ];
  }
  select.value = "";
}
function removeSessionLabel(labelId: string) {
  if (sessionDraft.value)
    sessionDraft.value.labelIds = sessionDraft.value.labelIds.filter(
      (id) => id !== labelId,
    );
}
async function saveSession() {
  const event = editingSession.value;
  const draft = sessionDraft.value;
  if (!event?.timeEntryId || !draft) return;
  if (!draft.startedAt || !draft.endedAt) {
    error.value = "A session needs both a start and an end time.";
    return;
  }
  savingSession.value = true;
  try {
    await api(`/time-entries/${event.timeEntryId}`, {
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
    closeSessionEdit();
    if (historyPath.value) await loadSummary(historyPath.value);
    reportsStore.clear();
  } catch {
    error.value =
      "Could not update this session. Check its time range and selections.";
  } finally {
    savingSession.value = false;
  }
}
function startEdit(path: Path) {
  editingId.value = path.id;
  editName.value = path.name;
  editDescription.value = path.description || "";
  editColor.value = path.color || colors[0];
  editColorOpen.value = false;
}
function cancelEdit() {
  editingId.value = "";
  editName.value = "";
  editDescription.value = "";
  editColor.value = colors[0];
  editColorOpen.value = false;
}
function openMerge(path: Path) {
  mergeSource.value = path;
}
function cancelMerge() {
  mergeSource.value = null;
}
async function merge(path: Path) {
  const source = mergeSource.value;
  if (!source) return;
  // Only one modal may be active at a time; preserve the source locally for confirmation.
  cancelMerge();
  const confirmation = await promptDialog.value!.open(
    `Merge ${source.name} into ${path.name}? All sessions will move and ${source.name} will be removed.`,
    "",
    { confirmation: true },
  );
  if (confirmation === null) return;
  merging.value = true;
  try {
    await api(`/paths/${source.id}/merge`, {
      method: "POST",
      body: JSON.stringify({ targetPathId: path.id }),
    });
    reportsStore.clear();
    delete summaries.value[source.id];
    cancelMerge();
    cancelEdit();
    await load(true);
  } catch {
    error.value = "Could not merge paths. Try again.";
  } finally {
    merging.value = false;
  }
}
function chooseSelectedColor(color: string) {
  selectedColor.value = color;
  selectedColorOpen.value = false;
}
function chooseEditColor(color: string) {
  editColor.value = color;
  editColorOpen.value = false;
}
async function saveEdit(path: Path) {
  if (!editName.value.trim()) return;
  try {
    const saved = await api<Path>(`/paths/${path.id}`, {
      method: "PUT",
      body: JSON.stringify({
        name: editName.value,
        description: editDescription.value || null,
        color: editColor.value,
      }),
    });
    pathsStore.replace(saved);
    reportsStore.clear();
    cancelEdit();
    await load();
    if (summaries.value[path.id]) await loadSummary(path);
  } catch {
    error.value = "Could not update path.";
  }
}
async function remove(path: Path) {
  const confirmation = await promptDialog.value!.open(
    `Remove ${path.name}? You can undo this for a few seconds.`,
    "",
    { confirmation: true },
  );
  if (confirmation === null) return;
  try {
    await api(`/paths/${path.id}`, { method: "DELETE" });
    delete summaries.value[path.id];
    if (historyPath.value?.id === path.id) closeHistory();
    pathsStore.remove(path.id);
    reportsStore.clear();
    if (pendingDeleteTimer) clearTimeout(pendingDeleteTimer);
    pendingDelete.value = path;
    pendingDeleteTimer = setTimeout(() => {
      pendingDelete.value = null;
      pendingDeleteTimer = undefined;
    }, 8000);
  } catch {
    error.value = "Could not remove path.";
  }
}
async function undoRemove() {
  const path = pendingDelete.value;
  if (!path) return;
  try {
    await api(`/paths/${path.id}/restore`, { method: "POST" });
    pathsStore.restore(path);
    reportsStore.clear();
    pendingDelete.value = null;
    if (pendingDeleteTimer) clearTimeout(pendingDeleteTimer);
    pendingDeleteTimer = undefined;
  } catch {
    error.value = "Could not undo path removal.";
  }
}
onMounted(load);
onBeforeUnmount(() => {
  if (pendingDeleteTimer) clearTimeout(pendingDeleteTimer);
});
</script>

<template>
  <PromptDialog ref="promptDialog" />
  <MergePathDialog
    :source="mergeSource"
    :paths="paths"
    @cancel="cancelMerge"
    @confirm="merge"
  />
  <section class="paths-page">
    <header class="paths-heading">
      <div>
        <p class="eyebrow">ORGANIZE</p>
        <h1>Your paths</h1>
      </div>
      <button
        class="icon-button"
        type="button"
        aria-label="Add path"
        title="Add path"
        aria-haspopup="dialog"
        @click="openAddDialog"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          aria-hidden="true"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </header>
    <p class="lede">Long-lived areas that give your work a place to belong.</p>
    <p
      v-if="error && !addDialogOpen"
      class="notice"
      role="alert"
      aria-live="polite"
    >
      {{ error }}
    </p>
    <p
      v-if="pendingDelete"
      class="snackbar undo-snackbar"
      role="status"
      aria-live="polite"
    >
      Removed “{{ pendingDelete.name }}”.
      <button class="text-button" type="button" @click="undoRemove">
        Undo
      </button>
    </p>
    <div class="path-list">
      <article
        v-for="path in paths"
        :key="path.id"
        class="path card"
        draggable="true"
        @dragstart="draggingId = path.id"
        @dragover.prevent
        @drop="draggingId && movePath(paths.find((value) => value.id === draggingId)!, path)"
      >
        <button
          type="button"
          class="path-pin-button"
          :aria-pressed="path.pinned"
          :aria-label="path.pinned ? `Unpin ${path.name}` : `Pin ${path.name}`"
          :title="path.pinned ? 'Unpin path' : 'Pin path'"
          @click="togglePinned(path)"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M16 9V4h1V2H7v2h1v5c0 1.66-1.34 3-3 3v2h5.97v8h2v-8H20v-2c-2.21 0-4-1.79-4-4Z"
            />
          </svg>
        </button>
        <form
          v-if="editingId === path.id"
          class="path-edit"
          @keydown.ctrl.enter.prevent="saveEdit(path)"
          @keydown.meta.enter.prevent="saveEdit(path)"
          @submit.prevent="saveEdit(path)"
        >
          <input v-model="editName" aria-label="Edit path name" /><textarea
            v-model="editDescription"
            rows="3"
            aria-label="Edit path description"
          ></textarea>
          <span class="color-popover-anchor path-color-control"
            ><button
              class="color-swatch-button"
              type="button"
              :style="{ backgroundColor: editColor }"
              aria-label="Choose edit path color"
              :aria-expanded="editColorOpen"
              aria-controls="edit-path-color-palette"
              @click="
                editColorOpen = !editColorOpen;
                selectedColorOpen = false;
              "
            ></button
            ><ColorPalette
              v-if="editColorOpen"
              id="edit-path-color-palette"
              class="path-color-palette"
              :model-value="editColor"
              legend="Edit path color"
              option-label="Set edit path color"
              @update:model-value="chooseEditColor"
          /></span>
          <div class="row-actions">
            <button class="primary">Save path</button
            ><button
              type="button"
              class="text-button"
              :disabled="merging"
              @click="openMerge(path)"
            >
              <span
                v-if="merging"
                class="loading-spinner"
                aria-hidden="true"
              ></span
              >Merge</button
            ><button type="button" class="text-button" @click="cancelEdit">
              Cancel
            </button>
          </div>
        </form>
        <div v-else class="path-content">
          <div class="path-body">
            <span
              class="dot"
              :style="{ backgroundColor: path.color || colors[0] }"
            ></span>
            <h2>{{ path.name }}</h2>
            <span v-if="path.activityLabel" class="activity-pill">{{
              path.activityLabel
            }}</span>
            <p v-if="path.description">
              <template
                v-for="(part, index) in linkParts(path.description)"
                :key="index"
              >
                <a
                  v-if="part.url"
                  :href="part.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  >{{ part.text }}</a
                >
                <template v-else>{{ part.text }}</template>
              </template>
            </p>
            <p v-else>No description yet</p>
          </div>
          <div class="row-actions">
            <button
              class="text-button"
              aria-haspopup="dialog"
              @click="inspect(path)"
            >
              History</button
            ><button class="text-button" @click="startEdit(path)">Edit</button
            ><button
              v-if="path.status === 'ACTIVE'"
              class="text-button danger"
              @click="remove(path)"
            >
              Remove
            </button>
          </div>
        </div>
      </article>
      <p v-if="!paths.length && !error" class="empty">
        Your first path is waiting to be named.
      </p>
    </div>
    <div
      v-if="addDialogOpen"
      class="prompt-dialog-backdrop"
      @click.self="closeAddDialog"
    >
      <section
        v-dialog-focus
        class="prompt-dialog card path-create-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="path-create-heading"
        tabindex="-1"
        @keydown.esc.prevent="closeAddDialog"
      >
        <div class="path-dialog-heading">
          <div>
            <p class="eyebrow">NEW PATH</p>
            <h2 id="path-create-heading">Add a path</h2>
          </div>
        </div>
        <form class="path-create-form" @submit.prevent="add">
          <label
            >Path name<input
              v-model="name"
              name="path-name"
              aria-label="New path name"
              placeholder="e.g. Reading…"
              autocomplete="off"
              required
          /></label>
          <label
            >Description <span class="muted">Optional</span
            ><textarea
              v-model="description"
              name="path-description"
              aria-label="Path description"
              rows="3"
              placeholder="What belongs here…"
              autocomplete="off"
            ></textarea>
          </label>
          <div class="path-create-color">
            <ColorPalette
              :model-value="selectedColor"
              legend="Path color"
              option-label="Choose path color"
              @update:model-value="chooseSelectedColor"
            />
          </div>
          <p v-if="error" class="notice" role="alert" aria-live="polite">
            {{ error }}
          </p>
          <div class="prompt-dialog-actions">
            <button type="button" class="text-button" @click="closeAddDialog">
              Cancel
            </button>
            <button class="primary" type="submit">Add path</button>
          </div>
        </form>
      </section>
    </div>
    <div
      v-if="historyPath && summaries[historyPath.id]"
      class="prompt-dialog-backdrop"
      @click.self="closeHistory"
    >
      <section
        v-dialog-focus
        class="prompt-dialog card path-history-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="path-history-heading"
        tabindex="-1"
        @keydown.esc.prevent="closeHistory"
      >
        <div class="path-history-heading">
          <div>
            <p class="eyebrow">PATH HISTORY</p>
            <h2 id="path-history-heading">{{ historyPath.name }}</h2>
            <p class="muted">
              {{
                formatTrackedDuration(summaries[historyPath.id].trackedSeconds)
              }}
              tracked
            </p>
          </div>
          <button type="button" class="text-button" @click="closeHistory">
            Close
          </button>
        </div>
        <div class="path-history-list" aria-label="Recent activity">
          <section
            v-for="group in historyActivityGroups(historyPath.id)"
            :key="group.key"
            class="path-history-group"
            :aria-labelledby="`path-history-group-${group.key}`"
          >
            <h3
              :id="`path-history-group-${group.key}`"
              class="path-history-group-heading"
            >
              {{ group.label }}
            </h3>
            <article
              v-for="event in group.activities"
              :key="event.id"
              class="path-history-entry"
            >
              <div class="path-history-meta">
                <time :datetime="event.occurredAt">{{
                  formatDate(event.occurredAt)
                }}</time>
                <div
                  v-if="activityLabelIds(event).length"
                  class="activity-labels"
                  aria-label="Session labels"
                >
                  <span
                    v-for="labelId in activityLabelIds(event)"
                    :key="labelId"
                    class="activity-label-chip"
                  >
                    {{ labelFor(labelId)?.name || "Removed label" }}
                  </span>
                </div>
              </div>
              <span
                v-if="activityDuration(event.title)"
                class="activity-duration"
                >{{ activityDuration(event.title) }}</span
              >
              <p class="activity-description">
                <template
                  v-for="(part, index) in activityDescriptionParts(event)"
                  :key="index"
                >
                  <a
                    v-if="part.url"
                    :href="part.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    >{{ part.text }}</a
                  >
                  <template v-else>{{ part.text }}</template>
                </template>
              </p>
              <button
                v-if="event.timeEntryId"
                type="button"
                class="text-button path-history-edit"
                @click="editSession(event)"
              >
                Edit session
              </button>
            </article>
          </section>
          <p v-if="!recentActivity(historyPath.id).length" class="muted">
            No recent activity yet.
          </p>
        </div>
      </section>
    </div>
    <div
      v-if="editingSession && sessionDraft"
      class="prompt-dialog-backdrop"
      @click.self="closeSessionEdit"
    >
      <section
        v-dialog-focus
        class="prompt-dialog card session-edit-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-edit-heading"
        tabindex="-1"
        @keydown.esc.prevent="closeSessionEdit"
      >
        <p class="eyebrow">EDIT SESSION</p>
        <h2 id="session-edit-heading">Edit session</h2>
        <form
          class="session-edit"
          @keydown.ctrl.enter.prevent="saveSession"
          @keydown.meta.enter.prevent="saveSession"
          @submit.prevent="saveSession"
        >
          <label class="session-edit-path"
            >Path<select
              v-model="sessionDraft.pathId"
              name="history-session-path"
              aria-label="Edit session path"
            >
              <option value="">Unassigned</option>
              <option v-for="path in paths" :key="path.id" :value="path.id">
                {{ path.name }}
              </option>
            </select></label
          >
          <div class="session-edit-grid">
            <label class="session-edit-description"
              >Description <span>(optional)</span
              ><textarea
                v-model="sessionDraft.description"
                name="history-session-description"
                aria-label="Edit session description"
                maxlength="5000"
                rows="1"
                placeholder="What did you work on…"
              ></textarea>
            </label>
            <fieldset class="session-edit-labels">
              <legend>Labels</legend>
              <div class="session-label-picker">
                <div
                  v-if="sessionDraft.labelIds.length"
                  class="session-label-chips"
                  aria-label="Selected session labels"
                >
                  <button
                    v-for="labelId in sessionDraft.labelIds"
                    :key="labelId"
                    type="button"
                    :aria-label="`Remove ${labelFor(labelId)?.name || 'removed label'}`"
                    @click="removeSessionLabel(labelId)"
                  >
                    {{ labelFor(labelId)?.name || "Removed label" }}
                    <span aria-hidden="true">×</span>
                  </button>
                </div>
                <select
                  name="history-session-labels"
                  aria-label="Add session label"
                  @change="addSessionLabel"
                >
                  <option value="">Add a label…</option>
                  <option
                    v-for="label in sessionLabels.filter(
                      (label) => !sessionDraft.labelIds.includes(label.id),
                    )"
                    :key="label.id"
                    :value="label.id"
                  >
                    {{ label.name }}
                  </option>
                </select>
              </div>
            </fieldset>
            <label
              >Source<select
                v-model="sessionDraft.source"
                name="history-session-source"
                aria-label="Edit session source"
              >
                <option v-for="source in sessionSources" :key="source">
                  {{ source }}
                </option>
              </select></label
            >
            <label
              >Started<input
                v-model="sessionDraft.startedAt"
                type="datetime-local"
                name="history-session-started-at"
                aria-label="Edit session start"
                required
            /></label>
            <label
              >Ended<input
                v-model="sessionDraft.endedAt"
                type="datetime-local"
                name="history-session-ended-at"
                aria-label="Edit session end"
                required
            /></label>
          </div>
          <div class="session-actions">
            <button class="primary" :disabled="savingSession">
              {{ savingSession ? "Saving…" : "Save session" }}</button
            ><button
              type="button"
              class="text-button"
              @click="closeSessionEdit"
            >
              Cancel
            </button>
          </div>
        </form>
      </section>
    </div>
  </section>
</template>

<style scoped>
.paths-page {
  max-width: 1200px;
  margin: 0 auto;
}
.path-pin-button {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 1;
  display: inline-flex;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  margin: 0;
  border: 1px solid transparent;
  border-radius: 50%;
  padding: 6px;
  background: transparent;
  color: var(--workspace-muted);
  cursor: pointer;
}
.path-list > .card {
  position: relative;
}
.path-pin-button svg {
  width: 18px;
  height: 18px;
  fill: currentColor;
}
.path-pin-button[aria-pressed="true"] {
  color: var(--workspace-accent);
  background: var(--workspace-selected);
}
.path-pin-button:hover,
.path-pin-button:focus-visible {
  border-color: var(--workspace-control-border);
  background: var(--workspace-hover);
  color: var(--workspace-text);
}
.paths-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 8px;
}
.paths-heading h1 {
  margin: 8px 0 0;
}
.icon-button {
  display: inline-flex;
  width: 46px;
  height: 46px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: var(--workspace-radius);
  background: var(--workspace-accent);
  color: var(--workspace-on-accent);
  cursor: pointer;
}
.icon-button:hover {
  background: var(--workspace-accent-hover);
}
.path-dialog-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.path-dialog-heading h2 {
  margin: 3px 0 0;
  font-size: 20px;
}
.path-create-form {
  display: grid;
  gap: 14px;
  margin-top: 4px;
}
.path-create-form label {
  display: grid;
  gap: 6px;
  font-size: 12px;
  font-weight: 650;
}
.path-create-form input,
.path-create-form textarea {
  width: 100%;
}
.path-create-color {
  padding-top: 2px;
}
.path-create-color :deep(.color-palette) {
  display: grid;
  grid-template-columns: repeat(5, 28px);
  gap: 2px;
  width: max-content;
}
@media (max-width: 560px) {
  .paths-heading {
    align-items: flex-start;
  }
}
</style>
