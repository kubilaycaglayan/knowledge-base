import { defineStore } from "pinia";

export type Timer = { id: string; pathId?: string; labelIds?: string[]; startedAt: string; description?: string; running?: boolean };

export const useTimerStore = defineStore("timer", {
  state: () => ({ current: null as Timer | null, version: 0 }),
  getters: { isRunning: (state) => Boolean(state.current) },
  actions: {
    setCurrent(timer: Timer | null) {
      this.current = timer;
      this.version++;
    },
    clear() { this.setCurrent(null); },
  },
});
