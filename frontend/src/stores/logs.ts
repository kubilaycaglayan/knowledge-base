import { defineStore } from "pinia";
import { api } from "../lib/api";

export type Log = {
  id: string;
  body: string;
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  labelIds?: string[];
};

export const useLogsStore = defineStore("logs", {
  state: () => ({ logs: [] as Log[], loaded: false }),
  actions: {
    setAll(logs: Log[]) {
      this.logs = logs;
      this.loaded = true;
    },
    upsert(log: Log) {
      const remaining = this.logs.filter((value) => value.id !== log.id);
      this.logs = [log, ...remaining].sort(
        (left, right) =>
          right.occurredAt.localeCompare(left.occurredAt) ||
          right.id.localeCompare(left.id),
      );
    },
    remove(id: string) {
      this.logs = this.logs.filter((log) => log.id !== id);
    },
    /**
     * Saves a log's text and time. When another window saved first, the edit
     * is reapplied on top of the latest version rather than lost.
     */
    async save(log: Log, edit: { body: string; occurredAt: string }) {
      const put = (version: number) =>
        api<Log>(`/logs/${log.id}`, {
          method: "PUT",
          body: JSON.stringify({ ...edit, version }),
        });
      let saved: Log;
      try {
        saved = await put(log.version);
      } catch (cause) {
        if (!String(cause).includes("Log changed in another window")) throw cause;
        saved = await put((await api<Log>(`/logs/${log.id}`)).version);
      }
      this.upsert(saved);
      return saved;
    },
    replaceLabels(id: string, labelIds: string[]) {
      const log = this.logs.find((value) => value.id === id);
      if (log) log.labelIds = labelIds;
    },
  },
});
