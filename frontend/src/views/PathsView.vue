<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { api } from "../lib/api";

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
  summary = ref<Summary | null>(null),
  name = ref(""),
  description = ref(""),
  selectedColor = ref(colors[0]),
  noteTitle = ref(""),
  noteContent = ref(""),
  itemFilter = ref(""),
  error = ref("");
const editingId = ref(""),
  editName = ref(""),
  editDescription = ref(""),
  editColor = ref(colors[0]);
const format = (seconds: number) =>
  `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
const itemName = (id: string) =>
  items.value.find((item) => item.id === id)?.title || id;
const filteredItemIds = computed(
  () =>
    summary.value?.itemIds.filter((id) =>
      itemName(id)
        .toLowerCase()
        .includes(itemFilter.value.trim().toLowerCase()),
    ) || [],
);
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
async function inspect(path: Path) {
  try {
    summary.value = await api<Summary>(`/paths/${path.id}/summary`);
    itemFilter.value = "";
  } catch {
    error.value = "Could not load path history.";
  }
}
function expanded(path: Path) {
  return summary.value?.path.id === path.id;
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
    if (summary.value?.path.id === path.id) await inspect(path);
  } catch {
    error.value = "Could not update path.";
  }
}
async function archive(path: Path) {
  if (!confirm(`Archive ${path.name}?`)) return;
  try {
    await api(`/paths/${path.id}`, { method: "DELETE" });
    summary.value = null;
    await load();
  } catch {
    error.value = "Could not archive path.";
  }
}
async function addNote() {
  if (!summary.value || !noteTitle.value.trim() || !noteContent.value.trim())
    return;
  try {
    await api("/notes", {
      method: "POST",
      body: JSON.stringify({
        pathId: summary.value.path.id,
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
</script>

<template>
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
          <p>{{ path.description || "No description yet" }}</p>
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
              @click="archive(path)"
            >
              Archive
            </button>
          </div>
          <div v-if="expanded(path) && summary" class="path-summary">
            <p class="eyebrow">PATH HISTORY</p>
            <p class="muted">
              {{ format(summary.trackedSeconds) }} tracked ·
              {{ summary.itemIds.length }} items
            </p>
            <p><strong>Associated items and progress</strong></p>
            <input
              v-model="itemFilter"
              placeholder="Filter items in this path"
              aria-label="Filter path items"
            />
            <ul>
              <li v-for="id in filteredItemIds" :key="id">
                {{ itemName(id) }} — {{ summary.itemProgress[id] ?? 0 }}%
              </li>
            </ul>
            <p v-if="!filteredItemIds.length" class="muted">
              No items match this filter.
            </p>
            <p><strong>Recent activity</strong></p>
            <p
              v-for="event in summary.recentActivity"
              :key="event.id"
              class="muted"
            >
              {{ event.title }} ·
              {{ new Date(event.occurredAt).toLocaleString()
              }}<span v-if="event.detail"> · {{ event.detail }}</span>
            </p>
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
              ><button class="primary" @click="addNote">Save path note</button>
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
