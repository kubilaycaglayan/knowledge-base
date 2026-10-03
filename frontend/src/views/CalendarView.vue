<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { mdiPlus } from "@mdi/js";
import { api } from "../lib/api";
import { labelColors } from "../lib/label-colors";
import ColorPalette from "../components/ColorPalette.vue";
import { useLabelsStore, type LabelScope } from "../stores/labels";
import { useCalendarStore, type CalendarDay } from "../stores/calendar";
import { useReportsStore } from "../stores/reports";

type Label = {
  id: string;
  name: string;
  color?: string | null;
  scopes: LabelScope[];
};
type PickerItem = { id: string; name: string; color?: string | null };
// Labels created from the Calendar picker show everywhere, Calendar included.
const everyLabelScope: LabelScope[] = [
  "NOTE",
  "CALENDAR",
  "TIME_ENTRY",
  "LOG",
  "BOARD",
];
// The picker's "Create “…”" item carries the typed name in its id.
const CREATE_PREFIX = "create:";
type Assignment = CalendarDay["labels"][number];
type Day = CalendarDay;
const month = ref(startOfMonth(new Date()));
const selected = ref(format(new Date(), "yyyy-MM-dd"));
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
const pickerSearch = ref("");
const newLabelColor = ref(labelColors[0]);
const newLabelColorOpen = ref(false);
const editingColor = ref<string | null>(null);
const error = ref("");
const saving = ref(false);
const creatingLabel = ref(false);
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

const pickerItems = computed<PickerItem[]>(() => {
  const items: PickerItem[] = allLabels.value;
  const name = (pickerSearch.value || "").trim();
  if (
    !name ||
    allLabels.value.some(
      (label) => label.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
    )
  )
    return items;
  return [
    ...items,
    { id: `${CREATE_PREFIX}${name}`, name: `Create “${name}”` },
  ];
});
// Every label chosen for the day, Calendar labels included, so the dropdown
// shows the day's whole selection.
const pickedIds = computed({
  get: () => Object.keys(chosen.value),
  set: (ids: string[]) => {
    const create = ids.find((id) => id.startsWith(CREATE_PREFIX));
    if (create) void createLabel(create.slice(CREATE_PREFIX.length));
    chosen.value = Object.fromEntries(
      ids
        .filter((id) => !id.startsWith(CREATE_PREFIX))
        .map((id) => [id, hasChosen(id) ? chosen.value[id] : null]),
    );
  },
});

// Vuetify drops the placeholder once anything is selected, so while the
// day's labels are all in the Labels list (no chips), show it ourselves.
const showPickerPrompt = computed(
  () => !pickerSearch.value && pickedIds.value.every((id) => shownInList(id)),
);
function hasChosen(id: string) {
  return Object.prototype.hasOwnProperty.call(chosen.value, id);
}
function isCreateItem(id: string) {
  return id.startsWith(CREATE_PREFIX);
}
function shownInList(id: string) {
  return labels.value.some((label) => label.id === id);
}
function filterLabels(
  value: string,
  query: string,
  item?: { raw?: PickerItem },
) {
  if (item?.raw && isCreateItem(item.raw.id)) return true;
  const search = query.trim().toLocaleLowerCase();
  return !search || value.toLocaleLowerCase().includes(search);
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
async function createLabel(name: string) {
  if (creatingLabel.value || !name) return;
  creatingLabel.value = true;
  error.value = "";
  try {
    const created = await api<Label>("/labels", {
      method: "POST",
      body: JSON.stringify({
        name,
        color: newLabelColor.value,
        scopes: everyLabelScope,
      }),
    });
    labelsStore.add(created);
    chosen.value = { ...chosen.value, [created.id]: null };
  } catch {
    error.value = "Unable to create that label. Label names must be unique.";
  } finally {
    creatingLabel.value = false;
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
          <v-autocomplete
            v-model="pickedIds"
            v-model:search="pickerSearch"
            class="calendar-label-picker"
            :items="pickerItems"
            item-title="name"
            item-value="id"
            :custom-filter="filterLabels"
            multiple
            chips
            closable-chips
            auto-select-first
            clear-on-select
            hide-details
            flat
            variant="solo-filled"
            density="compact"
            placeholder="Add or create label…"
            aria-label="Add or create label"
            name="calendar-label"
            maxlength="80"
            enterkeyhint="done"
            no-data-text="No matching labels"
            :menu-props="{ contentClass: 'calendar-label-picker-menu' }"
            ><template #chip="{ item, props: chipProps }"
              ><v-chip
                v-if="!shownInList(item.id)"
                v-bind="chipProps"
                class="calendar-picked-chip"
                label
                :text="item.name"
                :close-label="`Remove ${item.name}`"
                :style="{
                  '--calendar-label-color': item.color || labelColors[0],
                }"
                ><template #prepend
                  ><i
                    class="calendar-picked-dot"
                    aria-hidden="true"
                  ></i></template></v-chip
              ><span
                v-else-if="item.id === pickedIds[0] && showPickerPrompt"
                class="calendar-picker-placeholder"
                aria-hidden="true"
                >Add or create label…</span
              ></template
            ><template #item="{ item, props: itemProps }"
              ><v-list-item
                v-bind="itemProps"
                role="option"
                :class="{ 'calendar-label-create': isCreateItem(item.id) }"
                ><template #prepend="{ isSelected }"
                  ><v-icon
                    v-if="isCreateItem(item.id)"
                    :icon="mdiPlus"
                    size="18"
                    aria-hidden="true" /><template v-else
                    ><v-checkbox-btn
                      :model-value="isSelected"
                      :ripple="false"
                      tabindex="-1"
                      aria-hidden="true"
                      density="compact"
                      @click.prevent /><i
                      class="calendar-picker-swatch"
                      aria-hidden="true"
                      :style="{
                        backgroundColor: item.color || labelColors[0],
                      }"
                    ></i></template></template></v-list-item></template></v-autocomplete
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
