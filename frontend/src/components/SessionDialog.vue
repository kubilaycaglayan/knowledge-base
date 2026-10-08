<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { mdiClose } from "@mdi/js";
import { api, ApiError } from "../lib/api";
import { vDialogFocus } from "../lib/dialog-focus";
import { vBackdropClose } from "../lib/backdrop-close";
import { formatTrackedDuration } from "../lib/format";
import type { Label } from "../stores/labels";
import type { Session } from "../stores/sessions";
import { useTimerStore, type Timer } from "../stores/timer";
import SessionEditForm, { type SessionDraft } from "./SessionEditForm.vue";

type PathOption = { id: string; name: string; color?: string | null };

const props = defineProps<{ sessionId: string; paths: PathOption[]; labels: Label[] }>();
const emit = defineEmits<{ close: []; changed: [] }>();

const session = ref<Session | null>(null);
const loading = ref(false);
const missing = ref(false);
const error = ref("");
const editing = ref(false);
const saving = ref(false);
const busy = ref(false);
const confirming = ref<"" | "remove" | "discard">("");
const form = ref<InstanceType<typeof SessionEditForm> | null>(null);

const longDateTime = new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short" });
const time = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });
const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

const path = computed(() => props.paths.find((value) => value.id === session.value?.pathId));
const sessionLabels = computed(() =>
  (session.value?.labelIds || []).map((id) => props.labels.find((label) => label.id === id) || { id, name: "Removed label", color: null }),
);
const running = computed(() => Boolean(session.value?.running || (session.value && !session.value.endedAt)));
const canRestart = computed(() => !running.value && Boolean(path.value || sessionLabels.value.length));
const heading = computed(() => (session.value ? longDateTime.format(new Date(session.value.startedAt)) : missing.value ? "Session not found" : "Session"));
const ended = computed(() => {
  const value = session.value;
  if (!value?.endedAt) return "";
  const start = new Date(value.startedAt);
  const end = new Date(value.endedAt);
  return start.toDateString() === end.toDateString() ? time.format(end) : dateTime.format(end);
});

async function load() {
  const id = props.sessionId;
  loading.value = true;
  missing.value = false;
  error.value = "";
  editing.value = false;
  confirming.value = "";
  try {
    const found = await api<Session>(`/time-entries/${id}`);
    if (id === props.sessionId) session.value = found;
  } catch (cause) {
    if (id !== props.sessionId) return;
    session.value = null;
    if (cause instanceof ApiError && (cause.status === 404 || cause.status === 400)) missing.value = true;
    else error.value = "Couldn’t load this session. Try again.";
  } finally {
    if (id === props.sessionId) loading.value = false;
  }
}
onMounted(load);
watch(() => props.sessionId, load);

async function save(draft: SessionDraft) {
  const current = session.value;
  if (!current || saving.value) return;
  if (!draft.startedAt || !draft.endedAt) {
    error.value = "A session needs both a start and an end time.";
    return;
  }
  if (new Date(draft.endedAt).getTime() <= new Date(draft.startedAt).getTime()) {
    error.value = "A session has to end after it starts.";
    return;
  }
  saving.value = true;
  error.value = "";
  try {
    session.value = await api<Session>(`/time-entries/${current.id}`, {
      method: "PUT",
      body: JSON.stringify({
        pathId: draft.pathId || null,
        labelIds: draft.labelIds,
        startedAt: new Date(draft.startedAt).toISOString(),
        endedAt: new Date(draft.endedAt).toISOString(),
        description: draft.description || null,
        source: draft.source,
      }),
    });
    editing.value = false;
    emit("changed");
  } catch {
    error.value = "Couldn’t update this session. Check its time range and selections.";
  } finally {
    saving.value = false;
  }
}
async function remove() {
  const current = session.value;
  if (!current || busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    await api(`/time-entries/${current.id}`, { method: "DELETE" });
    emit("changed");
    emit("close");
  } catch {
    error.value = "Couldn’t remove this session. Try again.";
    confirming.value = "";
  } finally {
    busy.value = false;
  }
}
async function restart() {
  const current = session.value;
  if (!current || busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    const started = await api<Timer>("/timers", {
      method: "POST",
      body: JSON.stringify({
        pathId: current.pathId || null,
        labelIds: current.labelIds || [],
        description: current.description || null,
      }),
    });
    useTimerStore().setCurrent(started);
    emit("changed");
    emit("close");
  } catch {
    error.value = "Couldn’t start a session from this one. Stop the active timer first.";
  } finally {
    busy.value = false;
  }
}
function requestClose() {
  if (editing.value && form.value?.dirty) {
    confirming.value = "discard";
    return;
  }
  emit("close");
}
function onEscape() {
  if (confirming.value) confirming.value = "";
  else if (editing.value && !form.value?.dirty) editing.value = false;
  else requestClose();
}
</script>

<template>
  <div class="prompt-dialog-backdrop session-dialog-backdrop" v-backdrop-close="requestClose">
    <section
      v-dialog-focus
      class="prompt-dialog card session-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-dialog-heading"
      tabindex="-1"
      @keydown.esc.prevent.stop="onEscape"
    >
      <header class="session-dialog-header">
        <div>
          <p class="session-dialog-eyebrow">Session</p>
          <h2 id="session-dialog-heading">
            <time v-if="session" :datetime="session.startedAt">{{ heading }}</time>
            <template v-else>{{ heading }}</template>
          </h2>
        </div>
        <button type="button" class="icon-button ghost" aria-label="Close session" title="Close" @click="requestClose">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path :d="mdiClose" fill="currentColor" /></svg>
        </button>
      </header>

      <p v-if="loading" class="session-dialog-muted" aria-live="polite">Loading…</p>
      <div v-else-if="missing" class="session-dialog-missing">
        <p>This session doesn’t exist any more. It may have been removed.</p>
        <button type="button" class="primary" @click="emit('close')">Back to sessions</button>
      </div>
      <template v-else-if="session">
        <SessionEditForm
          v-if="editing"
          ref="form"
          :session="session"
          :paths="paths"
          :labels="labels"
          :saving="saving"
          @save="save"
          @cancel="editing = false"
        />
        <template v-else>
          <div class="session-dialog-context">
            <span
              v-if="path"
              class="session-title-chip"
              :style="path.color ? { '--session-path-color': path.color } : undefined"
              >{{ path.name }}</span
            >
            <span v-else class="session-dialog-muted">No path</span>
            <span
              v-for="label in sessionLabels"
              :key="label.id"
              class="session-dialog-label"
              :style="label.color ? { '--session-label-color': label.color } : undefined"
              >{{ label.name }}</span
            >
          </div>
          <p v-if="session.description" class="session-dialog-description">{{ session.description }}</p>
          <dl class="session-dialog-facts">
            <div>
              <dt>Duration</dt>
              <dd>{{ running ? "Running" : formatTrackedDuration(session.durationSeconds || 0) }}</dd>
            </div>
            <div>
              <dt>Time</dt>
              <dd>
                <time :datetime="session.startedAt">{{ time.format(new Date(session.startedAt)) }}</time>
                <template v-if="ended"> – <time :datetime="session.endedAt">{{ ended }}</time></template>
              </dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd translate="no">{{ session.source }}</dd>
            </div>
          </dl>
        </template>
      </template>

      <p v-if="error" class="notice session-dialog-error" role="alert">{{ error }}</p>

      <div v-if="confirming" class="session-dialog-confirm" role="alertdialog" aria-labelledby="session-dialog-confirm-text">
        <p id="session-dialog-confirm-text">
          {{ confirming === "remove" ? "Remove this session? This can’t be undone." : "Discard your unsaved changes?" }}
        </p>
        <div class="prompt-dialog-actions">
          <button type="button" class="text-button" @click="confirming = ''">
            {{ confirming === "remove" ? "Keep session" : "Keep editing" }}
          </button>
          <button v-if="confirming === 'remove'" type="button" class="primary danger" :disabled="busy" @click="remove">Remove</button>
          <button v-else type="button" class="primary danger" @click="emit('close')">Discard</button>
        </div>
      </div>
      <footer v-else-if="session && !editing && !loading" class="prompt-dialog-actions session-dialog-actions">
        <button v-if="!running" type="button" class="text-button danger" @click="confirming = 'remove'">Remove…</button>
        <span class="session-dialog-spacer"></span>
        <button v-if="canRestart" type="button" class="text-button" :disabled="busy" @click="restart">Start again</button>
        <button type="button" class="primary" :disabled="running" @click="editing = true">
          {{ running ? "Stop to edit" : "Edit" }}
        </button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.session-dialog {
  width: min(680px, 100%);
}
.session-dialog-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.session-dialog-header h2 {
  margin: 0;
  font-size: 18px;
}
.session-dialog-eyebrow {
  margin: 0 0 2px;
  color: var(--workspace-muted);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.icon-button {
  display: inline-grid;
  place-items: center;
  min-width: 44px;
  min-height: 44px;
  padding: 0;
  border: 0;
  border-radius: var(--workspace-radius);
  background: transparent;
  color: var(--workspace-muted);
}
.icon-button:hover {
  background: var(--workspace-hover);
  color: var(--workspace-strong);
}
.session-dialog-context {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
}
.session-dialog-label {
  padding: 1px 8px;
  border: 1px solid var(--session-label-color, var(--workspace-border));
  border-radius: 999px;
  font-size: 12px;
  overflow-wrap: anywhere;
}
.session-dialog-description {
  margin: 0 0 16px;
  max-height: min(40dvh, 360px);
  overflow-y: auto;
  overscroll-behavior: contain;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 15px;
}
.session-dialog-facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
  margin: 0;
}
.session-dialog-facts dt {
  color: var(--workspace-muted);
  font-size: 12px;
}
.session-dialog-facts dd {
  margin: 0;
  font-variant-numeric: tabular-nums;
}
.session-dialog-muted {
  color: var(--workspace-muted);
}
.session-dialog-missing p {
  margin: 0 0 16px;
}
.session-dialog-error {
  margin: 12px 0 0;
}
.session-dialog-confirm {
  margin-top: 16px;
  padding: 12px;
  border: 1px solid var(--workspace-danger-border);
  border-radius: var(--workspace-radius);
  background: var(--workspace-danger-surface);
}
.session-dialog-confirm p {
  margin: 0;
}
.session-dialog-confirm .prompt-dialog-actions {
  margin-top: 12px;
}
.session-dialog-actions {
  flex-wrap: wrap;
  align-items: center;
}
.session-dialog-spacer {
  flex: 1 1 auto;
}
.primary.danger {
  border-color: var(--workspace-danger);
  background: var(--workspace-danger);
  color: var(--workspace-surface);
}
.primary.danger:hover:not(:disabled) {
  border-color: var(--workspace-danger-hover);
  background: var(--workspace-danger-hover);
  color: var(--workspace-surface);
}
@media (max-width: 700px) {
  .session-dialog-actions > button {
    min-height: 44px;
  }
}
</style>
