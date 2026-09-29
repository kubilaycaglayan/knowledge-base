<script setup lang="ts">
import { computed, ref } from "vue";
import { addCalendarDays, barPosition } from "../lib/board-gantt";
import { useBoardsStore, type BoardCard } from "../stores/boards";
import { useNoticesStore } from "../stores/notices";

const props = defineProps<{ card: BoardCard; days: string[] }>();
const emit = defineEmits<{ edit: [card: BoardCard] }>();
const store = useBoardsStore();
const notices = useNoticesStore();
type Mode = "move" | "start" | "end";
const preview = ref<{ startDate: string; dueDate: string } | null>(null);
const saving = ref(false), message = ref("");
let gesture: { id: number; x: number; dayWidth: number; mode: Mode; start: string; end: string; moved: boolean } | null = null;
let suppressClick = false;
const position = computed(() => {
  const dates = preview.value || props.card;
  const p = barPosition(dates.startDate || dates.dueDate, dates.dueDate || dates.startDate, props.days);
  return p ? { left: `${p.left}%`, width: `${p.width}%` } : {};
});
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
function cancel() { if (!gesture) return; suppressClick = gesture.moved; gesture = null; preview.value = null; }
function open(event: MouseEvent) { if (suppressClick && event.detail) { suppressClick = false; return; } emit("edit", props.card); }
</script>

<template>
  <div v-if="position.left" class="timeline-card" :class="{ 'timeline-card-dragging': preview }" :style="position" :aria-busy="saving" @pointermove="move" @pointerup="finish" @pointercancel="cancel" @lostpointercapture="cancel" @keydown.esc="cancel">
    <button class="timeline-resize" type="button" :disabled="saving" :aria-label="`Adjust start date for ${card.title || 'Untitled card'}`" title="Drag to adjust start date; click to edit dates" @pointerdown="begin($event, 'start')" @click="open">│</button>
    <button class="timeline-bar" type="button" :disabled="saving" :aria-label="card.title || 'Untitled card'" title="Drag to move dates; click to edit" @pointerdown="begin($event, 'move')" @click="open">{{ card.title }}<span v-if="saving" class="gantt-saving" aria-hidden="true">◌</span></button>
    <button class="timeline-resize" type="button" :disabled="saving" :aria-label="`Adjust end date for ${card.title || 'Untitled card'}`" title="Drag to adjust end date; click to edit dates" @pointerdown="begin($event, 'end')" @click="open">│</button>
  </div>
  <span class="visually-hidden" role="status">{{ message }}</span>
</template>

<style scoped>
.timeline-card { position:absolute; display:flex; min-height:44px; border-radius:7px; background:#9f3f22; color:#fff; }
.timeline-card-dragging { user-select:none; box-shadow:0 3px 8px #0003; }
.timeline-bar { flex:1; min-width:0; min-height:44px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding:.3rem 0; border:0; border-radius:0; background:#9f3f22; color:#fff; text-align:left; font-size:.8rem; cursor:grab; touch-action:none; }
.timeline-resize { flex:0 0 24px; min-width:24px; padding:0; border:0; border-radius:7px; background:#9f3f22; color:#fff; cursor:ew-resize; touch-action:none; }
.timeline-bar:hover, .timeline-bar:focus-visible, .timeline-resize:hover, .timeline-resize:focus-visible { background:#7f311b; }
.timeline-bar:focus-visible, .timeline-resize:focus-visible { outline:2px solid var(--workspace-text, #172b4d); outline-offset:2px; }
.gantt-saving { display:inline-block; margin-left:.3rem; animation:gantt-saving 1s linear infinite; }
@keyframes gantt-saving { to { transform:rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .gantt-saving { animation:none; } }
@media (max-width:700px) { .timeline-resize { flex-basis:44px; min-width:44px; } }
</style>
