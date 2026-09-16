import { defineStore } from "pinia";

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
  state: () => ({ logs: [] as Log[] }),
  actions: {
    setAll(logs: Log[]) {
      this.logs = logs;
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
    replaceLabels(id: string, labelIds: string[]) {
      const log = this.logs.find((value) => value.id === id);
      if (log) log.labelIds = labelIds;
    },
  },
});
