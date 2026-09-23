import { acceptHMRUpdate, defineStore } from "pinia";
import { ref } from "vue";

export type NoticeTone = "error" | "info";
export type Notice = { id: number; text: string; tone: NoticeTone };

/** Short-lived messages about the result of an action, shown as a snackbar. */
export const useNoticesStore = defineStore("notices", () => {
  const current = ref<Notice | null>(null);
  let nextId = 0;
  function notify(text: string, tone: NoticeTone = "error") {
    current.value = { id: ++nextId, text, tone };
  }
  function dismiss() {
    current.value = null;
  }
  return { current, notify, dismiss };
});

if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(useNoticesStore, import.meta.hot));
