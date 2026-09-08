<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, parseISO, startOfMonth, startOfWeek, subMonths } from "date-fns";
import { api } from "../lib/api";

type Label = { id: string; name: string; color?: string };
type Assignment = Label & { labelId: string; portion?: number | null };
type Day = { date: string; note?: string | null; labels: Assignment[] };
const month = ref(startOfMonth(new Date()));
const selected = ref(format(new Date(), "yyyy-MM-dd"));
const labels = ref<Label[]>([]);
const days = ref<Record<string, Day>>({});
const note = ref("");
const chosen = ref<Record<string, number | null>>({});
const newLabel = ref("");
const newLabelColor = ref("#2878D5");
const editingColor = ref<string | null>(null);
const error = ref("");
const saving = ref(false);
const selectingRange = ref(false);
const rangeStart = ref<string | null>(null);
const rangeEnd = ref<string | null>(null);
const pointerRangeStart = ref<string | null>(null);
const suppressDayClick = ref(false);
const gridDays = computed(() => eachDayOfInterval({ start: startOfWeek(month.value, { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(month.value), { weekStartsOn: 1 }) }));
const selectedTitle = computed(() => format(parseISO(selected.value), "EEEE, MMMM d, yyyy"));
const currentDay = computed(() => days.value[selected.value]);
const labelColors = ["#2878D5", "#E05D44", "#D69E2E", "#2F855A", "#009688", "#805AD5", "#D53F8C", "#4A5568", "#718096", "#8B5E3C"];
const selectedRange = computed(() => rangeStart.value && rangeEnd.value ? { start: rangeStart.value < rangeEnd.value ? rangeStart.value : rangeEnd.value, end: rangeStart.value < rangeEnd.value ? rangeEnd.value : rangeStart.value } : null);
const rangeTitle = computed(() => selectedRange.value ? `${format(parseISO(selectedRange.value.start), "MMM d")} – ${format(parseISO(selectedRange.value.end), "MMM d, yyyy")}` : "");

function selectedAssignments() { return Object.entries(chosen.value).filter(([, portion]) => portion !== undefined).map(([labelId, portion]) => ({ labelId, portion })); }
function selectDay(date: Date) {
  const value = format(date, "yyyy-MM-dd");
  if (selectingRange.value) {
    if (!rangeStart.value || rangeEnd.value) { rangeStart.value = value; rangeEnd.value = null; note.value = ""; chosen.value = {}; return; }
    rangeEnd.value = value; selectingRange.value = false; selected.value = value; return;
  }
  selected.value = value;
  note.value = currentDay.value?.note || "";
  chosen.value = Object.fromEntries((currentDay.value?.labels || []).map(label => [label.labelId, label.portion ?? null]));
}
function hasLabel(label: Label) { return Object.prototype.hasOwnProperty.call(chosen.value, label.id); }
function toggleLabel(label: Label) {
  const next = { ...chosen.value };
  if (hasLabel(label)) delete next[label.id]; else next[label.id] = null;
  chosen.value = next;
}
async function load() {
  error.value = "";
  try {
    const startDate = format(startOfMonth(month.value), "yyyy-MM-dd");
    const endDate = format(endOfMonth(month.value), "yyyy-MM-dd");
    const [savedLabels, savedDays] = await Promise.all([api<Label[]>("/calendar/labels"), api<Day[]>(`/calendar/days?startDate=${startDate}&endDate=${endDate}`)]);
    labels.value = savedLabels;
    days.value = Object.fromEntries(savedDays.map(day => [day.date, day]));
    selectDay(parseISO(selected.value));
  } catch { error.value = "Unable to load calendar records."; }
}
async function save() {
  saving.value = true; error.value = "";
  try {
    if (selectedRange.value) {
      const saved = await api<Day[]>("/calendar/days/range", { method: "PUT", body: JSON.stringify({ startDate: selectedRange.value.start, endDate: selectedRange.value.end, note: note.value || null, labels: selectedAssignments() }) });
      days.value = { ...days.value, ...Object.fromEntries(saved.map(day => [day.date, day])) };
      selected.value = selectedRange.value.start; rangeStart.value = null; rangeEnd.value = null; selectDay(parseISO(selected.value)); return;
    }
    const saved = await api<Day>(`/calendar/days/${selected.value}`, { method: "PUT", body: JSON.stringify({ note: note.value || null, labels: selectedAssignments() }) });
    days.value = { ...days.value, [selected.value]: saved };
    if (!saved.note && !saved.labels.length) { const next = { ...days.value }; delete next[selected.value]; days.value = next; }
    selectDay(parseISO(selected.value));
  } catch { error.value = "Unable to save this day."; } finally { saving.value = false; }
}
async function addLabel() {
  if (!newLabel.value.trim()) return;
  try { labels.value = [...labels.value, await api<Label>("/calendar/labels", { method: "POST", body: JSON.stringify({ name: newLabel.value.trim(), color: newLabelColor.value }) })].sort((a, b) => a.name.localeCompare(b.name)); newLabel.value = ""; }
  catch { error.value = "Unable to add that label. Label names must be unique."; }
}
async function changeColor(label: Label, color: string) {
  try { const saved = await api<Label>(`/calendar/labels/${label.id}`, { method: "PUT", body: JSON.stringify({ name: label.name, color }) }); labels.value = labels.value.map(value => value.id === saved.id ? saved : value); days.value = Object.fromEntries(Object.entries(days.value).map(([date, day]) => [date, { ...day, labels: day.labels.map(assignment => assignment.labelId === saved.id ? { ...assignment, color: saved.color } : assignment) }])); editingColor.value = null; }
  catch { error.value = "Unable to update that label color."; }
}
function previousMonth() { month.value = subMonths(month.value, 1); selected.value = format(startOfMonth(month.value), "yyyy-MM-dd"); void load(); }
function nextMonth() { month.value = addMonths(month.value, 1); selected.value = format(startOfMonth(month.value), "yyyy-MM-dd"); void load(); }
function startPointerRange(day: Date) { const value = format(day, "yyyy-MM-dd"); pointerRangeStart.value = value; selectingRange.value = true; rangeStart.value = value; rangeEnd.value = null; note.value = ""; chosen.value = {}; }
function previewPointerRange(day: Date) { if (pointerRangeStart.value) rangeEnd.value = format(day, "yyyy-MM-dd"); }
function finishPointerRange(day: Date) {
  const start = pointerRangeStart.value;
  if (!start) return;
  const end = format(day, "yyyy-MM-dd");
  pointerRangeStart.value = null;
  suppressDayClick.value = true;
  if (start === end) { selectingRange.value = false; rangeStart.value = null; rangeEnd.value = null; selectDay(day); return; }
  rangeEnd.value = end;
  selectingRange.value = false;
  selected.value = end;
}
function handleDayClick(day: Date) { if (suppressDayClick.value) { suppressDayClick.value = false; return; } selectDay(day); }
function cancelRange() { pointerRangeStart.value = null; selectingRange.value = false; rangeStart.value = null; rangeEnd.value = null; selectDay(parseISO(selected.value)); }
onMounted(load);
</script>

<template>
  <section class="calendar-page">
    <header class="calendar-header"><div><p class="eyebrow">DAILY RECORDS</p><h1>Calendar</h1><p class="lede">Record leave, milestones, and the days worth remembering.</p></div><div class="calendar-navigation"><button class="ghost" aria-label="Previous month" @click="previousMonth">←</button><strong>{{ format(month, "MMMM yyyy") }}</strong><button class="ghost" aria-label="Next month" @click="nextMonth">→</button></div></header>
    <p v-if="error" class="notice" role="alert">{{ error }}</p>
    <div class="calendar-layout"><section class="calendar-grid" aria-label="Calendar"><span v-for="dayName in ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']" :key="dayName" class="calendar-weekday">{{ dayName }}</span><button v-for="day in gridDays" :key="day.toISOString()" class="calendar-day" :class="{ muted: day.getMonth() !== month.getMonth(), selected: format(day, 'yyyy-MM-dd') === selected, 'in-range': selectedRange && format(day, 'yyyy-MM-dd') >= selectedRange.start && format(day, 'yyyy-MM-dd') <= selectedRange.end }" :aria-pressed="format(day, 'yyyy-MM-dd') === selected" @mousedown.left.prevent="startPointerRange(day)" @mouseenter="previewPointerRange(day)" @mouseup.left="finishPointerRange(day)" @click="handleDayClick(day)"><time>{{ format(day, "d") }}</time><span class="calendar-labels"><span v-for="label in days[format(day, 'yyyy-MM-dd')]?.labels.slice(0, 2)" :key="label.labelId" class="calendar-label" :style="{ '--calendar-label-color': label.color || '#2878d5' }" :title="label.name"><i></i>{{ label.name }}</span><small v-if="(days[format(day, 'yyyy-MM-dd')]?.labels.length || 0) > 2">+{{ days[format(day, 'yyyy-MM-dd')].labels.length - 2 }}</small></span><small v-if="days[format(day, 'yyyy-MM-dd')]?.note">Note</small></button></section>
      <aside class="day-editor"><div class="day-editor-heading"><h2>{{ selectedRange ? rangeTitle : selectedTitle }}</h2><button v-if="selectingRange || selectedRange" class="ghost" @click="cancelRange">Cancel range</button></div><p v-if="selectingRange" class="muted">Release on another day to select a range.</p><label>Note<textarea v-model="note" rows="5" maxlength="20000" placeholder="What happened today?"></textarea></label><fieldset><legend>Labels</legend><div v-for="label in labels" :key="label.id" class="day-label"><input :id="`calendar-label-${label.id}`" type="checkbox" :checked="hasLabel(label)" @change="toggleLabel(label)" /><button class="label-color-button" :style="{ backgroundColor: label.color || '#2878d5' }" :aria-label="`Change ${label.name} color`" @click="editingColor = editingColor === label.id ? null : label.id"></button><label :for="`calendar-label-${label.id}`">{{ label.name }}</label><select v-if="hasLabel(label)" :value="chosen[label.id] ?? ''" :aria-label="`${label.name} day portion`" @change="chosen = { ...chosen, [label.id]: ($event.target as HTMLSelectElement).value ? Number(($event.target as HTMLSelectElement).value) : null }"><option value="">Marker only</option><option value="0.25">¼ day</option><option value="0.5">½ day</option><option value="0.75">¾ day</option><option value="1">Full day</option></select><div v-if="editingColor === label.id" class="label-color-palette" :aria-label="`Choose ${label.name} color`"><button v-for="color in labelColors" :key="color" class="label-color-choice" :class="{ active: (label.color || '#2878d5') === color }" :style="{ backgroundColor: color }" :aria-label="color" @click="changeColor(label, color)"></button></div></div><p v-if="!labels.length" class="muted">Create a label below to begin.</p></fieldset><div class="new-calendar-label"><input v-model="newLabel" aria-label="New calendar label" name="calendar-label" maxlength="80" placeholder="New label, e.g. Vacation" @keyup.enter="addLabel" /><button class="new-label-color" :style="{ backgroundColor: newLabelColor }" :aria-label="`New label color ${newLabelColor}`" @click="newLabelColor = labelColors[(labelColors.indexOf(newLabelColor) + 1) % labelColors.length]"></button><button class="ghost" @click="addLabel">Add</button></div><button class="primary" :disabled="saving || selectingRange" @click="save">{{ saving ? "Saving…" : selectedRange ? "Apply to range" : "Save day" }}</button></aside></div>
  </section>
</template>
