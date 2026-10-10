import { acceptHMRUpdate, defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { api } from "../lib/api";
import { usePathsStore } from "./paths";
import { defaultLabelScopes, useLabelsStore, type LabelScope } from "./labels";
import { useReportsStore } from "./reports";
import { useSessionsStore } from "./sessions";
import { usePreferencesStore } from "./preferences";

export type Timer = {
  id: string;
  pathId?: string;
  labelIds?: string[];
  startedAt: string;
  description?: string;
  running?: boolean;
  // Recorded seconds of the session's earlier segments when it was resumed.
  carriedSeconds?: number;
};
type Draft = {
  pathId?: string;
  labelIds?: string[];
  description?: string;
  // The paused session's total; null or missing when nothing is paused.
  pausedSeconds?: number | null;
};
type Label = {
  id: string;
  name: string;
  color?: string | null;
  scopes?: LabelScope[];
};

export const useTimerStore = defineStore("timer", () => {
  const pathsStore = usePathsStore(),
    labelsStore = useLabelsStore();
  const reportsStore = useReportsStore(),
    sessionsStore = useSessionsStore();
  const current = ref<Timer | null>(null),
    timer = current,
    version = ref(0),
    historyVersion = ref(0);
  const isRunning = computed(() => Boolean(current.value));
  const pausedSeconds = ref<number | null>(null);
  const isPaused = computed(
    () => !current.value && pausedSeconds.value !== null,
  );
  const pathId = ref(""),
    description = ref(""),
    selectedLabelIds = ref<string[]>([]),
    timerStartedAt = ref("");
  const newLabel = ref(""),
    labelsOpen = ref(false),
    recentPathIds = ref<string[]>([]);
  // Recent paths come from the server (derived from time entries); starting a
  // timer moves its path to the front until the next load.
  const preferencesStore = usePreferencesStore();
  watch(
    () => preferencesStore.recentPathIds,
    (ids) => {
      recentPathIds.value = [...ids];
    },
    { immediate: true },
  );
  const now = ref(Date.now()),
    busy = ref(false),
    actionBusy = ref(false),
    error = ref(""),
    socketConnected = ref(false);
  // The session clock: earlier segments of a resumed session count too, and a
  // paused session shows its frozen total.
  const elapsedSeconds = computed(() => {
    const running = current.value;
    if (!running) return pausedSeconds.value ?? 0;
    const segment = Math.floor((now.value - Date.parse(running.startedAt)) / 1000);
    return (running.carriedSeconds || 0) + Math.max(0, segment);
  });
  let ticker: number | undefined,
    syncTicker: number | undefined,
    reconnectTicker: number | undefined;
  let syncInFlight = false,
    timerStateVersion = 0,
    socket: WebSocket | undefined,
    saveQueued = false,
    saveInFlight = false,
    runQueued = false;
  let formTimerId = "",
    consumers = 0;
  let draftBaseline: Draft = {};
  let draftHydrated = false;
  let pendingSubmission: ReturnType<typeof formState> | undefined;
  function formState() {
    return {
      pathId: pathId.value,
      labelIds: [...selectedLabelIds.value],
      description: description.value,
      startedAt: timerStartedAt.value,
    };
  }
  function localStartedAt(value: string) {
    const date = new Date(value);
    const pad = (part: number) => String(part).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function rememberPath(id: string) {
    if (!id) return;
    recentPathIds.value = [
      id,
      ...recentPathIds.value.filter((value) => value !== id),
    ].slice(0, 5);
  }
  function fieldFocused(field: "path" | "labels" | "description") {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return false;
    if (field === "description") return active.id === "tt-desc";
    if (field === "path")
      return (
        active.id === "tt-path" ||
        Boolean(active.closest(".tracker-path-select"))
      );
    return Boolean(active.closest("#tt-labels"));
  }

  function refreshTargets(value: Draft) {
    if (
      value.pathId &&
      !pathsStore.paths.some((path) => path.id === value.pathId)
    )
      void pathsStore.load(true).catch(() => {});
    if (
      value.labelIds?.some(
        (id) => !labelsStore.labels.some((label) => label.id === id),
      )
    )
      void labelsStore.loadScope("TIME_ENTRY", true).catch(() => {});
  }
  function applyDraft(value: Draft | null, baseline = draftBaseline) {
    const next = value || {};
    const resolved: Draft = {};
    if (
      (!draftHydrated && !pathId.value) ||
      (!fieldFocused("path") && pathId.value === (baseline.pathId || ""))
    ) {
      pathId.value = next.pathId || "";
      resolved.pathId = next.pathId;
    } else resolved.pathId = baseline.pathId;
    if (
      (!draftHydrated && !description.value) ||
      (!fieldFocused("description") &&
        description.value === (baseline.description || ""))
    ) {
      description.value = next.description || "";
      resolved.description = next.description;
    } else resolved.description = baseline.description;
    if (
      (!draftHydrated && !selectedLabelIds.value.length) ||
      (!fieldFocused("labels") &&
        JSON.stringify(selectedLabelIds.value) ===
          JSON.stringify(baseline.labelIds || []))
    ) {
      selectedLabelIds.value = [...(next.labelIds || [])];
      resolved.labelIds = next.labelIds;
    } else resolved.labelIds = baseline.labelIds;
    draftBaseline = resolved;
    draftHydrated = true;
    refreshTargets(next);
  }
  function applyPause(draft: Draft | null) {
    pausedSeconds.value = draft?.pausedSeconds ?? null;
  }
  async function syncDraft() {
    const revision = timerStateVersion;
    const draft = await api<Draft>("/timers/draft");
    if (revision === timerStateVersion && !current.value && !busy.value) {
      applyDraft(draft);
      applyPause(draft);
    }
  }
  function applyTimer(
    value: Timer | null,
    notifyHistory = false,
    submitted?: ReturnType<typeof formState>,
  ) {
    const previous = timer.value;
    const changed = JSON.stringify(previous) !== JSON.stringify(value);
    if (changed) {
      reportsStore.clear();
      sessionsStore.clearPages();
    }
    const baseline = submitted || {
      pathId: previous?.pathId || "",
      labelIds: previous?.labelIds || [],
      description: previous?.description || "",
      startedAt: previous ? localStartedAt(previous.startedAt) : "",
    };
    const draft = formState();
    const preserveDraft = !previous || previous.id === value?.id;
    if (value && previous?.id === value.id) {
      // Live snapshots may omit fields that did not change. Preserve the
      // existing timer form instead of erasing it with undefined values.
      value = { ...previous, ...value };
    }
    // A completed snapshot is history, not the current running timer. Keep
    // older servers or delayed messages from making the counter appear active.
    if (value?.running === false) value = null;
    current.value = value;
    if (value) pausedSeconds.value = null;
    version.value++;
    now.value = Date.now();
    if (!value) {
      if (!previous) return;
      formTimerId = "";
      draftBaseline = {
        pathId: previous.pathId,
        labelIds: previous.labelIds || [],
        description: previous.description || "",
      };
      timerStartedAt.value = "";
      if (notifyHistory && changed) historyVersion.value++;
      return;
    }
    const newLocalForm = formTimerId !== value.id && !submitted;
    if (newLocalForm || !preserveDraft || draft.pathId === baseline.pathId)
      pathId.value = value.pathId || "";
    if (
      newLocalForm ||
      !preserveDraft ||
      JSON.stringify(draft.labelIds) === JSON.stringify(baseline.labelIds)
    )
      selectedLabelIds.value = [...(value.labelIds || [])];
    if (newLocalForm || !preserveDraft || draft.description === baseline.description)
      description.value = value.description || "";
    if (
      newLocalForm ||
      !preserveDraft ||
      draft.startedAt === baseline.startedAt
    )
      timerStartedAt.value = localStartedAt(value.startedAt);
    formTimerId = value.id;
    draftBaseline = {
      pathId: value.pathId,
      labelIds: value.labelIds || [],
      description: value.description || "",
    };
    rememberPath(value.pathId || "");
    if (notifyHistory && changed) historyVersion.value++;
    refreshTargets(value);
  }
  function resetForm() {
    pathId.value = "";
    selectedLabelIds.value = [];
    description.value = "";
    timerStartedAt.value = "";
    labelsOpen.value = false;
    draftBaseline = {};
    draftHydrated = true;
    formTimerId = "";
  }
  async function resetAfterStop() {
    // Clear the local controls immediately after a successful stop. The
    // server draft is cleared as well so another client cannot rehydrate the
    // completed session into a fresh timer form. Draft responses already in
    // flight describe the session that just ended.
    timerStateVersion++;
    pausedSeconds.value = null;
    resetForm();
    await api("/timers/draft", {
      method: "PUT",
      body: JSON.stringify({ pathId: null, labelIds: [], description: null }),
    });
  }
  async function load() {
    const versionAtRequest = timerStateVersion;
    try {
      const [loadedPaths, loadedLabels, current] = await Promise.all([
        pathsStore.load(),
        labelsStore.loadScope("TIME_ENTRY"),
        api<Timer | null>("/timers/current"),
      ]);
      pathsStore.setAll(loadedPaths);
      labelsStore.setAll(loadedLabels, "TIME_ENTRY");
      if (versionAtRequest === timerStateVersion) {
        applyTimer(current);
        if (!current) await syncDraft();
      }
    } catch {
      error.value = "Unable to load the time tracker.";
    }
  }
  async function toggleRun() {
    if (actionBusy.value) return;
    if (busy.value) {
      if (saveInFlight) runQueued = true;
      return;
    }
    actionBusy.value = true;
    busy.value = true;
    error.value = "";
    try {
      if (timer.value) {
        const versionAtRequest = ++timerStateVersion;
        await api<Timer>(`/timers/${timer.value.id}/stop`, {
          method: "POST",
          body: "{}",
        });
        reportsStore.clear();
        sessionsStore.clearPages();
        if (versionAtRequest === timerStateVersion) {
          applyTimer(null);
        }
        // The WebSocket stop event can clear the current timer and advance
        // the version before the stop request resolves. In that case the
        // guarded branch above is skipped, but the completed form still must
        // be cleared.
        if (!timer.value) await resetAfterStop();
      } else if (isPaused.value) {
        // Stop while paused finishes the session; its time is already recorded.
        ++timerStateVersion;
        await api<Draft>("/timers/finish", { method: "POST", body: "{}" });
        reportsStore.clear();
        sessionsStore.clearPages();
        await resetAfterStop();
      } else {
        const versionAtRequest = ++timerStateVersion;
        const submitted = formState();
        pendingSubmission = submitted;
        let started: Timer | null = null;
        try {
          started = await api<Timer>("/timers", {
            method: "POST",
            body: JSON.stringify({
              pathId: pathId.value || null,
              labelIds: selectedLabelIds.value,
              description: description.value || null,
            }),
          });
        } catch (cause) {
          // A concurrent start may win between the initial sync and this
          // request. Reconcile to the account's authoritative running timer.
          const existing = await api<Timer | null>("/timers/current");
          if (!existing) throw cause;
          if (versionAtRequest === timerStateVersion) applyTimer(existing);
          started = null;
        }
        if (started) {
          if (versionAtRequest === timerStateVersion)
            applyTimer(started, false, submitted);
          rememberPath(pathId.value);
        }
      }
      historyVersion.value++;
    } catch {
      error.value =
        "Could not update the timer. Only one timer can run at a time.";
    } finally {
      pendingSubmission = undefined;
      busy.value = false;
      actionBusy.value = false;
      if (saveQueued) {
        saveQueued = false;
        void updateTimer();
      }
    }
  }
  async function updateTimer(alreadyBusy = false) {
    // Vue event handlers can pass an Event; only the explicit internal flag
    // may reuse createLabel's busy state.
    alreadyBusy = alreadyBusy === true;
    if (busy.value && !alreadyBusy) {
      saveQueued = true;
      return;
    }
    if (!alreadyBusy) busy.value = true;
    saveInFlight = !alreadyBusy;
    const submitted = formState();
    pendingSubmission = submitted;
    const versionAtRequest = ++timerStateVersion;
    error.value = "";
    try {
      const target = timer.value;
      const startedAt = target
        ? timerStartedAt.value === localStartedAt(target.startedAt)
          ? target.startedAt
          : new Date(timerStartedAt.value).toISOString()
        : undefined;
      const updated = await api<Timer & Draft>(
        target ? `/timers/${target.id}` : "/timers/draft",
        {
          method: "PUT",
          body: JSON.stringify({
            pathId: pathId.value || null,
            labelIds: selectedLabelIds.value,
            startedAt,
            description: description.value || null,
          }),
        },
      );
      if (versionAtRequest === timerStateVersion) {
        if (target) applyTimer(updated, false, submitted);
        else {
          applyDraft(updated || submitted, submitted);
          if (updated) applyPause(updated);
        }
      }
      if (target && updated.running === false)
        applyDraft(
          {
            pathId: updated.pathId,
            labelIds: updated.labelIds,
            description: updated.description,
          },
          submitted,
        );
      rememberPath(pathId.value);
      historyVersion.value++;
    } catch {
      error.value = "Could not save the active timer settings.";
    } finally {
      pendingSubmission = undefined;
      if (!alreadyBusy) {
        busy.value = false;
        saveInFlight = false;
        if (saveQueued) {
          saveQueued = false;
          void updateTimer();
        } else if (runQueued) {
          runQueued = false;
          void toggleRun();
        }
      }
    }
  }
  async function toggleLabel(id: string) {
    selectedLabelIds.value = selectedLabelIds.value.includes(id)
      ? selectedLabelIds.value.filter((value) => value !== id)
      : [...selectedLabelIds.value, id];
    labelsOpen.value = true;
    await updateTimer();
  }
  async function createLabel() {
    const name = newLabel.value.trim();
    if (!name || busy.value) return;
    busy.value = true;
    error.value = "";
    try {
      const created = await api<Label>("/labels", {
        method: "POST",
        body: JSON.stringify({
          name,
          scopes: defaultLabelScopes(),
          color: null,
        }),
      });
      labelsStore.add({
        ...created,
        scopes: created.scopes || defaultLabelScopes(),
      });
      selectedLabelIds.value = [
        ...new Set([...selectedLabelIds.value, created.id]),
      ];
      newLabel.value = "";
      await updateTimer(true);
    } catch {
      error.value = "Could not create the session label.";
    } finally {
      busy.value = false;
      if (saveQueued) {
        saveQueued = false;
        void updateTimer();
      }
    }
  }
  async function sync() {
    if (syncInFlight || busy.value) return;
    syncInFlight = true;
    const versionAtRequest = timerStateVersion;
    try {
      const current = await api<Timer | null>("/timers/current");
      if (!busy.value && versionAtRequest === timerStateVersion) {
        const stoppedExternally = Boolean(timer.value && !current);
        applyTimer(current, true);
        if (stoppedExternally) {
          // A pause elsewhere also ends the running segment; keep its context.
          const draft = await api<Draft | null>("/timers/draft");
          if (draft?.pausedSeconds != null) {
            applyDraft(draft);
            applyPause(draft);
          } else await resetAfterStop();
        } else if (!current) await syncDraft();
      }
    } catch {
      /* Best-effort polling. */
    } finally {
      syncInFlight = false;
    }
  }
  function websocketUrl() {
    const configured = import.meta.env.VITE_API_URL as string | undefined;
    const base = configured
      ? new URL(configured, window.location.origin)
      : new URL(window.location.href);
    base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
    base.pathname = "/ws/timers";
    base.search = "";
    return base.toString();
  }
  function startPolling() {
    if (syncTicker) return;
    void sync();
    syncTicker = window.setInterval(() => {
      void sync();
    }, 2000);
  }
  function stopPolling() {
    if (syncTicker) window.clearInterval(syncTicker);
    syncTicker = undefined;
  }
  function connectWebSocket() {
    if (socket || !localStorage.getItem("know_token")) return;
    try {
      const candidate = new WebSocket(websocketUrl());
      socket = candidate;
      candidate.onopen = () => {
        candidate.send(
          JSON.stringify({
            type: "AUTH",
            token: localStorage.getItem("know_token"),
          }),
        );
      };
      candidate.onmessage = (event) => {
        let message: { type?: string; timer?: Timer | null };
        try {
          message = JSON.parse(event.data) as typeof message;
        } catch {
          return;
        }
        if (message.type === "READY") {
          // READY is not a snapshot; fetch anything missed before authentication.
          stopPolling();
          timerStateVersion++;
          socketConnected.value = true;
          void sync();
        } else if (message.type === "TIMER_STATE") {
          timerStateVersion++;
          applyTimer(message.timer || null, true, pendingSubmission);
          // Pause and finish arrive as "no running timer"; the draft says
          // whether the session is paused.
          if (!message.timer) void syncDraft().catch(() => {});
        }
      };
      candidate.onclose = () => {
        if (socket === candidate) socket = undefined;
        socketConnected.value = false;
        startPolling();
        if (!reconnectTicker)
          reconnectTicker = window.setTimeout(() => {
            reconnectTicker = undefined;
            connectWebSocket();
          }, 5000);
      };
      candidate.onerror = () => candidate.close();
    } catch {
      startPolling();
    }
  }

  function resume() {
    // A live socket already pushes every timer change; only catch up over
    // HTTP when it is down.
    if (!socketConnected.value) void sync();
  }
  function acquire() {
    if (++consumers > 1) return;
    void load();
    ticker = window.setInterval(() => {
      now.value = Date.now();
    }, 1000);
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    connectWebSocket();
  }
  function release() {
    if (consumers === 0 || --consumers > 0) return;
    if (ticker) window.clearInterval(ticker);
    stopPolling();
    if (reconnectTicker) window.clearTimeout(reconnectTicker);
    reconnectTicker = undefined;
    if (socket) {
      socket.onclose = null;
      socket.close();
      socket = undefined;
    }
    socketConnected.value = false;
    window.removeEventListener("focus", resume);
    document.removeEventListener("visibilitychange", resume);
  }
  // Starts a session for a known path and description, as a board card's play
  // button does. The tracker form keeps its own draft; the server decides
  // whether a timer may start.
  async function startSession(input: Draft) {
    if (actionBusy.value || current.value) return null;
    actionBusy.value = true;
    error.value = "";
    try {
      const versionAtRequest = ++timerStateVersion;
      const started = await api<Timer>("/timers", {
        method: "POST",
        body: JSON.stringify({
          pathId: input.pathId || null,
          labelIds: input.labelIds || [],
          description: input.description || null,
        }),
      });
      if (versionAtRequest === timerStateVersion) applyTimer(started);
      if (input.pathId) rememberPath(input.pathId);
      historyVersion.value++;
      return started;
    } catch (cause) {
      error.value =
        "Could not start a session. Only one timer can run at a time.";
      throw cause;
    } finally {
      actionBusy.value = false;
    }
  }
  // Pausing records the running segment; the server keeps the session's
  // context and total on the draft until it is resumed or finished.
  async function pauseSession() {
    if (actionBusy.value || busy.value || !current.value) return;
    actionBusy.value = true;
    busy.value = true;
    error.value = "";
    try {
      const versionAtRequest = ++timerStateVersion;
      const paused = await api<Draft>("/timers/pause", {
        method: "POST",
        body: "{}",
      });
      reportsStore.clear();
      sessionsStore.clearPages();
      if (versionAtRequest === timerStateVersion) applyTimer(null);
      applyPause(paused);
      applyDraft(paused);
      historyVersion.value++;
    } catch {
      error.value = "Could not pause the session.";
    } finally {
      busy.value = false;
      actionBusy.value = false;
    }
  }
  async function resumeSession() {
    if (actionBusy.value || busy.value || !isPaused.value) return;
    actionBusy.value = true;
    busy.value = true;
    error.value = "";
    try {
      const versionAtRequest = ++timerStateVersion;
      const resumed = await api<Timer>("/timers/resume", {
        method: "POST",
        body: "{}",
      });
      if (versionAtRequest === timerStateVersion) applyTimer(resumed);
      rememberPath(resumed.pathId || "");
      historyVersion.value++;
    } catch {
      error.value =
        "Could not resume the session. Its path may no longer be active.";
    } finally {
      busy.value = false;
      actionBusy.value = false;
    }
  }
  function setCurrent(value: Timer | null) {
    timerStateVersion++;
    applyTimer(value);
  }
  function clear() {
    timerStateVersion++;
    current.value = null;
    pausedSeconds.value = null;
    pathId.value = "";
    description.value = "";
    selectedLabelIds.value = [];
    timerStartedAt.value = "";
    draftBaseline = {};
    draftHydrated = false;
    formTimerId = "";
    newLabel.value = "";
    error.value = "";
    pendingSubmission = undefined;
    saveQueued = false;
    recentPathIds.value = [];
    pathsStore.reset();
    labelsStore.reset();
    reportsStore.clear();
    sessionsStore.clearPages();
    if (socket) {
      socket.onclose = null;
      socket.close();
      socket = undefined;
    }
    socketConnected.value = false;
    version.value++;
    if (consumers > 0)
      queueMicrotask(() => {
        void load();
        connectWebSocket();
      });
  }
  return {
    current,
    version,
    historyVersion,
    isRunning,
    isPaused,
    pausedSeconds,
    elapsedSeconds,
    pathId,
    description,
    selectedLabelIds,
    timerStartedAt,
    newLabel,
    labelsOpen,
    recentPathIds,
    now,
    busy,
    actionBusy,
    error,
    acquire,
    release,
    setCurrent,
    clear,
    toggleRun,
    pauseSession,
    resumeSession,
    startSession,
    updateTimer,
    toggleLabel,
    createLabel,
    rememberPath,
    sync,
  };
});

// Keep the live store in step with edited actions during development.
if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(useTimerStore, import.meta.hot));
