<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
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
const colors = paletteColors;
const pathsStore = usePathsStore();
const labelsStore = useLabelsStore();
const { paths } = storeToRefs(pathsStore);
const { labels } = storeToRefs(labelsStore);
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
const merging = ref(false);
let pendingDeleteTimer: ReturnType<typeof setTimeout> | undefined;
const activityDuration = (title: string) => {
  const match = title.match(/^Tracked (\d+) seconds$/);
  return match ? formatTrackedDuration(Number(match[1])) : "";
};
const labelFor = (id?: string) => labels.value.find((label) => label.id === id);
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
  if (date.getFullYear() === lastMonth.getFullYear() && date.getMonth() === lastMonth.getMonth()) return "Last month";
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(date);
}
function historyActivityGroups(pathId: string): ActivityGroup[] {
  const groups: ActivityGroup[] = [];
  for (const activity of recentActivity(pathId)) {
    const label = activityGroupLabel(activity.occurredAt);
    const group = groups.at(-1);
    if (group?.label === label) {
      group.activities.push(activity);
    } else {
      groups.push({ key: `${label}-${activity.id}`, label, activities: [activity] });
    }
  }
  return groups;
}
async function load() {
  try {
    const [loadedPaths, loadedLabels] = await Promise.all([
      api<Path[]>("/paths"),
      api<Label[]>("/labels?scope=TIME_ENTRY"),
    ]);
    pathsStore.setAll(loadedPaths);
    labelsStore.setAll(loadedLabels || []);
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
    await api("/paths", {
      method: "POST",
      body: JSON.stringify({
        name: name.value,
        description: description.value || null,
        color: selectedColor.value,
      }),
    });
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
    summaries.value[path.id] = await api<Summary>(
      `/paths/${path.id}/summary`,
    );
  } catch {
    error.value = "Could not load path history.";
  }
}
async function inspect(path: Path) {
  if (!summaries.value[path.id]) await loadSummary(path);
  if (!summaries.value[path.id]) return;
  historyPath.value = path;
  void nextTick(() => document.querySelector<HTMLElement>(".path-history-dialog")?.focus());
}
function closeHistory() {
  historyPath.value = null;
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
    delete summaries.value[source.id];
    cancelMerge();
    cancelEdit();
    await load();
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
    await api(`/paths/${path.id}`, {
      method: "PUT",
      body: JSON.stringify({
        name: editName.value,
        description: editDescription.value || null,
        color: editColor.value,
      }),
    });
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
  <MergePathDialog :source="mergeSource" :paths="paths" @cancel="cancelMerge" @confirm="merge" />
  <section class="paths-page">
    <header class="paths-heading">
      <div><p class="eyebrow">ORGANIZE</p><h1>Your paths</h1></div>
      <button class="icon-button" type="button" aria-label="Add path" title="Add path" aria-haspopup="dialog" @click="openAddDialog"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></button>
    </header>
    <p class="lede">Long-lived areas that give your work a place to belong.</p>
    <p v-if="error && !addDialogOpen" class="notice" role="alert" aria-live="polite">{{ error }}</p>
    <p
      v-if="pendingDelete"
      class="snackbar undo-snackbar"
      role="status"
      aria-live="polite"
    >
      Removed “{{ pendingDelete.name }}”.
      <button class="text-button" type="button" @click="undoRemove">Undo</button>
    </p>
    <div class="path-list">
      <article
        v-for="path in paths"
        :key="path.id"
        class="path card"
      >
        <form
          v-if="editingId === path.id"
          class="path-edit"
          @submit.prevent="saveEdit(path)"
        >
          <input v-model="editName" aria-label="Edit path name" /><textarea
            v-model="editDescription"
            rows="3"
            aria-label="Edit path description"
          ></textarea>
          <span class="color-popover-anchor path-color-control"><button class="color-swatch-button" type="button" :style="{ backgroundColor: editColor }" aria-label="Choose edit path color" :aria-expanded="editColorOpen" aria-controls="edit-path-color-palette" @click="editColorOpen = !editColorOpen; selectedColorOpen = false"></button><ColorPalette v-if="editColorOpen" id="edit-path-color-palette" class="path-color-palette" :model-value="editColor" legend="Edit path color" option-label="Set edit path color" @update:model-value="chooseEditColor" /></span>
          <div class="row-actions">
            <button class="primary">Save path</button
            ><button type="button" class="text-button" :disabled="merging" @click="openMerge(path)">
              <span v-if="merging" class="loading-spinner" aria-hidden="true"></span>Merge
            </button
            ><button type="button" class="text-button" @click="cancelEdit">
              Cancel
            </button>
          </div>
        </form>
        <div v-else class="path-content">
          <span
            class="dot"
            :style="{ backgroundColor: path.color || colors[0] }"
          ></span>
          <h2>{{ path.name }}</h2>
          <span v-if="path.activityLabel" class="activity-pill">{{ path.activityLabel }}</span>
          <p v-if="path.description">
            <template v-for="(part, index) in linkParts(path.description)" :key="index">
              <a v-if="part.url" :href="part.url" target="_blank" rel="noopener noreferrer">{{ part.text }}</a>
              <template v-else>{{ part.text }}</template>
            </template>
          </p>
          <p v-else>No description yet</p>
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
    <div v-if="addDialogOpen" class="prompt-dialog-backdrop" @click.self="closeAddDialog">
      <section v-dialog-focus class="prompt-dialog card path-create-dialog" role="dialog" aria-modal="true" aria-labelledby="path-create-heading" tabindex="-1" @keydown.esc.prevent="closeAddDialog">
        <div class="path-dialog-heading">
          <div>
            <p class="eyebrow">NEW PATH</p>
            <h2 id="path-create-heading">Add a path</h2>
          </div>
        </div>
        <form class="path-create-form" @submit.prevent="add">
          <label>Path name<input v-model="name" name="path-name" aria-label="New path name" placeholder="e.g. Reading…" autocomplete="off" required /></label>
          <label>Description <span class="muted">Optional</span><textarea v-model="description" name="path-description" aria-label="Path description" rows="3" placeholder="What belongs here…" autocomplete="off"></textarea></label>
          <div class="path-create-color"><ColorPalette :model-value="selectedColor" legend="Path color" option-label="Choose path color" @update:model-value="chooseSelectedColor" /></div>
          <p v-if="error" class="notice" role="alert" aria-live="polite">{{ error }}</p>
          <div class="prompt-dialog-actions">
            <button type="button" class="text-button" @click="closeAddDialog">Cancel</button>
            <button class="primary" type="submit">Add path</button>
          </div>
        </form>
      </section>
    </div>
    <div v-if="historyPath && summaries[historyPath.id]" class="prompt-dialog-backdrop" @click.self="closeHistory">
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
            <p class="muted">{{ formatTrackedDuration(summaries[historyPath.id].trackedSeconds) }} tracked</p>
          </div>
          <button type="button" class="text-button" @click="closeHistory">Close</button>
        </div>
        <div class="path-history-list" aria-label="Recent activity">
          <section v-for="group in historyActivityGroups(historyPath.id)" :key="group.key" class="path-history-group" :aria-labelledby="`path-history-group-${group.key}`">
            <h3 :id="`path-history-group-${group.key}`" class="path-history-group-heading">{{ group.label }}</h3>
          <article v-for="event in group.activities" :key="event.id" class="path-history-entry">
            <div class="path-history-meta">
              <time :datetime="event.occurredAt">{{ formatDate(event.occurredAt) }}</time>
              <div v-if="activityLabelIds(event).length" class="activity-labels" aria-label="Session labels">
                <span v-for="labelId in activityLabelIds(event)" :key="labelId" class="activity-label-chip">
                  {{ labelFor(labelId)?.name || "Removed label" }}
                </span>
              </div>
            </div>
            <span v-if="activityDuration(event.title)" class="activity-duration">{{ activityDuration(event.title) }}</span>
            <p class="activity-description">
              <template v-for="(part, index) in activityDescriptionParts(event)" :key="index">
                <a v-if="part.url" :href="part.url" target="_blank" rel="noopener noreferrer">{{ part.text }}</a>
                <template v-else>{{ part.text }}</template>
              </template>
            </p>
          </article>
          </section>
          <p v-if="!recentActivity(historyPath.id).length" class="muted">No recent activity yet.</p>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.paths-page { max-width: 1200px; margin: 0 auto; }
.paths-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 8px; }
.paths-heading h1 { margin: 8px 0 0; }
.icon-button { display: inline-flex; width: 46px; height: 46px; align-items: center; justify-content: center; border: 0; border-radius: var(--workspace-radius); background: var(--workspace-accent); color: var(--workspace-on-accent); cursor: pointer; }
.icon-button:hover { background: var(--workspace-accent-hover); }
.path-dialog-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.path-dialog-heading h2 { margin: 3px 0 0; font-size: 20px; }
.path-create-form { display: grid; gap: 14px; margin-top: 4px; }
.path-create-form label { display: grid; gap: 6px; font-size: 12px; font-weight: 650; }
.path-create-form input, .path-create-form textarea { width: 100%; }
.path-create-color { padding-top: 2px; }
.path-create-color :deep(.color-palette) { display: grid; grid-template-columns: repeat(5, 28px); gap: 2px; width: max-content; }
@media (max-width: 560px) { .paths-heading { align-items: flex-start; } }
</style>
