import { defineStore } from "pinia";

export const useReportsStore = defineStore("reports", {
  state: () => ({ reports: {} as Record<string, unknown> }),
  actions: {
    get<T>(key: string) {
      return this.reports[key] as T | undefined;
    },
    set(key: string, report: unknown) {
      this.reports[key] = report;
    },
    clear() {
      this.reports = {};
    },
  },
});
