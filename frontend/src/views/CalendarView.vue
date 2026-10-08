<script setup lang="ts">
import { computed, inject, onMounted, ref, watch } from "vue";
import { routeLocationKey, routerKey } from "vue-router";
import { storeToRefs } from "pinia";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isValid,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { api } from "../lib/api";
import { labelColors } from "../lib/label-colors";
import ColorPalette from "../components/ColorPalette.vue";
import LabelPicker from "../components/LabelPicker.vue";
import { useLabelsStore, type LabelScope } from "../stores/labels";
import { useCalendarStore, type CalendarDay } from "../stores/calendar";
import { useReportsStore } from "../stores/reports";

type Label = {
  id: string;
  name: string;
  color?: string | null;
  scopes: LabelScope[];
};
// Labels created from the Calendar picker show everywhere, Calendar included.
const everyLabelScope: LabelScope[] = [
  "NOTE",
  "CALENDAR",
  "TIME_ENTRY",
  "LOG",
  "BOARD",
];
// The picker's "Create “…”" item carries the typed name in its id.
type Assignment = CalendarDay["labels"][number];
type Day = CalendarDay;
const router = inject(routerKey, undefined);
const route = inject(routeLocationKey, undefined);
/** The day named by ?date=YYYY-MM-DD, when it is a real calendar date. */
function requestedDate() {
  const value = route?.query.date;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = parseISO(value);
  return isValid(date) && format(date, "yyyy-MM-dd") === value ? value : null;
}
const initialDate = requestedDate();
const month = ref(startOfMonth(initialDate ? parseISO(initialDate) : new Date()));
const selected = ref(initialDate ?? format(new Date(), "yyyy-MM-dd"));
const labelsStore = useLabelsStore();
const calendarStore = useCalendarStore();
const reportsStore = useReportsStore();
const { days } = storeToRefs(calendarStore);
const allLabels = computed(() =>
  [...labelsStore.labels].sort((a, b) => a.name.localeCompare(b.name)),
);
// Only labels shown in Calendar are listed under the note; the picker reaches
// every label.
const labels = computed(() =>
  allLabels.value.filter((label) => label.scopes?.includes("CALENDAR")),
);
const note = ref("");
const chosen = ref<Record<string, number | null>>({});
const newLabelColor = ref(labelColors[0]);
const newLabelColorOpen = ref(false);
const editingColor = ref<string | null>(null);
const error = ref("");
const saving = ref(false);
const selectingRange = ref(false);
const rangeStart = ref<string | null>(null);
const rangeEnd = ref<string | null>(null);
const pointerRangeStart = ref<string | null>(null);
const suppressDayClick = ref(false);
const gridDays = computed(() =>
  eachDayOfInterval({
    start: startOfWeek(month.value, { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(month.value), { weekStartsOn: 1 }),
  }),
);
const monthOptions = Array.from({ length: 12 }, (_, index) => ({
  value: index,
  label: format(new Date(2024, index, 1), "MMMM"),
}));
const currentYear = new Date().getFullYear();
const yearOptions = Array.from(
  { length: 21 },
  (_, index) => currentYear - 10 + index,
);
const selectedTitle = computed(() =>
  format(parseISO(selected.value), "EEEE, MMMM d, yyyy"),
);
const currentDay = computed(() => days.value[selected.value]);
const selectedRange = computed(() =>
  rangeStart.value && rangeEnd.value
    ? {
        start:
          rangeStart.value < rangeEnd.value ? rangeStart.value : rangeEnd.value,
        end:
          rangeStart.value < rangeEnd.value ? rangeEnd.value : rangeStart.value,
      }
    : null,
);
const rangeTitle = computed(() =>
  selectedRange.value
    ? `${format(parseISO(selectedRange.value.start), "MMM d")} – ${format(parseISO(selectedRange.value.end), "MMM d, yyyy")}`
    : "",
);

// Every label chosen for the day, Calendar labels included, so the dropdown
// shows the day's whole selection.
const pickedIds = computed({
  get: () => Object.keys(chosen.value),
  set: (ids: string[]) => {
    chosen.value = Object.fromEntries(
      ids
        .map((id) => [id, hasChosen(id) ? chosen.value[id] : null]),
    );
  },
});
function hasChosen(id: string) {
  return Object.prototype.hasOwnProperty.call(chosen.value, id);
}
function shownInList(id: string) {
  return labels.value.some((label) => label.id === id);
}
function selectedAssignments() {
  return Object.entries(chosen.value)
    .filter(([, portion]) => portion !== undefined)
    .map(([labelId, portion]) => ({ labelId, portion }));
}
function selectDay(date: Date) {
  const value = format(date, "yyyy-MM-dd");
  if (selectingRange.value) {
    if (!rangeStart.value || rangeEnd.value) {
      rangeStart.value = value;
      rangeEnd.value = null;
      note.value = "";
      chosen.value = {};
      return;
    }
    rangeEnd.value = value;
    selectingRange.value = false;
    selected.value = value;
    return;
  }
  selected.value = value;
  note.value = currentDay.value?.note || "";
  chosen.value = Object.fromEntries(
    (currentDay.value?.labels || []).map((label) => [
      label.labelId,
      label.portion ?? null,
    ]),
  );
}
function hasLabel(label: Label) {
  return hasChosen(label.id);
}
function labelColor(assignment: Assignment) {
  return (
    labelsStore.byId(assignment.labelId)?.color ||
    assignment.color ||
    labelColors[0]
  );
}
function toggleLabel(label: Label) {
  const next = { ...chosen.value };
  if (hasLabel(label)) delete next[label.id];
  else next[label.id] = null;
  chosen.value = next;
}
async function load() {
  error.value = "";
  try {
    // The visible calendar includes spillover days from adjacent months. Load
    // the whole grid so saved entries in the previous month appear on first load.
    const startDate = format(
      startOfWeek(month.value, { weekStartsOn: 1 }),
      "yyyy-MM-dd",
    );
    const endDate = format(
      endOfWeek(endOfMonth(month.value), { weekStartsOn: 1 }),
      "yyyy-MM-dd",
    );
    const range = `${startDate}:${endDate}`;
    const [savedLabels, savedDays] = await Promise.all([
      labelsStore.load(),
      calendarStore.loadedRanges.includes(range)
        ? Promise.resolve([] as Day[])
        : api<Day[]>(
            `/calendar/days?startDate=${startDate}&endDate=${endDate}`,
          ),
    ]);
    void savedLabels;
    if (savedDays.length || !calendarStore.loadedRanges.includes(range))
      calendarStore.setRange(range, savedDays);
    selectDay(parseISO(selected.value));
  } catch {
    error.value = "Unable to load calendar records.";
  }
}
async function save() {
  saving.value = true;
  error.value = "";
  try {
    if (selectedRange.value) {
      const saved = await api<Day[]>("/calendar/days/range", {
        method: "PUT",
        body: JSON.stringify({
          startDate: selectedRange.value.start,
          endDate: selectedRange.value.end,
          note: note.value || null,
          labels: selectedAssignments(),
        }),
      });
      reportsStore.clear();
      saved.forEach((day) => calendarStore.setDay(day));
      selected.value = selectedRange.value.start;
      rangeStart.value = null;
      rangeEnd.value = null;
      selectDay(parseISO(selected.value));
      return;
    }
    const saved = await api<Day>(`/calendar/days/${selected.value}`, {
      method: "PUT",
      body: JSON.stringify({
        note: note.value || null,
        labels: selectedAssignments(),
      }),
    });
    reportsStore.clear();
    calendarStore.setDay(saved);
    selectDay(parseISO(selected.value));
  } catch {
    error.value = "Unable to save this day.";
  } finally {
    saving.value = false;
  }
}
function selectNewLabelColor(color: string) {
  newLabelColor.value = color;
  newLabelColorOpen.value = false;
}
function toggleEditingColor(labelId: string) {
  editingColor.value = editingColor.value === labelId ? null : labelId;
  newLabelColorOpen.value = false;
}
async function changeColor(label: Label, color: string) {
  try {
    const saved = await api<Label>(`/labels/${label.id}`, {
      method: "PUT",
      body: JSON.stringify({ name: label.name, color, scopes: label.scopes }),
    });
    labelsStore.replace(saved);
    editingColor.value = null;
  } catch {
    error.value = "Unable to update that label color.";
  }
}
function previousMonth() {
  month.value = subMonths(month.value, 1);
  selected.value = format(startOfMonth(month.value), "yyyy-MM-dd");
  void load();
}
function nextMonth() {
  month.value = addMonths(month.value, 1);
  selected.value = format(startOfMonth(month.value), "yyyy-MM-dd");
  void load();
}
function changeMonth(monthIndex: number) {
  month.value = new Date(month.value.getFullYear(), monthIndex, 1);
  selected.value = format(startOfMonth(month.value), "yyyy-MM-dd");
  void load();
}
function changeYear(year: number) {
  month.value = new Date(year, month.value.getMonth(), 1);
  selected.value = format(startOfMonth(month.value), "yyyy-MM-dd");
  void load();
}
function startPointerRange(day: Date) {
  const value = format(day, "yyyy-MM-dd");
  pointerRangeStart.value = value;
  selectingRange.value = true;
  rangeStart.value = value;
  rangeEnd.value = null;
  note.value = "";
  chosen.value = {};
}
function previewPointerRange(day: Date) {
  if (pointerRangeStart.value) rangeEnd.value = format(day, "yyyy-MM-dd");
}
function finishPointerRange(day: Date) {
  const start = pointerRangeStart.value;
  if (!start) return;
  const end = format(day, "yyyy-MM-dd");
  pointerRangeStart.value = null;
  suppressDayClick.value = true;
  if (start === end) {
    selectingRange.value = false;
    rangeStart.value = null;
    rangeEnd.value = null;
    selectDay(day);
    return;
  }
  rangeEnd.value = end;
  selectingRange.value = false;
  selected.value = end;
}
function handleDayClick(day: Date) {
  if (suppressDayClick.value) {
    suppressDayClick.value = false;
    return;
  }
  selectDay(day);
}
function cancelRange() {
  pointerRangeStart.value = null;
  selectingRange.value = false;
  rangeStart.value = null;
  rangeEnd.value = null;
  selectDay(parseISO(selected.value));
}
onMounted(load);
// The selected day lives in the URL, so a day can be linked to and Back returns to it.
watch(selected, (value) => {
  if (router && route && route.query.date !== value)
    void router.replace({ query: { ...route.query, date: value } });
});
watch(
  () => route?.query.date,
  () => {
    const value = requestedDate();
    if (!value || value === selected.value) return;
    const date = parseISO(value);
    const monthChanges = !isSameMonth(date, month.value);
    month.value = startOfMonth(date);
    selected.value = value;
    if (monthChanges) void load();
    else selectDay(date);
  },
);
</script>

<template>
  <section class="calendar-page">
    <header class="calendar-header">
      <div>
        <p class="eyebrow">DAILY RECORDS</p>
        <h1>Calendar</h1>
        <p class="lede">
          Record leave, milestones, and the days worth remembering.
        </p>
      </div>
      <div class="calendar-navigation">
        <button
          class="ghost"
          aria-label="Previous month"
          @click="previousMonth"
        >
          ←
        </button>
        <div class="calendar-picker" aria-label="Choose calendar month">
          <select
            aria-label="Calendar month"
            :value="month.getMonth()"
            @change="
              changeMonth(Number(($event.target as HTMLSelectElement).value))
            "
          >
            <option
              v-for="option in monthOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option></select
          ><select
            aria-label="Calendar year"
            :value="month.getFullYear()"
            @change="
              changeYear(Number(($event.target as HTMLSelectElement).value))
            "
          >
            <option v-for="year in yearOptions" :key="year" :value="year">
              {{ year }}
            </option>
          </select>
        </div>
        <button class="ghost" aria-label="Next month" @click="nextMonth">
          →
        </button>
      </div>
    </header>
    <p v-if="error" class="notice" role="alert">{{ error }}</p>
    <div class="calendar-layout">
      <section class="calendar-grid" aria-label="Calendar">
        <span
          v-for="dayName in ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']"
          :key="dayName"
          class="calendar-weekday"
          >{{ dayName }}</span
        ><button
          v-for="day in gridDays"
          :key="day.toISOString()"
          class="calendar-day"
          :class="{
            muted: day.getMonth() !== month.getMonth(),
            selected: format(day, 'yyyy-MM-dd') === selected,
            'in-range':
              selectedRange &&
              format(day, 'yyyy-MM-dd') >= selectedRange.start &&
              format(day, 'yyyy-MM-dd') <= selectedRange.end,
          }"
          :aria-pressed="format(day, 'yyyy-MM-dd') === selected"
          @mousedown.left.prevent="startPointerRange(day)"
          @mouseenter="previewPointerRange(day)"
          @mouseup.left="finishPointerRange(day)"
          @click="handleDayClick(day)"
        >
          <time>{{ format(day, "d") }}</time
          ><span class="calendar-day-details"
            ><span class="calendar-labels"
              ><span
                v-for="label in days[format(day, 'yyyy-MM-dd')]?.labels.slice(
                  0,
                  2,
                )"
                :key="label.labelId"
                class="calendar-label"
                :style="{ '--calendar-label-color': labelColor(label) }"
                :title="label.name"
                ><i></i>{{ label.name }}</span
              ><small
                v-if="(days[format(day, 'yyyy-MM-dd')]?.labels.length || 0) > 2"
                >+{{ days[format(day, "yyyy-MM-dd")].labels.length - 2 }}</small
              ></span
            ><small v-if="days[format(day, 'yyyy-MM-dd')]?.note"
              >Note</small
            ></span
          >
        </button>
      </section>
      <aside
        class="day-editor"
        @keydown.ctrl.enter.prevent="save"
        @keydown.meta.enter.prevent="save"
      >
        <div class="day-editor-heading">
          <h2>{{ selectedRange ? rangeTitle : selectedTitle }}</h2>
          <button
            v-if="selectingRange || selectedRange"
            class="ghost"
            @click="cancelRange"
          >
            Cancel range
          </button>
        </div>
        <p v-if="selectingRange" class="muted">
          Release on another day to select a range.
        </p>
        <label
          >Note<textarea
            v-model="note"
            rows="5"
            maxlength="20000"
            placeholder="What happened today?"
          ></textarea>
        </label>
        <fieldset>
          <legend>Labels</legend>
          <div v-for="label in labels" :key="label.id" class="day-label">
            <input
              :id="`calendar-label-${label.id}`"
              type="checkbox"
              :checked="hasLabel(label)"
              @change="toggleLabel(label)"
            /><span class="color-popover-anchor"
              ><button
                :id="`calendar-label-color-${label.id}`"
                class="label-color-button"
                type="button"
                :style="{ backgroundColor: label.color || labelColors[0] }"
                :aria-label="`Change ${label.name} color`"
                :aria-expanded="editingColor === label.id"
                :aria-controls="`calendar-label-palette-${label.id}`"
                @click="toggleEditingColor(label.id)"
              ></button
              ><ColorPalette
                v-if="editingColor === label.id"
                :id="`calendar-label-palette-${label.id}`"
                class="label-color-palette"
                :model-value="label.color || labelColors[0]"
                :legend="`Choose ${label.name} color`"
                option-label="Set label color"
                @update:model-value="changeColor(label, $event)" /></span
            ><label :for="`calendar-label-${label.id}`">{{ label.name }}</label
            ><select
              :value="chosen[label.id] ?? ''"
              :class="{ 'day-portion--unset': !hasLabel(label) }"
              :disabled="!hasLabel(label)"
              :aria-hidden="hasLabel(label) ? undefined : 'true'"
              :aria-label="`${label.name} day portion`"
              @change="
                chosen = {
                  ...chosen,
                  [label.id]: ($event.target as HTMLSelectElement).value
                    ? Number(($event.target as HTMLSelectElement).value)
                    : null,
                }
              "
            >
              <option value="">Marker</option>
              <option value="0">No marker</option>
              <option value="0.25">¼ day</option>
              <option value="0.5">½ day</option>
              <option value="0.75">¾ day</option>
              <option value="1">Full day</option>
            </select>
          </div>
          <p v-if="!labels.length" class="muted">
            Add or create a label below to begin.
          </p>
        </fieldset>
        <div class="new-calendar-label">
          <LabelPicker
            v-model="pickedIds"
            :labels="allLabels"
            label="Add or create calendar label"
            :create-scopes="everyLabelScope"
            :create-color="newLabelColor"
            @label-created="error = ''"
          />
          ><span class="color-popover-anchor"
            ><button
              id="new-calendar-label-color"
              class="label-color-button"
              type="button"
              :style="{ backgroundColor: newLabelColor }"
              :aria-label="`Choose new label color (${newLabelColor})`"
              :aria-expanded="newLabelColorOpen"
              aria-controls="new-calendar-label-palette"
              @click="
                newLabelColorOpen = !newLabelColorOpen;
                editingColor = null;
              "
            ></button
            ><ColorPalette
              v-if="newLabelColorOpen"
              id="new-calendar-label-palette"
              class="new-label-color-palette"
              :model-value="newLabelColor"
              legend="New calendar label color"
              option-label="Choose new label color"
              @update:model-value="selectNewLabelColor"
          /></span>
        </div>
        <button
          class="primary"
          :disabled="saving || selectingRange"
          @click="save"
        >
          {{
            saving ? "Saving…" : selectedRange ? "Apply to range" : "Save day"
          }}
        </button>
      </aside>
    </div>
  </section>
</template>
