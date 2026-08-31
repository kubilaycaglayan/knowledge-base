<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { api } from "../lib/api";
import { formatDate } from "../lib/date";
import { formatTrackedDuration } from "../lib/format";
import PromptDialog from "../components/PromptDialog.vue";

type Path = {
  id: string;
  name: string;
  description?: string;
  color?: string;
  status: string;
};
type Item = { id: string; title: string };
type Activity = {
  id: string;
  type?: string;
  itemId?: string;
  title: string;
  detail?: string;
  occurredAt: string;
};
type Summary = {
  path: Path;
  itemIds: string[];
  itemProgress: Record<string, number>;
  trackedSeconds: number;
  recentActivity: Activity[];
};
type DescriptionPart = { text: string; url?: string };
const colors = [
  "#E8754E",
  "#D64550",
  "#C05A9A",
  "#805AD5",
  "#4C6FFF",
  "#2188FF",
  "#0EA5A4",
  "#2E9D68",
  "#7A9E3A",
  "#C28B2C",
  "#8B6F47",
  "#64748B",
];
const paths = ref<Path[]>([]),
  items = ref<Item[]>([]),
  summaries = ref<Record<string, Summary>>({}),
  name = ref(""),
  description = ref(""),
  selectedColor = ref(colors[0]),
  noteTitle = ref(""),
  noteContent = ref(""),
  error = ref("");
const editingId = ref(""),
  editName = ref(""),
  editDescription = ref(""),
  editColor = ref(colors[0]);
const promptDialog = ref<InstanceType<typeof PromptDialog> | null>(null);
const pendingDelete = ref<Path | null>(null);
let pendingDeleteTimer: ReturnType<typeof setTimeout> | undefined;
const activityDuration = (title: string) => {
  const match = title.match(/^Tracked (\d+) seconds$/);
  return match ? formatTrackedDuration(Number(match[1])) : "";
};
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
    event.itemId && itemName(event.itemId),
  ]
    .filter((value): value is string => Boolean(value))
    .flatMap((value, index, values) => [
      ...(index ? [{ text: " · " }] : []),
      ...linkParts(value),
    ]);
}
const itemName = (id: string) =>
  items.value.find((item) => item.id === id)?.title || id;
function recentActivity(pathId: string) {
  const activity = summaries.value[pathId]?.recentActivity || [];
  const stoppedTimers = activity.filter(
    (event) => event.type === "TIMER_STOPPED",
  );
  return activity.filter((event) => {
    if (event.type !== "TIMER_STARTED") return true;
    return !stoppedTimers.some(
      (stopped) =>
        stopped.itemId === event.itemId &&
        stopped.detail === event.detail &&
        Date.parse(stopped.occurredAt) >= Date.parse(event.occurredAt),
    );
  });
}
async function load() {
  try {
    [paths.value, items.value] = await Promise.all([
      api<Path[]>("/paths"),
      api<Item[]>("/items"),
    ]);
  } catch {
    error.value = "Unable to load paths.";
  }
}
async function add() {
  if (!name.value.trim()) return;
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
    await load();
  } catch {
    error.value = "Could not create path.";
  }
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
  if (summaries.value[path.id]) {
    delete summaries.value[path.id];
    return;
  }
  await loadSummary(path);
}
function expanded(path: Path) {
  return Boolean(summaries.value[path.id]);
}
function startEdit(path: Path) {
  editingId.value = path.id;
  editName.value = path.name;
  editDescription.value = path.description || "";
  editColor.value = path.color || colors[0];
}
function cancelEdit() {
  editingId.value = "";
  editName.value = "";
  editDescription.value = "";
  editColor.value = colors[0];
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
    paths.value = paths.value.filter((candidate) => candidate.id !== path.id);
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
    paths.value = [path, ...paths.value];
    pendingDelete.value = null;
    if (pendingDeleteTimer) clearTimeout(pendingDeleteTimer);
    pendingDeleteTimer = undefined;
  } catch {
    error.value = "Could not undo path removal.";
  }
}
async function addNote(pathId: string) {
  const summary = summaries.value[pathId];
  if (!summary || !noteTitle.value.trim() || !noteContent.value.trim())
    return;
  try {
    await api("/notes", {
      method: "POST",
      body: JSON.stringify({
        pathId: summary.path.id,
        title: noteTitle.value,
        content: noteContent.value,
      }),
    });
    noteTitle.value = "";
    noteContent.value = "";
  } catch {
    error.value = "Could not save path note.";
  }
}
onMounted(load);
onBeforeUnmount(() => {
  if (pendingDeleteTimer) clearTimeout(pendingDeleteTimer);
});
</script>

<template>
  <PromptDialog ref="promptDialog" />
  <section>
    <p class="eyebrow">ORGANIZE</p>
    <h1>Your paths</h1>
    <p class="lede">Long-lived areas that give your work a place to belong.</p>
    <form class="add path-form" @submit.prevent="add">
      <input
        v-model="name"
        placeholder="New path name"
        aria-label="New path name"
      /><input
        v-model="description"
        placeholder="Description"
        aria-label="Path description"
      />
      <fieldset class="color-picker">
        <legend>Path color</legend>
        <button
          v-for="color in colors"
          :key="color"
          type="button"
          :aria-label="`Choose path color ${color}`"
          :aria-pressed="selectedColor === color"
          :style="{ backgroundColor: color }"
          @click="selectedColor = color"
        ></button>
      </fieldset>
      <button class="primary">Add path</button>
    </form>
    <p v-if="error" class="notice" role="alert">{{ error }}</p>
    <p v-if="pendingDelete" class="notice undo-notice" role="status" aria-live="polite">
      Removed “{{ pendingDelete.name }}”.
      <button class="text-button" type="button" @click="undoRemove">Undo</button>
    </p>
    <div class="path-list">
      <article
        v-for="path in paths"
        :key="path.id"
        class="path card"
        :class="{ expanded: expanded(path) }"
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
          <fieldset class="color-picker">
            <legend>Edit path color</legend>
            <button
              v-for="color in colors"
              :key="color"
              type="button"
              :aria-label="`Set edit path color ${color}`"
              :aria-pressed="editColor === color"
              :style="{ backgroundColor: color }"
              @click="editColor = color"
            ></button>
          </fieldset>
          <div class="item-actions">
            <button class="primary">Save path</button
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
          <p v-if="path.description">
            <template v-for="(part, index) in linkParts(path.description)" :key="index">
              <a v-if="part.url" :href="part.url" target="_blank" rel="noopener noreferrer">{{ part.text }}</a>
              <template v-else>{{ part.text }}</template>
            </template>
          </p>
          <p v-else>No description yet</p>
          <div class="item-actions">
            <span class="pill">{{ path.status.toLowerCase() }}</span
            ><button
              class="text-button"
              :aria-expanded="expanded(path)"
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
          <div v-if="expanded(path) && summaries[path.id]" class="path-summary">
            <p class="eyebrow">PATH HISTORY</p>
            <p class="muted">
              {{ formatTrackedDuration(summaries[path.id].trackedSeconds) }} tracked ·
              {{ summaries[path.id].itemIds.length }} items
            </p>
            <p><strong>Associated items and progress</strong></p>
            <ul>
              <li v-for="id in summaries[path.id].itemIds" :key="id">
                {{ itemName(id) }} —
                {{ summaries[path.id].itemProgress[id] ?? 0 }}%
              </li>
            </ul>
            <p v-if="!summaries[path.id].itemIds.length" class="muted">
              No items are associated with this path.
            </p>
            <p><strong>Recent activity</strong></p>
            <div
              v-for="event in recentActivity(path.id)"
              :key="event.id"
              class="activity-row muted"
            >
              <time :datetime="event.occurredAt">{{ formatDate(event.occurredAt) }}</time>
              <span class="activity-duration">{{ activityDuration(event.title) }}</span>
              <span class="activity-description">
                <template v-for="(part, index) in activityDescriptionParts(event)" :key="index">
                  <a v-if="part.url" :href="part.url" target="_blank" rel="noopener noreferrer">{{ part.text }}</a>
                  <template v-else>{{ part.text }}</template>
                </template>
              </span>
            </div>
            <div class="note-editor">
              <strong>Path note</strong
              ><input
                v-model="noteTitle"
                placeholder="Note title"
                aria-label="Path note title"
              /><textarea
                v-model="noteContent"
                placeholder="What did you learn in this path?"
                rows="3"
                aria-label="Path note content"
              ></textarea
              ><button class="primary" @click="addNote(path.id)">Save path note</button>
            </div>
          </div>
        </div>
      </article>
      <p v-if="!paths.length && !error" class="empty">
        Your first path is waiting to be named.
      </p>
    </div>
  </section>
</template>
