import { defineStore } from "pinia";

export type CalendarAssignment = { labelId: string; name: string; color?: string | null; portion?: number | null };
export type CalendarDay = { date: string; note?: string | null; labels: CalendarAssignment[] };

export const useCalendarStore = defineStore("calendar", {
  state: () => ({ days: {} as Record<string, CalendarDay>, loadedRanges: [] as string[] }),
  getters: {
    byDate: (state) => (date: string) => state.days[date],
  },
  actions: {
    setRange(range: string, days: CalendarDay[]) {
      this.days = { ...this.days, ...Object.fromEntries(days.map((day) => [day.date, day])) };
      this.loadedRanges = [...new Set([...this.loadedRanges, range])];
    },
    setDay(day: CalendarDay) {
      if (!day.note && !day.labels.length) {
        const next = { ...this.days };
        delete next[day.date];
        this.days = next;
        return;
      }
      this.days = { ...this.days, [day.date]: day };
    },
  },
});
