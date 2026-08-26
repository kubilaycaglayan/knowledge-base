<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api } from "../lib/api";
type Activity = {
  id: string;
  type: string;
  title: string;
  detail?: string;
  occurredAt: string;
  pathId?: string;
  itemId?: string;
};
type Path = { id: string; name: string };
type Item = { id: string; title: string };
const activities = ref<Activity[]>([]),
  paths = ref<Path[]>([]),
  items = ref<Item[]>([]),
  type = ref(""),
  pathId = ref(""),
  itemId = ref(""),
  from = ref(""),
  to = ref(""),
  error = ref("");
const noteActivityId = ref(""),
  noteTitle = ref(""),
  noteContent = ref("");
const label = (id?: string, kind = "path") => {
  if (!id) return "";
  return kind === "path"
    ? paths.value.find((x) => x.id === id)?.name || ""
    : items.value.find((x) => x.id === id)?.title || "";
};
const dateValue = (date: Date) => date.toISOString().slice(0, 10);
async function load() {
  try {
    const params = new URLSearchParams();
    if (type.value) params.set("type", type.value);
    if (pathId.value) params.set("pathId", pathId.value);
    if (itemId.value) params.set("itemId", itemId.value);
    if (from.value) params.set("from", `${from.value}T00:00:00Z`);
    if (to.value) params.set("to", `${to.value}T23:59:59Z`);
    activities.value = await api<Activity[]>(`/activities?${params}`);
  } catch {
    error.value = "Unable to load activity.";
  }
}
function setRange(days: number) {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days + 1);
  from.value = dateValue(start);
  to.value = dateValue(end);
  void load();
}
function clearRange() {
  from.value = "";
  to.value = "";
  void load();
}
function openNote(activity: Activity) {
  noteActivityId.value = activity.id;
  noteTitle.value = "";
  noteContent.value = "";
}
function closeNote() {
  noteActivityId.value = "";
}
async function saveActivityNote() {
  if (
    !noteActivityId.value ||
    !noteTitle.value.trim() ||
    !noteContent.value.trim()
  )
    return;
  try {
    await api("/notes", {
      method: "POST",
      body: JSON.stringify({
        activityId: noteActivityId.value,
        title: noteTitle.value,
        content: noteContent.value,
      }),
    });
    closeNote();
    await load();
  } catch {
    error.value = "Could not save activity note.";
  }
}
onMounted(async () => {
  try {
    [paths.value, items.value] = await Promise.all([
      api<Path[]>("/paths"),
      api<Item[]>("/items"),
    ]);
    await load();
  } catch {
    error.value = "Unable to load activity.";
  }
});
</script>

<template>
  <section>
    <p class="eyebrow">HISTORY</p>
    <h1>Timeline</h1>
    <p class="lede">
      A chronological record of what you chose to spend time on.
    </p>
    <form class="filters card" @submit.prevent="load">
      <div class="item-actions">
        <button type="button" class="text-button" @click="setRange(7)">
          Last 7 days</button
        ><button type="button" class="text-button" @click="setRange(30)">
          Last 30 days</button
        ><button type="button" class="text-button" @click="clearRange">
          All time
        </button>
      </div>
      <select v-model="type" aria-label="Activity type">
        <option value="">All activity</option>
        <option>ITEM_CREATED</option>
        <option>ITEM_COMPLETED</option>
        <option>PROGRESS_CHANGED</option>
        <option>NOTE_CREATED</option>
        <option>TIMER_STARTED</option>
        <option>TIMER_STOPPED</option>
        <option>TIME_TRACKED</option></select
      ><select v-model="pathId" aria-label="Path">
        <option value="">All paths</option>
        <option v-for="path in paths" :key="path.id" :value="path.id">
          {{ path.name }}
        </option></select
      ><select v-model="itemId" aria-label="Item">
        <option value="">All items</option>
        <option v-for="item in items" :key="item.id" :value="item.id">
          {{ item.title }}
        </option></select
      ><input v-model="from" type="date" aria-label="From date" /><input
        v-model="to"
        type="date"
        aria-label="To date"
      /><button class="primary">Filter</button>
    </form>
    <p v-if="error" class="notice" role="alert">{{ error }}</p>
    <div class="timeline">
      <article
        v-for="activity in activities"
        :key="activity.id"
        class="timeline-entry"
      >
        <span class="timeline-dot"></span>
        <div>
          <p class="eyebrow">
            {{ activity.type.replaceAll("_", " ") }} ·
            {{ new Date(activity.occurredAt).toLocaleString() }}
          </p>
          <h2>{{ activity.title }}</h2>
          <p v-if="activity.detail">{{ activity.detail }}</p>
          <p class="muted">
            {{ label(activity.pathId, "path") }}
            {{ label(activity.itemId, "item") }}
          </p>
          <button
            class="text-button"
            @click="
              noteActivityId === activity.id ? closeNote() : openNote(activity)
            "
          >
            {{ noteActivityId === activity.id ? "Close note" : "Add note" }}
          </button>
          <div v-if="noteActivityId === activity.id" class="note-editor">
            <input
              v-model="noteTitle"
              placeholder="Note title"
              aria-label="Activity note title"
            /><textarea
              v-model="noteContent"
              placeholder="What did this activity teach you?"
              rows="3"
              aria-label="Activity note content"
            ></textarea>
            <div class="item-actions">
              <button class="primary" @click="saveActivityNote">
                Save note</button
              ><button class="text-button" @click="closeNote">Cancel</button>
            </div>
          </div>
        </div>
      </article>
      <p v-if="!activities.length && !error" class="empty">
        No activity matches these filters.
      </p>
    </div>
  </section>
</template>
