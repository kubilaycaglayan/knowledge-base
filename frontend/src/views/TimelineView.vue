<script setup lang="ts">
import { inject, onMounted, ref, watch } from "vue";
import { routeLocationKey, routerKey } from "vue-router";
import { api } from "../lib/api";
import { formatDateTime } from "../lib/date";
type Activity = {
  id: string;
  type: string;
  title: string;
  detail?: string;
  occurredAt: string;
  pathId?: string;
  timeEntryId?: string;
};
type Path = { id: string; name: string };
const router = inject(routerKey, undefined);
const route = inject(routeLocationKey, undefined);
const initialQuery = route?.query;
const activities = ref<Activity[]>([]),
  paths = ref<Path[]>([]),
  type = ref(typeof initialQuery?.type === "string" ? initialQuery.type : ""),
  pathId = ref(typeof initialQuery?.pathId === "string" ? initialQuery.pathId : ""),
  from = ref(typeof initialQuery?.from === "string" ? initialQuery.from : ""),
  to = ref(typeof initialQuery?.to === "string" ? initialQuery.to : ""),
  error = ref("");
const noteActivityId = ref(""),
  noteTitle = ref(""),
  noteContent = ref("");
let latestLoad = 0;
const pathName = (id?: string) => {
  if (!id) return "";
  return paths.value.find((path) => path.id === id)?.name || "";
};
const dateValue = (date: Date) => date.toISOString().slice(0, 10);
async function load() {
  const loadId = ++latestLoad;
  if (from.value && to.value && from.value > to.value) {
    error.value = "The end date must be on or after the start date.";
    return;
  }
  error.value = "";
  try {
    const params = new URLSearchParams();
    if (type.value) params.set("type", type.value);
    if (pathId.value) params.set("pathId", pathId.value);
    if (from.value) params.set("from", `${from.value}T00:00:00Z`);
    if (to.value) params.set("to", `${to.value}T23:59:59Z`);
    const result = await api<Activity[]>(`/activities?${params}`);
    if (loadId === latestLoad) activities.value = result;
  } catch {
    if (loadId === latestLoad) error.value = "Unable to load activity.";
  }
}
function filterQuery() {
  return {
    ...(type.value ? { type: type.value } : {}),
    ...(pathId.value ? { pathId: pathId.value } : {}),
    ...(from.value ? { from: from.value } : {}),
    ...(to.value ? { to: to.value } : {}),
  };
}
async function applyFilters() {
  if (from.value && to.value && from.value > to.value) {
    await load();
    return;
  }
  if (router) await router.push({ path: "/timeline", query: filterQuery() });
  await load();
}
watch(
  () => route?.fullPath,
  () => {
    if (!route) return;
    const query = route.query;
    const next = {
      type: typeof query.type === "string" ? query.type : "",
      pathId: typeof query.pathId === "string" ? query.pathId : "",
      from: typeof query.from === "string" ? query.from : "",
      to: typeof query.to === "string" ? query.to : "",
    };
    if (
      next.type === type.value &&
      next.pathId === pathId.value &&
      next.from === from.value &&
      next.to === to.value
    ) return;
    type.value = next.type;
    pathId.value = next.pathId;
    from.value = next.from;
    to.value = next.to;
    void load();
  },
);
function setRange(days: number) {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days + 1);
  from.value = dateValue(start);
  to.value = dateValue(end);
  void applyFilters();
}
function clearRange() {
  from.value = "";
  to.value = "";
  void applyFilters();
}
function clearFilters() {
  type.value = "";
  pathId.value = "";
  from.value = "";
  to.value = "";
  void applyFilters();
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
        ...(activities.value.find(
          (activity) => activity.id === noteActivityId.value,
        )?.timeEntryId
          ? {
              timeEntryId: activities.value.find(
                (activity) => activity.id === noteActivityId.value,
              )?.timeEntryId,
            }
          : { activityId: noteActivityId.value }),
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
    paths.value = await api<Path[]>("/paths");
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
    <form class="filters card" @submit.prevent="applyFilters">
      <div class="row-actions">
        <button type="button" class="text-button" @click="setRange(7)">
          Last 7 days</button
        ><button type="button" class="text-button" @click="setRange(30)">
          Last 30 days</button
        ><button type="button" class="text-button" @click="clearRange">
          All time
        </button><button
          type="button"
          class="text-button clear-timeline-filters"
          @click="clearFilters"
        >
          Clear filters
        </button>
      </div>
      <select v-model="type" aria-label="Activity type">
        <option value="">All activity</option>
        <option>NOTE_CREATED</option>
        <option>TIMER_STARTED</option>
        <option>TIMER_STOPPED</option>
        <option>TIME_TRACKED</option></select
      ><select v-model="pathId" aria-label="Path">
        <option value="">All paths</option>
        <option v-for="path in paths" :key="path.id" :value="path.id">
          {{ path.name }}
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
            {{ formatDateTime(activity.occurredAt) }}
          </p>
          <h2>{{ activity.title }}</h2>
          <p v-if="activity.detail">{{ activity.detail }}</p>
          <p class="muted">
            {{ pathName(activity.pathId) }}
          </p>
          <button
            class="text-button"
            @click="
              noteActivityId === activity.id ? closeNote() : openNote(activity)
            "
          >
            {{ noteActivityId === activity.id ? "Close note" : "Add note" }}
          </button>
          <div
            v-if="noteActivityId === activity.id"
            class="note-editor"
            @keydown.ctrl.enter.prevent="saveActivityNote"
            @keydown.meta.enter.prevent="saveActivityNote"
          >
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
            <div class="row-actions">
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
