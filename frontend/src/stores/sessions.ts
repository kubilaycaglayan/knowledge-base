import { defineStore } from "pinia";

export type Session = {
  id: string;
  pathId?: string;
  labelIds?: string[];
  startedAt: string;
  endedAt?: string;
  durationSeconds?: number;
  description?: string;
  source: string;
  running?: boolean;
};
export type SessionPage = {
  sessions: Session[];
  page: number;
  totalPages: number;
  totalSessions: number;
};

export const useSessionsStore = defineStore("sessions", {
  state: () => ({ pages: {} as Record<string, SessionPage> }),
  actions: {
    setPage(key: string, page: SessionPage) {
      this.pages[key] = page;
    },
    cachedPage(key: string) {
      return this.pages[key];
    },
    clearPages() {
      this.pages = {};
    },
  },
});
