<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { mdiClose } from "@mdi/js";
import { api, ApiError } from "../lib/api";
import { vDialogFocus } from "../lib/dialog-focus";
import { vBackdropClose } from "../lib/backdrop-close";
import { useLogsStore, type Log } from "../stores/logs";
import LabelPicker from "./LabelPicker.vue";

type LogLabel = { id: string; name: string; color?: string | null };

const props = defineProps<{ logId: string; labels: LogLabel[] }>();
const emit = defineEmits<{
  close: [];
  "show-in-list": [log: Log];
  "label-created": [label: LogLabel];
}>();

const logsStore = useLogsStore();
const fetched = ref<Log | null>(null);
const loading = ref(false);
const missing = ref(false);
const error = ref("");
const editing = ref(false);
const draft = ref({ body: "", occurredAt: "" });
const saving = ref(false);
const savingLabels = ref(false);
const confirming = ref<"" | "remove" | "discard">("");
const removing = ref(false);
const bodyInput = ref<HTMLTextAreaElement | null>(null);

// The list keeps the freshest copy once it has loaded.
const log = computed(() => logsStore.logs.find((value) => value.id === props.logId) || fetched.value);
const dirty = computed(
  () => editing.value && !!log.value && (draft.value.body !== log.value.body || draft.value.occurredAt !== localDateTime(log.value.occurredAt)),
);
const heading = computed(() => (log.value ? longDateTime.format(new Date(log.value.occurredAt)) : "Log"));

const longDateTime = new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short" });

function localDateTime(iso: string) {
  const value = new Date(iso);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

async function load() {
  error.value = "";
  missing.value = false;
  fetched.value = null;
  editing.value = false;
  confirming.value = "";
  if (logsStore.logs.some((value) => value.id === props.logId)) return;
  loading.value = true;
  const id = props.logId;
  try {
    const found = await api<Log>(`/logs/${id}`);
    if (id === props.logId) fetched.value = found;
  } catch (cause) {
    if (id !== props.logId) return;
    if (cause instanceof ApiError && (cause.status === 404 || cause.status === 400)) missing.value = true;
    else error.value = "Couldn’t load this log. Try again.";
  } finally {
    if (id === props.logId) loading.value = false;
  }
}
onMounted(load);
watch(() => props.logId, load);

function startEdit() {
  if (!log.value) return;
  draft.value = { body: log.value.body, occurredAt: localDateTime(log.value.occurredAt) };
  editing.value = true;
  confirming.value = "";
  void nextTick(() => bodyInput.value?.focus());
}
function cancelEdit() {
  editing.value = false;
  confirming.value = "";
}
async function save() {
  const current = log.value;
  if (!current || saving.value) return;
  if (!draft.value.body.trim()) {
    error.value = "A log needs some text.";
    bodyInput.value?.focus();
    return;
  }
  if (!draft.value.occurredAt || Number.isNaN(new Date(draft.value.occurredAt).getTime())) {
    error.value = "Choose when this happened.";
    return;
  }
  saving.value = true;
  error.value = "";
  try {
    const saved = await logsStore.save(current, {
      body: draft.value.body,
      occurredAt: new Date(draft.value.occurredAt).toISOString(),
    });
    if (fetched.value) fetched.value = saved;
    editing.value = false;
  } catch {
    error.value = "Couldn’t save this log. Your text is still here; try again.";
  } finally {
    saving.value = false;
  }
}
async function setLabels(labelIds: string[]) {
  const current = log.value;
  if (!current || savingLabels.value) return;
  savingLabels.value = true;
  error.value = "";
  try {
    const saved = await api<Log>(`/logs/${current.id}/labels`, {
      method: "PUT",
      body: JSON.stringify({ labelIds }),
    });
    logsStore.replaceLabels(current.id, saved.labelIds || []);
    if (fetched.value) fetched.value = { ...fetched.value, labelIds: saved.labelIds || [] };
  } catch {
    error.value = "Couldn’t update this log’s labels. Try again.";
  } finally {
    savingLabels.value = false;
  }
}
async function remove() {
  const current = log.value;
  if (!current || removing.value) return;
  removing.value = true;
  error.value = "";
  try {
    await api(`/logs/${current.id}`, { method: "DELETE" });
    logsStore.remove(current.id);
    emit("close");
  } catch {
    error.value = "Couldn’t remove this log. Try again.";
    confirming.value = "";
  } finally {
    removing.value = false;
  }
}
function requestClose() {
  if (dirty.value) {
    confirming.value = "discard";
    return;
  }
  emit("close");
}
function onEscape() {
  if (confirming.value) confirming.value = "";
  else if (editing.value && !dirty.value) cancelEdit();
  else requestClose();
}
</script>

<template>
  <div class="prompt-dialog-backdrop log-dialog-backdrop" v-backdrop-close="requestClose">
    <section
      v-dialog-focus
      class="prompt-dialog card log-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="log-dialog-heading"
      tabindex="-1"
      @keydown.esc.prevent.stop="onEscape"
    >
      <header class="log-dialog-header">
        <div>
          <p class="log-dialog-eyebrow">Log</p>
          <h2 id="log-dialog-heading">
            <time v-if="log" :datetime="log.occurredAt">{{ heading }}</time>
            <template v-else>{{ missing ? "Log not found" : "Log" }}</template>
          </h2>
        </div>
        <button type="button" class="icon-button ghost" aria-label="Close log" title="Close" @click="requestClose">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path :d="mdiClose" fill="currentColor" /></svg>
        </button>
      </header>

      <p v-if="loading" class="log-dialog-muted" aria-live="polite">Loading…</p>
      <div v-else-if="missing" class="log-dialog-missing">
        <p>This log doesn’t exist any more. It may have been removed.</p>
        <button type="button" class="primary" @click="emit('close')">Back to logs</button>
      </div>
      <template v-else-if="log">
        <form v-if="editing" class="log-dialog-edit" @submit.prevent="save">
          <label>
            When
            <input v-model="draft.occurredAt" type="datetime-local" name="occurredAt" required />
          </label>
          <label>
            Text
            <textarea
              ref="bodyInput"
              v-model="draft.body"
              name="body"
              rows="6"
              maxlength="20000"
              @keydown.ctrl.enter.prevent="save"
              @keydown.meta.enter.prevent="save"
            ></textarea>
          </label>
          <div class="prompt-dialog-actions">
            <button type="button" class="text-button" :disabled="saving" @click="cancelEdit">Cancel</button>
            <button type="submit" class="primary" :disabled="saving">
              <span v-if="saving" class="spinner" aria-hidden="true"></span>Save
            </button>
          </div>
        </form>
        <template v-else>
          <p class="log-dialog-body">{{ log.body }}</p>
          <div class="log-dialog-labels">
            <LabelPicker
              :model-value="log.labelIds || []"
              :labels="labels"
              :disabled="savingLabels"
              label="Log labels"
              @update:model-value="setLabels"
              @label-created="emit('label-created', $event)"
            />
          </div>
        </template>
      </template>

      <p v-if="error" class="notice log-dialog-error" role="alert">{{ error }}</p>

      <div v-if="confirming" class="log-dialog-confirm" role="alertdialog" aria-labelledby="log-dialog-confirm-text">
        <p id="log-dialog-confirm-text">
          {{ confirming === "remove" ? "Remove this log? This can’t be undone." : "Discard your unsaved changes?" }}
        </p>
        <div class="prompt-dialog-actions">
          <button type="button" class="text-button" @click="confirming = ''">
            {{ confirming === "remove" ? "Keep log" : "Keep editing" }}
          </button>
          <button
            v-if="confirming === 'remove'"
            type="button"
            class="primary danger"
            :disabled="removing"
            @click="remove"
          >
            <span v-if="removing" class="spinner" aria-hidden="true"></span>Remove
          </button>
          <button v-else type="button" class="primary danger" @click="emit('close')">Discard</button>
        </div>
      </div>
      <footer v-else-if="log && !editing && !loading" class="prompt-dialog-actions log-dialog-actions">
        <button type="button" class="text-button danger" @click="confirming = 'remove'">Remove…</button>
        <span class="log-dialog-spacer"></span>
        <button type="button" class="text-button" @click="emit('show-in-list', log)">Show in list</button>
        <button type="button" class="primary" @click="startEdit">Edit</button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.log-dialog {
  width: min(640px, 100%);
}
.log-dialog-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.log-dialog-header h2 {
  margin: 0;
  font-size: 18px;
}
.log-dialog-eyebrow {
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
.log-dialog-body {
  margin: 0 0 16px;
  max-height: min(50dvh, 480px);
  overflow-y: auto;
  overscroll-behavior: contain;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 15px;
}
.log-dialog-muted {
  color: var(--workspace-muted);
}
.log-dialog-missing p {
  margin: 0 0 16px;
}
.log-dialog-edit {
  display: grid;
  gap: 12px;
}
.log-dialog-edit label {
  display: grid;
  gap: 4px;
  color: var(--workspace-muted);
  font-size: 13px;
}
.log-dialog-edit textarea,
.log-dialog-edit input {
  color: var(--workspace-text);
  font-size: 16px;
}
.log-dialog-error {
  margin: 12px 0 0;
}
.log-dialog-confirm {
  margin-top: 16px;
  padding: 12px;
  border: 1px solid var(--workspace-danger-border);
  border-radius: var(--workspace-radius);
  background: var(--workspace-danger-surface);
}
.log-dialog-confirm p {
  margin: 0;
}
.log-dialog-confirm .prompt-dialog-actions {
  margin-top: 12px;
}
.log-dialog-actions {
  flex-wrap: wrap;
  align-items: center;
}
.log-dialog-spacer {
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
.spinner {
  display: inline-block;
  width: 12px;
  height: 12px;
  margin-right: 6px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  vertical-align: -1px;
  animation: log-dialog-spin 700ms linear infinite;
}
@keyframes log-dialog-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation-duration: 1.6s;
  }
}
@media (max-width: 700px) {
  .log-dialog-actions > button {
    min-height: 44px;
  }
}
</style>
