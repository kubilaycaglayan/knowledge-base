<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, parseISO, startOfMonth, startOfWeek, subMonths } from "date-fns";
import { api } from "../lib/api";
import { labelColors } from "../lib/label-colors";
import ColorPalette from "../components/ColorPalette.vue";

type Scope = "NOTE" | "CALENDAR" | "TIME_ENTRY";
type Label = { id: string; name: string; color?: string | null; scopes: Scope[] };
type Assignment = { labelId: string; name: string; color?: string | null; portion?: number | null };
type Day = { date: string; note?: string | null; labels: Assignment[] };
const month = ref(startOfMonth(new Date()));
const selected = ref(format(new Date(), "yyyy-MM-dd"));
const labels = ref<Label[]>([]);
const days = ref<Record<string, Day>>({});
const note = ref("");
const chosen = ref<Record<string, number | null>>({});
const newLabel = ref("");
const newLabelColor = ref(labelColors[0]);
const newLabelColorOpen = ref(false);
const editingColor = ref<string | null>(null);
const error = ref("");
const saving = ref(false);
const addingLabel = ref(false);
const selectingRange = ref(false);
const rangeStart = ref<string | null>(null);
const rangeEnd = ref<string | null>(null);
const pointerRangeStart = ref<string | null>(null);
const suppressDayClick = ref(false);
const gridDays = computed(() => eachDayOfInterval({ start: startOfWeek(month.value, { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(month.value), { weekStartsOn: 1 }) }));
const selectedTitle = computed(() => format(parseISO(selected.value), "EEEE, MMMM d, yyyy"));
const currentDay = computed(() => days.value[selected.value]);
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
function labelColor(labelId: string) {
  return labels.value.find(label => label.id === labelId)?.color || labelColors[0];
}
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
    const [savedLabels, savedDays] = await Promise.all([api<Label[]>("/labels?scope=CALENDAR"), api<Day[]>(`/calendar/days?startDate=${startDate}&endDate=${endDate}`)]);
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
  if (addingLabel.value || !newLabel.value.trim()) return;
  addingLabel.value = true;
  try { labels.value = [...labels.value, await api<Label>("/labels", { method: "POST", body: JSON.stringify({ name: newLabel.value.trim(), color: newLabelColor.value, scopes: ["CALENDAR"] }) })].sort((a, b) => a.name.localeCompare(b.name)); newLabel.value = ""; }
  catch { error.value = "Unable to add that label. Label names must be unique."; }
  finally { addingLabel.value = false; }
}
function handleNewLabelKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229) return;
  if (event.key === "Enter") {
    event.preventDefault();
    void addLabel();
  }
}
function handleNewLabelBeforeInput(event: InputEvent) {
  if (event.inputType !== "insertLineBreak" && event.inputType !== "insertParagraph") return;
  event.preventDefault();
  void addLabel();
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
  try { const saved = await api<Label>(`/labels/${label.id}`, { method: "PUT", body: JSON.stringify({ name: label.name, color, scopes: label.scopes }) }); labels.value = labels.value.map(value => value.id === saved.id ? saved : value); editingColor.value = null; }
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
    <div class="calendar-layout"><section class="calendar-grid" aria-label="Calendar"><span v-for="dayName in ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']" :key="dayName" class="calendar-weekday">{{ dayName }}</span><button v-for="day in gridDays" :key="day.toISOString()" class="calendar-day" :class="{ muted: day.getMonth() !== month.getMonth(), selected: format(day, 'yyyy-MM-dd') === selected, 'in-range': selectedRange && format(day, 'yyyy-MM-dd') >= selectedRange.start && format(day, 'yyyy-MM-dd') <= selectedRange.end }" :aria-pressed="format(day, 'yyyy-MM-dd') === selected" @mousedown.left.prevent="startPointerRange(day)" @mouseenter="previewPointerRange(day)" @mouseup.left="finishPointerRange(day)" @click="handleDayClick(day)"><time>{{ format(day, "d") }}</time><span class="calendar-labels"><span v-for="label in days[format(day, 'yyyy-MM-dd')]?.labels.slice(0, 2)" :key="label.labelId" class="calendar-label" :style="{ '--calendar-label-color': labelColor(label.labelId) }" :title="label.name"><i></i>{{ label.name }}</span><small v-if="(days[format(day, 'yyyy-MM-dd')]?.labels.length || 0) > 2">+{{ days[format(day, 'yyyy-MM-dd')].labels.length - 2 }}</small></span><small v-if="days[format(day, 'yyyy-MM-dd')]?.note">Note</small></button></section>
      <aside class="day-editor"><div class="day-editor-heading"><h2>{{ selectedRange ? rangeTitle : selectedTitle }}</h2><button v-if="selectingRange || selectedRange" class="ghost" @click="cancelRange">Cancel range</button></div><p v-if="selectingRange" class="muted">Release on another day to select a range.</p><label>Note<textarea v-model="note" rows="5" maxlength="20000" placeholder="What happened today?"></textarea></label><fieldset><legend>Labels</legend><div v-for="label in labels" :key="label.id" class="day-label"><input :id="`calendar-label-${label.id}`" type="checkbox" :checked="hasLabel(label)" @change="toggleLabel(label)" /><span class="color-popover-anchor"><button :id="`calendar-label-color-${label.id}`" class="label-color-button" type="button" :style="{ backgroundColor: label.color || labelColors[0] }" :aria-label="`Change ${label.name} color`" :aria-expanded="editingColor === label.id" :aria-controls="`calendar-label-palette-${label.id}`" @click="toggleEditingColor(label.id)"></button><ColorPalette v-if="editingColor === label.id" :id="`calendar-label-palette-${label.id}`" class="label-color-palette" :model-value="label.color || labelColors[0]" :legend="`Choose ${label.name} color`" option-label="Set label color" @update:model-value="changeColor(label, $event)" /></span><label :for="`calendar-label-${label.id}`">{{ label.name }}</label><select v-if="hasLabel(label)" :value="chosen[label.id] ?? ''" :aria-label="`${label.name} day portion`" @change="chosen = { ...chosen, [label.id]: ($event.target as HTMLSelectElement).value ? Number(($event.target as HTMLSelectElement).value) : null }"><option value="">Marker only</option><option value="0.25">¼ day</option><option value="0.5">½ day</option><option value="0.75">¾ day</option><option value="1">Full day</option></select></div><p v-if="!labels.length" class="muted">Create a label below to begin.</p></fieldset><div class="new-calendar-label"><input v-model="newLabel" aria-label="New calendar label" name="calendar-label" maxlength="80" placeholder="New label, e.g. Vacation" enterkeyhint="done" @beforeinput="handleNewLabelBeforeInput" @keydown="handleNewLabelKeydown" /><span class="color-popover-anchor"><button id="new-calendar-label-color" class="label-color-button" type="button" :style="{ backgroundColor: newLabelColor }" :aria-label="`Choose new label color (${newLabelColor})`" :aria-expanded="newLabelColorOpen" aria-controls="new-calendar-label-palette" @click="newLabelColorOpen = !newLabelColorOpen; editingColor = null"></button><ColorPalette v-if="newLabelColorOpen" id="new-calendar-label-palette" class="new-label-color-palette" :model-value="newLabelColor" legend="New calendar label color" option-label="Choose new label color" @update:model-value="selectNewLabelColor" /></span><button class="ghost" type="button" @click="addLabel">Add</button></div><button class="primary" :disabled="saving || selectingRange" @click="save">{{ saving ? "Saving…" : selectedRange ? "Apply to range" : "Save day" }}</button></aside></div>
  </section>
</template>
