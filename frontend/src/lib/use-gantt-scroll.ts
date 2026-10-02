import { computed, onBeforeUnmount, ref, watch, type Ref } from "vue";
import { addCalendarDays, inclusiveDayCount, timelineDays } from "./board-gantt";

// Native scrolling provides pixel movement, inertia, touch and keyboard input.
// Only the viewport plus a small buffer has date cells. Rebase the coordinate
// space near its distant ends, keeping the date and fractional pixel fixed.
const SCROLL_DAYS = 10000;
const CENTER_DAY = SCROLL_DAYS / 2;
const BUFFER_DAYS = 7;

export function useGanttScroll(element: Ref<HTMLElement | null>, start: Ref<string>, dayWidth: Ref<number>, today: string, navigate: (date: string) => void) {
  const origin = ref(start.value);
  const left = ref(CENTER_DAY * dayWidth.value);
  let coordinateDayWidth = dayWidth.value;
  const viewport = ref(1120);
  const width = computed(() => SCROLL_DAYS * dayWidth.value);
  const first = computed(() => Math.max(0, Math.floor(left.value / dayWidth.value) - BUFFER_DAYS));
  const count = computed(() => Math.ceil(viewport.value / dayWidth.value) + BUFFER_DAYS * 2 + 1);
  const dateAt = (index: number) => addCalendarDays(origin.value, index - CENTER_DAY);
  const days = computed(() => timelineDays(dateAt(first.value), dateAt(first.value + count.value - 1)));
  const windowStyle = computed(() => ({ left: `${first.value * dayWidth.value}px`, width: `${days.value.length * dayWidth.value}px` }));
  const todayPosition = computed(() => {
    const index = CENTER_DAY + inclusiveDayCount(origin.value, today) - 1;
    return index < first.value || index >= first.value + count.value ? undefined : `${(index + 0.5) * dayWidth.value}px`;
  });

  function measure() { if (element.value?.clientWidth) viewport.value = element.value.clientWidth; }
  function jump(date: string) {
    origin.value = date;
    coordinateDayWidth = dayWidth.value;
    left.value = CENTER_DAY * dayWidth.value;
    if (element.value) element.value.scrollLeft = left.value;
    measure();
  }
  function onScroll() {
    const el = element.value;
    if (!el) return;
    measure();
    const previous = left.value;
    let offset = el.scrollLeft;
    const moved = previous !== offset;
    const index = Math.floor(offset / dayWidth.value);
    const date = dateAt(index);
    if (index < BUFFER_DAYS * 2 || index > SCROLL_DAYS - count.value * 2) {
      origin.value = date;
      offset = CENTER_DAY * dayWidth.value + offset % dayWidth.value;
      el.scrollLeft = offset;
    }
    left.value = offset;
    if (moved) navigate(date);
  }
  const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
  watch(element, (el) => {
    resize?.disconnect();
    if (el) { jump(start.value); resize?.observe(el); }
  }, { flush: "post" });
  watch(dayWidth, (next) => {
    const dayOffset = left.value / coordinateDayWidth - CENTER_DAY;
    coordinateDayWidth = next;
    left.value = (CENTER_DAY + dayOffset) * next;
    if (element.value) element.value.scrollLeft = left.value;
    measure();
  }, { flush: "post" });
  onBeforeUnmount(() => resize?.disconnect());
  return { days, width, windowStyle, todayPosition, onScroll, jump };
}
