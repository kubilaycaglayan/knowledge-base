import { computed, nextTick, onBeforeUnmount, ref, watch, type Ref } from "vue";
import { addCalendarDays, addCalendarMonths, inclusiveDayCount, timelineDays } from "./board-gantt";

// Native scrolling provides pixel movement, inertia, touch and keyboard input.
// The scrollable range starts two months either side of the initial date and
// grows by two months whenever the viewport comes near one of its ends; only
// the viewport plus a small buffer has date cells. Prepending shifts the scroll
// offset by the added width, keeping the date and fractional pixel fixed.
const WINDOW_MONTHS = 2;
const EDGE_DAYS = 30;
const BUFFER_DAYS = 7;

export function useGanttScroll(element: Ref<HTMLElement | null>, start: Ref<string>, dayWidth: Ref<number>, today: string, navigate: (date: string) => void) {
  // origin is the date at scroll offset 0; total is the number of loaded days.
  const origin = ref(addCalendarMonths(start.value, -WINDOW_MONTHS));
  const total = ref(1);
  const left = ref(0);
  let coordinateDayWidth = dayWidth.value;
  const viewport = ref(1120);
  const visibleDays = computed(() => Math.ceil(viewport.value / dayWidth.value));
  const width = computed(() => total.value * dayWidth.value);
  const first = computed(() => Math.min(Math.max(0, Math.floor(left.value / dayWidth.value) - BUFFER_DAYS), total.value - 1));
  const count = computed(() => Math.min(visibleDays.value + BUFFER_DAYS * 2 + 1, total.value - first.value));
  const dateAt = (index: number) => addCalendarDays(origin.value, index);
  const indexOf = (date: string) => inclusiveDayCount(origin.value, date) - 1;
  const days = computed(() => timelineDays(dateAt(first.value), dateAt(first.value + count.value - 1)));
  const windowStyle = computed(() => ({ left: `${first.value * dayWidth.value}px`, width: `${days.value.length * dayWidth.value}px` }));
  const todayPosition = computed(() => {
    const index = indexOf(today);
    return index < first.value || index >= first.value + count.value ? undefined : `${(index + 0.5) * dayWidth.value}px`;
  });

  function measure() { if (element.value?.clientWidth) viewport.value = element.value.clientWidth; }
  // Loads two more months at an end the viewport is near and returns the
  // offset that keeps the same date in view.
  function extend(offset: number) {
    const index = offset / dayWidth.value;
    if (index < EDGE_DAYS) {
      const added = -indexOf(addCalendarMonths(origin.value, -WINDOW_MONTHS));
      origin.value = addCalendarDays(origin.value, -added);
      total.value += added;
      offset += added * dayWidth.value;
    }
    if (offset / dayWidth.value + visibleDays.value > total.value - EDGE_DAYS) total.value = indexOf(addCalendarMonths(dateAt(total.value - 1), WINDOW_MONTHS)) + 1;
    return offset;
  }
  // The content width updates on the next render, so the offset is applied again after it.
  function scrollTo(offset: number) {
    left.value = offset;
    if (element.value) element.value.scrollLeft = offset;
    void nextTick(() => { if (element.value && element.value.scrollLeft !== left.value) element.value.scrollLeft = left.value; });
  }
  function jump(date: string) {
    measure();
    origin.value = addCalendarMonths(date, -WINDOW_MONTHS);
    total.value = indexOf(addCalendarMonths(date, WINDOW_MONTHS)) + 1 + visibleDays.value;
    coordinateDayWidth = dayWidth.value;
    scrollTo(indexOf(date) * dayWidth.value);
  }
  function onScroll() {
    const el = element.value;
    if (!el) return;
    measure();
    const moved = left.value !== el.scrollLeft;
    const offset = extend(el.scrollLeft);
    if (offset !== el.scrollLeft) scrollTo(offset);
    else left.value = offset;
    if (moved) navigate(dateAt(Math.floor(offset / dayWidth.value)));
  }
  const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => { measure(); scrollTo(extend(left.value)); });
  watch(element, (el) => {
    resize?.disconnect();
    if (el) { jump(start.value); resize?.observe(el); }
  }, { flush: "post" });
  watch(dayWidth, (next) => {
    const dayOffset = left.value / coordinateDayWidth;
    coordinateDayWidth = next;
    measure();
    scrollTo(extend(dayOffset * next));
  }, { flush: "post" });
  onBeforeUnmount(() => resize?.disconnect());
  return { days, width, windowStyle, todayPosition, onScroll, jump };
}
