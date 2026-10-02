<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { addCalendarDays, barPosition } from "../lib/board-gantt";
import { contrastingPathTextColor } from "../lib/path-colors";
import { useBoardsStore, type BoardCard } from "../stores/boards";
import { useNoticesStore } from "../stores/notices";

const props = defineProps<{ card: BoardCard; days: string[]; color?: string; textColor?: string; showPriority?: boolean; showStatus?: boolean; showPath?: boolean; statusName?: string; pathName?: string }>();
const emit = defineEmits<{ edit: [card: BoardCard] }>();
const store = useBoardsStore();
const notices = useNoticesStore();
type Mode = "move" | "start" | "end";
const preview = ref<{ startDate: string; dueDate: string } | null>(null);
const unscheduledDay = ref<string | null>(null);
const unscheduledAnchorDay = ref<string | null>(null);
let unscheduledGesture: { id: number; startIndex: number; moved: boolean } | null = null;
let suppressUnscheduledClick = false;
const saving = ref(false), message = ref("");
const barButton = ref<HTMLButtonElement | null>(null), titleOverflows = ref(false);
let titleResizeObserver: ResizeObserver | null = null;
function measureTitle() {
  const element = barButton.value?.querySelector<HTMLElement>(".timeline-bar-title");
  titleOverflows.value = Boolean(element && element.scrollWidth > element.clientWidth + 1);
}
onMounted(() => {
  titleResizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measureTitle);
  const title = barButton.value?.querySelector<HTMLElement>(".timeline-bar-title");
  if (title) titleResizeObserver?.observe(title);
  void nextTick(measureTitle);
});
watch(() => props.card.title, () => { void nextTick(measureTitle); });
onBeforeUnmount(() => titleResizeObserver?.disconnect());
let gesture: { id: number; x: number; dayWidth: number; mode: Mode; start: string; end: string; moved: boolean } | null = null;
let suppressClick = false;
const position = computed(() => {
  const dates = preview.value || props.card;
  const p = barPosition(dates.startDate || dates.dueDate, dates.dueDate || dates.startDate, props.days);
  return p ? { left: `${p.left}%`, width: `${p.width}%` } : {};
});
const foregroundColor = computed(() => contrastingPathTextColor(props.color || "#9f3f22", props.textColor));
function begin(event: PointerEvent, mode: Mode) {
  if (saving.value || event.button !== 0 || !props.days.length) return;
  const target = event.currentTarget as HTMLElement;
  const track = target.closest(".timeline-track")!;
  gesture = { id: event.pointerId, x: event.clientX, dayWidth: track.getBoundingClientRect().width / props.days.length, mode, start: props.card.startDate || props.card.dueDate!, end: props.card.dueDate || props.card.startDate!, moved: false };
  suppressClick = false;
  target.setPointerCapture(event.pointerId);
}
function move(event: PointerEvent) {
  if (!gesture || event.pointerId !== gesture.id) return;
  const g = gesture;
  if (Math.abs(event.clientX - g.x) < 4 && !g.moved) return;
  g.moved = true;
  const delta = Math.round((event.clientX - g.x) / g.dayWidth);
  const start = addCalendarDays(g.start, delta), end = addCalendarDays(g.end, delta);
  preview.value = { startDate: g.mode === "end" ? g.start : g.mode === "start" && start > g.end ? g.end : start, dueDate: g.mode === "start" ? g.end : g.mode === "end" && end < g.start ? g.start : end };
}
async function finish(event: PointerEvent) {
  if (!gesture || gesture.id !== event.pointerId) return;
  move(event);
  const g = gesture, dates = preview.value;
  suppressClick = g.moved;
  gesture = null;
  if (!dates || dates.startDate === g.start && dates.dueDate === g.end) { preview.value = null; return; }
  saving.value = true;
  message.value = "Saving dates…";
  try {
    const { title, body, priority, pathIds, labelIds } = props.card;
    await store.updateCard(props.card, { title, body, priority, pathIds, labelIds, ...dates,
      // Moving a one-sided date preserves its open end; resizing defines both ends.
      ...(g.mode === "move" ? { startDate: props.card.startDate ? dates.startDate : undefined, dueDate: props.card.dueDate ? dates.dueDate : undefined } : {}) });
    message.value = "Dates saved.";
  } catch { message.value = "Could not save dates. Open the card to review its dates and try again."; notices.notify(message.value); }
  finally { saving.value = false; preview.value = null; }
}
function previewUnscheduled(event: PointerEvent) {
  if (props.card.startDate || props.card.dueDate || !props.days.length) return;
  const index = unscheduledIndex(event);
  if (index < 0) return;
  unscheduledDay.value = props.days[index] || null;
  if (unscheduledGesture && event.pointerId === unscheduledGesture.id) {
    if (index !== unscheduledGesture.startIndex) unscheduledGesture.moved = true;
  }
}
function unscheduledIndex(event: PointerEvent) {
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
  if (!bounds.width) return -1;
  return Math.max(0, Math.min(props.days.length - 1, Math.floor((event.clientX - bounds.left) / bounds.width * props.days.length)));
}
function beginUnscheduled(event: PointerEvent) {
  if (event.button !== 0 || saving.value || props.card.startDate || props.card.dueDate) return;
  const index = unscheduledIndex(event);
  if (index < 0) return;
  unscheduledAnchorDay.value = props.days[index];
  unscheduledDay.value = props.days[index];
  unscheduledGesture = { id: event.pointerId, startIndex: index, moved: false };
  suppressUnscheduledClick = false;
  const target = event.currentTarget as HTMLElement;
  if (target.setPointerCapture) target.setPointerCapture(event.pointerId);
}
async function finishUnscheduled(event: PointerEvent) {
  if (!unscheduledGesture || event.pointerId !== unscheduledGesture.id) return;
  previewUnscheduled(event);
  const gesture = unscheduledGesture;
  unscheduledGesture = null;
  if (!gesture.moved || !unscheduledAnchorDay.value || !unscheduledDay.value) return;
  suppressUnscheduledClick = true;
  const startDate = unscheduledAnchorDay.value <= unscheduledDay.value ? unscheduledAnchorDay.value : unscheduledDay.value;
  const dueDate = unscheduledAnchorDay.value <= unscheduledDay.value ? unscheduledDay.value : unscheduledAnchorDay.value;
  await scheduleUnscheduled(startDate, dueDate);
}
async function scheduleUnscheduled(startDate = unscheduledDay.value, dueDate?: string) {
  if (!startDate || props.card.startDate || props.card.dueDate || saving.value) return;
  saving.value = true;
  message.value = "Saving date…";
  try {
    const { title, body, priority, pathIds, labelIds } = props.card;
    await store.updateCard(props.card, { title, body, priority, pathIds, labelIds, startDate, ...(dueDate && dueDate !== startDate ? { dueDate } : {}) });
    message.value = dueDate && dueDate !== startDate ? "Date range saved." : "Date saved.";
  } catch {
    message.value = "Could not save the date. Open the card to review it and try again.";
    notices.notify(message.value);
  } finally { saving.value = false; unscheduledDay.value = null; unscheduledAnchorDay.value = null; }
}
function clickUnscheduled() { if (suppressUnscheduledClick) { suppressUnscheduledClick = false; return; } void scheduleUnscheduled(); }
function cancel() { if (!gesture) return; suppressClick = gesture.moved; gesture = null; preview.value = null; }
function open(event: MouseEvent) { if (suppressClick && event.detail) { suppressClick = false; return; } emit("edit", props.card); }
</script>

<template>
  <button v-if="!card.startDate && !card.dueDate" class="timeline-unscheduled" type="button" :disabled="saving" title="Click to set one date, or drag to select a date range" :style="{ '--prospective-left': `${Math.max(0, Math.min(days.indexOf(unscheduledAnchorDay || unscheduledDay || ''), days.indexOf(unscheduledDay || ''))) * 100 / days.length}%`, '--prospective-width': `${(Math.abs(days.indexOf(unscheduledDay || '') - days.indexOf(unscheduledAnchorDay || unscheduledDay || '')) + 1) * 100 / days.length}%`, '--timeline-card-color': color || '#9f3f22' }" :aria-label="unscheduledAnchorDay && unscheduledDay !== unscheduledAnchorDay ? `Set ${card.title || 'Untitled card'} date range from ${unscheduledAnchorDay} to ${unscheduledDay}` : unscheduledDay ? `Set ${card.title || 'Untitled card'} date to ${unscheduledDay}` : `Choose a date for ${card.title || 'Untitled card'}`" @pointerdown="beginUnscheduled" @pointermove="previewUnscheduled" @pointerup="finishUnscheduled" @pointercancel="unscheduledGesture = null; unscheduledDay = null; unscheduledAnchorDay = null" @lostpointercapture="unscheduledGesture = null" @pointerleave="!unscheduledGesture && (unscheduledDay = null, unscheduledAnchorDay = null)" @click="clickUnscheduled"><span v-if="unscheduledDay" class="timeline-prospective-bar" aria-hidden="true"></span></button>
  <div v-if="position.left" class="timeline-card" :class="{ 'timeline-card-dragging': preview }" :style="{ ...position, '--timeline-card-color': color || '#9f3f22', '--timeline-card-text-color': foregroundColor }" :aria-busy="saving" @pointermove="move" @pointerup="finish" @pointercancel="cancel" @lostpointercapture="cancel" @keydown.esc="cancel">
    <button class="timeline-resize" type="button" :disabled="saving" :aria-label="`Adjust start date for ${card.title || 'Untitled card'}`" title="Drag to adjust start date; click to edit dates" @pointerdown="begin($event, 'start')" @click="open">│</button>
    <button ref="barButton" class="timeline-bar" type="button" :disabled="saving" :aria-label="card.title || 'Untitled card'" aria-description="Drag to move dates; click to edit" @pointerdown="begin($event, 'move')" @click="open"><span class="timeline-bar-title">{{ card.title }}</span><span v-if="saving" class="gantt-saving" aria-hidden="true">◌</span><span v-if="titleOverflows && card.title" class="timeline-card-tooltip" aria-hidden="true">{{ card.title }}</span></button>
    <button class="timeline-resize" type="button" :disabled="saving" :aria-label="`Adjust end date for ${card.title || 'Untitled card'}`" title="Drag to adjust end date; click to edit dates" @pointerdown="begin($event, 'end')" @click="open">│</button>
    <span v-if="showPriority || showStatus && statusName || showPath && pathName" class="timeline-card-details" aria-hidden="true">
      <span v-if="showPriority" class="timeline-card-chip priority-chip" :class="`priority-${card.priority.toLowerCase()}`">{{ card.priority }}</span>
      <span v-if="showStatus && statusName" class="timeline-card-chip">{{ statusName }}</span>
      <span v-if="showPath && pathName" class="timeline-card-chip">{{ pathName }}</span>
    </span>
  </div>
  <span class="visually-hidden" role="status">{{ message }}</span>
</template>

<style scoped>
.timeline-card { position:absolute; top:50%; transform:translateY(-50%); display:flex; min-height:24px; border-radius:7px; background:var(--timeline-card-color); color:#fff; }
.timeline-unscheduled { position:absolute; inset:0; z-index:1; width:100%; min-height:24px; padding:0; border:0; border-radius:0; background:transparent; cursor:crosshair; touch-action:manipulation; }
.timeline-prospective-bar { position:absolute; top:50%; left:var(--prospective-left); width:var(--prospective-width); height:24px; transform:translateY(-50%); border:1px dashed color-mix(in srgb, var(--timeline-card-color, #9f3f22) 75%, transparent); border-radius:7px; background:color-mix(in srgb, var(--timeline-card-color, #9f3f22) 18%, transparent); box-shadow:0 2px 7px #0002; pointer-events:none; }
.timeline-card-dragging { user-select:none; box-shadow:0 3px 8px #0003; }
.timeline-card-details { position:absolute; z-index:2; left:calc(100% + 6px); top:50%; display:flex; align-items:center; gap:5px; width:max-content; max-width:min(50vw, 420px); transform:translateY(-50%); pointer-events:none; }
.timeline-card-chip { display:inline-flex; align-items:center; min-height:20px; max-width:160px; box-sizing:border-box; overflow:hidden; padding:1px 7px; border:1px solid var(--workspace-control-border, #cbd5e1); border-radius:999px; background:var(--workspace-surface, #fff); color:var(--workspace-text, #334155); font-size:.68rem; font-weight:650; line-height:1.2; text-overflow:ellipsis; white-space:nowrap; box-shadow:0 1px 3px #0002; }
.priority-chip.priority-urgent { color:#b42318; }.priority-chip.priority-high { color:#c2410c; }.priority-chip.priority-low { color:#2563eb; }
.timeline-bar { position:relative; flex:1; min-width:0; min-height:24px; overflow:visible; padding:.15rem 0; border:0; border-radius:0; background:var(--timeline-card-color); color:var(--timeline-card-text-color); text-align:left; font-size:.8rem; cursor:grab; touch-action:none; }
.timeline-bar-title { position:sticky; left:0; display:block; width:max-content; max-width:100%; min-width:0; padding-left:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.timeline-card-tooltip { position:absolute; z-index:10; left:0; bottom:calc(100% + 4px); width:max-content; max-width:min(420px, 70vw); overflow-wrap:anywhere; white-space:normal; padding:.35rem .55rem; border:1px solid color-mix(in srgb, #fff 28%, var(--timeline-card-color)); border-radius:6px; background:color-mix(in srgb, var(--timeline-card-color) 78%, black); color:#fff; box-shadow:0 4px 12px #0005; text-align:left; pointer-events:none; }
.timeline-bar:hover .timeline-card-tooltip, .timeline-bar:focus-visible .timeline-card-tooltip { display:block; }
.timeline-card-tooltip { display:none; }
.timeline-resize { flex:0 0 24px; min-width:24px; min-height:24px; padding:0; border:0; border-radius:7px; background:var(--timeline-card-color); color:#fff; cursor:ew-resize; touch-action:none; }
.timeline-bar:hover, .timeline-bar:focus-visible, .timeline-resize:hover, .timeline-resize:focus-visible { background:color-mix(in srgb, var(--timeline-card-color) 78%, black); }
.timeline-bar:focus-visible, .timeline-resize:focus-visible { outline:2px solid var(--workspace-text, #172b4d); outline-offset:2px; }
.gantt-saving { display:inline-block; margin-left:.3rem; animation:gantt-saving 1s linear infinite; }
@keyframes gantt-saving { to { transform:rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .gantt-saving { animation:none; } }
@media (max-width:700px) { .timeline-resize { flex-basis:44px; min-width:44px; min-height:44px; } }
</style>
