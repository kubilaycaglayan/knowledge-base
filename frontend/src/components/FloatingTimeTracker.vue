<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { api } from "../lib/api";
import PromptDialog from "./PromptDialog.vue";
import TimerRunButton from "./TimerRunButton.vue";
import LabelPicker from "./LabelPicker.vue";
import { paletteColors } from "../lib/color-palette";
import { useLabelsStore } from "../stores/labels";
import { usePathsStore } from "../stores/paths";
import { useTimerStore, type Timer as StoreTimer } from "../stores/timer";
import { useReportsStore } from "../stores/reports";
import { useSessionsStore } from "../stores/sessions";

type Path = { id: string; name: string; status: string; color?: string | null };
type Timer = StoreTimer;

const props = defineProps<{ inline?: boolean }>();
const emit = defineEmits<{ changed: [] }>();
const pathsStore = usePathsStore();
const labelsStore = useLabelsStore();
const { paths } = storeToRefs(pathsStore);
const sessionLabels = computed(() => labelsStore.forScope("TIME_ENTRY"));
const timerStore = useTimerStore();
const reportsStore = useReportsStore();
const sessionsStore = useSessionsStore();
const { current: timer } = storeToRefs(timerStore);
const {
  pathId,
  description,
  selectedLabelIds,
  recentPathIds,
  actionBusy,
  error,
  timerStartedAt,
  isPaused,
  elapsedSeconds: elapsed,
} = storeToRefs(timerStore);
const {
  toggleRun,
  updateTimer,
  rememberPath,
  pauseSession,
  resumeSession,
} = timerStore;
const open = ref(Boolean(props.inline));
const trackerHost = ref<HTMLElement | null>(null);
const promptHost = ref<HTMLElement | null>(null);
const trackerViewportHeight = ref(0);
const promptDialog = ref<InstanceType<typeof PromptDialog> | null>(null);
watch(
  () => timerStore.historyVersion,
  () => emit("changed"),
);
// Cmd/Ctrl+Enter in the description starts the session, resumes a paused
// one, or saves the typed description and stops the running one. Plain Enter
// keeps adding a newline.
async function runFromDescription(event: KeyboardEvent) {
  if (event.isComposing || !(event.metaKey || event.ctrlKey)) return;
  event.preventDefault();
  if (timer.value || isPaused.value) {
    await updateTimer();
    if (error.value) return;
  }
  if (isPaused.value) await resumeSession();
  else await toggleRun();
}
function togglePause() {
  return timer.value ? pauseSession() : resumeSession();
}
async function updateSelectedLabels(ids: string[]) {
  selectedLabelIds.value = ids;
  await updateTimer();
}
const activePaths = computed(() =>
  paths.value.filter((path) => path.status === "ACTIVE"),
);
const pathOptions = computed(() => [
  { id: "__add_new_path__", name: "＋ Add a new path…", status: "" },
  ...activePaths.value,
]);
const recentPaths = computed(() =>
  recentPathIds.value
    .map((id) => paths.value.find((path) => path.id === id))
    .filter((path): path is Path => Boolean(path && path.status === "ACTIVE"))
    .slice(0, 5),
);
const clock = (seconds: number) =>
  [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
const pathName = computed(
  () =>
    paths.value.find(
      (path) => path.id === (timer.value?.pathId || pathId.value),
    )?.name || "",
);
const selectedLabelNames = computed(() =>
  selectedLabelIds.value
    .map((id) => sessionLabels.value.find((label) => label.id === id)?.name)
    .filter((name): name is string => Boolean(name)),
);
const selectedLabelCount = computed(
  () =>
    selectedLabelIds.value.filter((id) =>
      sessionLabels.value.some((label) => label.id === id),
    ).length,
);
const labelAvailabilitySummary = computed(
  () =>
    `${sessionLabels.value.length} available${selectedLabelCount.value ? ` · ${selectedLabelCount.value} selected` : ""}`,
);
const timerSummary = computed(() =>
  selectedLabelIds.value.length
    ? `${selectedLabelIds.value.length} label${selectedLabelIds.value.length > 1 ? "s" : ""} selected`
    : "Choose a path or label to begin.",
);

function updateTrackerViewportHeight() {
  trackerViewportHeight.value = Math.round(
    window.visualViewport?.height || window.innerHeight,
  );
}
function keepFocusedControlVisible(event: FocusEvent) {
  const control = event.currentTarget;
  if (!(control instanceof HTMLElement)) return;
  window.requestAnimationFrame(() =>
    control.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: "auto",
    }),
  );
}
function closeFloatingOnOutside(event: PointerEvent) {
  if (props.inline || !open.value) return;
  const target = event.target as Node;
  // The path menu and prompt dialog belong to the tracker but render outside it.
  if (
    trackerHost.value?.contains(target) ||
    promptHost.value?.contains(target) ||
    (target instanceof Element && target.closest(".label-picker-menu")) ||
    (target instanceof Element && target.closest(".tracker-path-menu"))
  )
    return;
  open.value = false;
}
function expandFromBar(event: MouseEvent) {
  if (props.inline || !window.matchMedia("(min-width: 641px)").matches)
    return;
  const target = event.target;
  if (target instanceof Element && target.closest("button, a, input, select, textarea, [role='button']"))
    return;
  open.value = true;
}
async function choosePath(id: string) {
  if (id === "__add_new_path__") {
    pathId.value = "";
    const name = (await promptDialog.value?.open("New path name"))?.trim();
    if (!name) return;
    try {
      const created = await api<Path>("/paths", {
        method: "POST",
        body: JSON.stringify({
          name,
          description: null,
          color: paletteColors[6],
        }),
      });
      pathsStore.add(created);
      pathId.value = created.id;
      rememberPath(created.id);
      await updateTimer();
    } catch {
      error.value = "Could not create path.";
    }
    return;
  }
  pathId.value = id;
  rememberPath(id);
  await updateTimer();
}
async function editStartedAt() {
  if (!timer.value) return;
  const value = await promptDialog.value?.open(
    "Started at",
    timerStartedAt.value,
    { inputType: "datetime-local" },
  );
  if (value === null || value === undefined) return;
  if (Number.isNaN(Date.parse(value))) {
    error.value = "Enter a valid date and time.";
    return;
  }
  timerStartedAt.value = value;
  await updateTimer();
}
onMounted(() => {
  timerStore.acquire();
  updateTrackerViewportHeight();
  window.visualViewport?.addEventListener(
    "resize",
    updateTrackerViewportHeight,
  );
  document.addEventListener("pointerdown", closeFloatingOnOutside);
});
onUnmounted(() => {
  timerStore.release();
  document.removeEventListener("pointerdown", closeFloatingOnOutside);
  window.visualViewport?.removeEventListener(
    "resize",
    updateTrackerViewportHeight,
  );
});
</script>

<template>
  <div ref="promptHost" class="tracker-prompt-host">
    <PromptDialog ref="promptDialog" />
  </div>
  <div
    ref="trackerHost"
    class="floating-tracker-host"
    :class="{ inline: props.inline }"
    :style="{ '--tracker-viewport-height': `${trackerViewportHeight}px` }"
  >
    <section class="floating-tracker session-grid" aria-label="Focus today">
      <div class="floating-tracker-bar focus" @click="expandFromBar">
        <TimerRunButton
          v-if="timer || isPaused"
          class="floating-tracker-pause"
          :pause="Boolean(timer)"
          :busy="actionBusy"
          :label="timer ? 'Pause session' : 'Resume session'"
          @click="togglePause"
        />
        <TimerRunButton
          class="floating-tracker-action primary"
          :running="Boolean(timer || isPaused)"
          :busy="actionBusy"
          :label="timer || isPaused ? 'Stop timer' : 'Start timer'"
          @click="toggleRun"
        />
        <button
          class="floating-tracker-clock"
          :class="{ 'is-running': timer, 'is-paused': isPaused }"
          type="button"
          :disabled="!timer"
          aria-label="Edit timer start time; elapsed session time"
          @click="editStartedAt"
        >
          <strong role="timer" aria-live="off">{{ clock(elapsed) }}</strong>
        </button>
        <span v-if="pathName" class="floating-tracker-path">{{
          pathName
        }}</span>
        <span v-if="!timer" class="floating-tracker-summary">{{
          isPaused ? "Paused" : timerSummary
        }}</span>
        <span
          v-if="selectedLabelNames.length"
          class="floating-tracker-context"
          >{{ selectedLabelNames.join(", ") }}</span
        >
        <button
          v-if="!props.inline"
          class="floating-tracker-toggle"
          type="button"
          :aria-expanded="open"
          aria-controls="floating-tracker-panel"
          @click="open = !open"
        >
          <span class="sr-only">{{
            open ? "Collapse tracker" : "Expand tracker"
          }}</span
          ><span
            aria-hidden="true"
            class="chevron"
            :class="{ up: !open }"
          ></span>
        </button>
      </div>
      <div
        v-if="open"
        id="floating-tracker-panel"
        class="floating-tracker-panel"
      >
        <div class="tracker-field">
          <label for="tt-path">Path</label>
          <v-select
            id="tt-path"
            class="tracker-path-select"
            :items="pathOptions"
            item-title="name"
            item-value="id"
            :model-value="pathId"
            name="tt-path"
            aria-label="Timer path"
            autocomplete="off"
            hide-details
            placeholder="Choose a path…"
            :menu-props="{ contentClass: 'tracker-path-menu' }"
            @update:model-value="(value) => choosePath(value || '')"
            ><template #item="{ props, index }"
              ><v-list-item v-bind="props" />
              <div
                v-if="index === 0"
                class="tracker-path-separator"
                role="separator"
              ></div></template
          ></v-select>
          <div
            v-if="recentPaths.length"
            class="recent-paths"
            aria-label="Recently used paths"
          >
            <span>Recent</span
            ><button
              v-for="path in recentPaths"
              :key="path.id"
              type="button"
              class="recent-path"
              :class="{ selected: path.id === pathId }"
              @click="choosePath(path.id)"
            >
              {{ path.name }}
            </button>
          </div>
        </div>
        <div class="tracker-field">
          <div class="tracker-field-heading">
            <span>Labels</span
            ><span>{{ labelAvailabilitySummary }}</span>
          </div>
          <v-select
            class="tracker-test-select"
            :items="sessionLabels"
            item-title="name"
            item-value="id"
            :model-value="selectedLabelIds"
            multiple
            @update:model-value="
              (value) => {
                selectedLabelIds = value || [];
                updateTimer();
              }
            "
          />
          <LabelPicker
            :model-value="selectedLabelIds"
            :labels="sessionLabels"
            label="Search session labels"
            density="compact"
            @update:model-value="updateSelectedLabels"
          />
        </div>
        <div class="tracker-field tracker-field-wide">
          <label for="tt-desc">Description</label
          ><textarea
            id="tt-desc"
            v-model="description"
            name="tt-desc"
            aria-label="Timer description"
            maxlength="5000"
            rows="2"
            autocomplete="off"
            placeholder="What are you working on…"
            @focus="keepFocusedControlVisible"
            @change="updateTimer"
            @keydown.enter="runFromDescription"
          ></textarea>
        </div>
        <p v-if="error" class="tracker-error" role="alert" aria-live="polite">
          {{ error }}
        </p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.tracker-prompt-host {
  display: contents;
}
.floating-tracker-host {
  position: fixed;
  inset-inline: 0;
  bottom: 0;
  z-index: 15;
  display: flex;
  justify-content: center;
  pointer-events: none;
  padding: 0 12px max(12px, env(safe-area-inset-bottom));
}
.floating-tracker-host.inline {
  position: static;
  z-index: auto;
  padding: 0;
  margin-bottom: 32px;
}
.floating-tracker-host.inline .floating-tracker {
  max-width: none;
}
.floating-tracker {
  width: 100%;
  max-width: 768px;
  overflow: hidden;
  pointer-events: auto;
  border: 1px solid var(--workspace-border);
  border-radius: 8px;
  background: var(--workspace-surface);
  box-shadow:
    0 2px 5px rgb(24 33 47 / 12%),
    0 14px 32px rgb(24 33 47 / 22%);
}
.floating-tracker-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
}
.floating-tracker-action {
  margin: 0 0 0 auto;
  order: 2;
}
.floating-tracker-pause {
  margin: 0 0 0 auto;
  order: 2;
}
.floating-tracker-pause + .floating-tracker-action {
  margin-left: 0;
}
.floating-tracker-clock {
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--workspace-text);
  font:
    400 18px/1.3 ui-monospace,
    SFMono-Regular,
    Consolas,
    monospace;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.floating-tracker-clock.is-running {
  color: var(--workspace-success);
}
.floating-tracker-clock.is-paused {
  color: var(--workspace-muted);
}
.floating-tracker-clock:disabled {
  cursor: default;
}
.floating-tracker-path {
  min-width: 0;
  max-width: 220px;
  overflow: hidden;
  border-radius: 4px;
  padding: 3px 8px;
  background: var(--workspace-selected);
  color: var(--workspace-selected-text);
  font-size: 12px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.floating-tracker-summary {
  min-width: 0;
  overflow: hidden;
  flex: 1;
  color: var(--workspace-muted);
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.floating-tracker-context {
  display: inline-flex;
  min-width: 0;
  max-width: 220px;
  gap: 6px;
  overflow: hidden;
  border-radius: 4px;
  padding: 3px 8px;
  background: var(--workspace-selected);
  color: var(--workspace-selected-text);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.floating-tracker-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  order: 3;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--workspace-muted);
}
.floating-tracker-toggle:hover {
  background: var(--workspace-hover);
  color: var(--workspace-text);
}
.chevron {
  width: 9px;
  height: 9px;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: rotate(45deg) translateY(-2px);
}
.chevron.up {
  transform: rotate(225deg) translate(-1px, -1px);
}
.floating-tracker-panel {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  padding: 16px 12px 12px;
  border-top: 1px solid var(--workspace-border);
}
.tracker-field {
  display: grid;
  align-content: start;
  gap: 8px;
  min-width: 0;
}
.tracker-field-wide {
  grid-column: 1 / -1;
}
.tracker-field label,
.tracker-field-heading {
  color: var(--workspace-muted);
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.tracker-field label span,
.tracker-field-heading > span {
  font-weight: 400;
  letter-spacing: 0;
  text-transform: none;
}
.tracker-field-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.tracker-field select,
.tracker-field input,
.tracker-field textarea {
  width: 100%;
  min-height: 36px;
  border: 1px solid var(--workspace-control-border);
  border-radius: 6px;
  background: var(--workspace-background);
  color: var(--workspace-text);
  padding: 7px 9px;
  font-size: 14px;
}
.tracker-field textarea {
  min-height: 56px;
  max-height: 200px;
  overflow-y: auto;
  resize: vertical;
}
.tracker-path-select {
  width: 100%;
  min-width: 0;
  max-width: 100%;
}
.tracker-path-select :deep(.v-input__control),
.tracker-path-select :deep(.v-field),
.tracker-path-select :deep(.v-field__field),
.tracker-path-select :deep(.v-field__input) {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  max-width: 100%;
}
.tracker-path-select :deep(.v-field) {
  height: 42px;
  min-height: 42px;
  border-radius: 6px;
  background: var(--workspace-background);
  color: var(--workspace-text);
  overflow: hidden;
}
.tracker-path-select :deep(.v-field__input) {
  min-height: 0;
  height: 100%;
  align-items: center;
  padding: 0 9px;
  font-size: 14px;
  overflow: hidden;
}
.tracker-path-select :deep(.v-field__input > input) {
  min-height: 0;
  min-width: 0;
  max-width: 100%;
  width: 0;
  flex: 1 1 auto;
  padding: 0;
}
.tracker-path-select :deep(.v-field__append-inner) {
  flex: 0 0 auto;
  padding-inline-end: 8px;
}
:global(.tracker-path-menu .v-list) {
  border: 1px solid var(--workspace-control-border);
  border-radius: 6px;
  padding: 4px;
  background: var(--workspace-surface);
  color: var(--workspace-text);
}
:global(.tracker-path-menu .v-list-item) {
  min-height: 36px;
  border-radius: 4px;
  color: var(--workspace-text);
}
:global(.tracker-path-menu .v-list-item:hover) {
  background: var(--workspace-hover);
}
:global(.tracker-path-menu .tracker-path-separator) {
  height: 1px;
  margin: 4px 8px;
  background: var(--workspace-border);
}
.recent-paths {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
}
.recent-paths > span {
  flex: 0 0 auto;
  color: var(--workspace-muted);
  font-size: 12px;
}
.recent-paths button {
  border: 0;
  border-radius: 4px;
  padding: 4px 8px;
  background: var(--workspace-selected);
  color: var(--workspace-selected-text);
  font-size: 12px;
}
.recent-paths button {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.recent-paths button:hover {
  background: var(--workspace-hover);
}
.recent-paths button.selected {
  background: var(--workspace-accent);
  color: var(--workspace-on-accent);
}
.tracker-test-select {
  display: none;
}
.tracker-path-select :deep(.v-select__selection) {
  min-width: 0;
  max-width: 100%;
}
.tracker-path-select :deep(.v-select__selection-text) {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.tracker-error {
  grid-column: 1 / -1;
  margin: 0;
  color: var(--workspace-danger);
  font-size: 12px;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
@media (max-width: 640px) {
  .floating-tracker-host {
    padding-inline: 12px;
  }
  .floating-tracker-bar {
    gap: 8px;
    padding-inline: 10px;
  }
  .floating-tracker-action,
  .floating-tracker-pause {
    width: 44px;
    min-width: 44px;
    min-height: 44px;
  }
  .floating-tracker-toggle {
    width: 44px;
    height: 44px;
  }
  .floating-tracker-clock {
    font-size: 16px;
  }
  .floating-tracker-panel {
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
    max-height: calc(var(--tracker-viewport-height, 100dvh) - 24px);
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
  }
  .floating-tracker-host.inline .floating-tracker-panel {
    max-height: none;
    min-height: auto;
    overflow: visible;
    overscroll-behavior: auto;
    -webkit-overflow-scrolling: auto;
  }
  .tracker-field-wide {
    grid-column: auto;
  }
  .floating-tracker-summary {
    display: none;
  }
  .floating-tracker-path,
  .floating-tracker-context {
    max-width: 110px;
  }
  .tracker-field textarea {
    max-height: min(200px, 40dvh);
  }
}
@media (prefers-reduced-motion: reduce) {
  .floating-tracker,
  .floating-tracker * {
    transition: none !important;
    animation: none !important;
  }
}
@media (max-width: 640px) {
  .tracker-path-select :deep(.v-field) {
    height: 58px;
    min-height: 58px;
  }
  .tracker-field input {
    min-height: 44px;
    font-size: 16px;
  }
}
</style>
