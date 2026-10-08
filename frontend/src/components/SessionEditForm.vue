<script setup lang="ts">
import { computed, ref, watch } from "vue";
import LabelPicker from "./LabelPicker.vue";
import type { Label } from "../stores/labels";
import type { Session } from "../stores/sessions";

export type SessionDraft = {
  pathId: string;
  labelIds: string[];
  startedAt: string;
  endedAt: string;
  description: string;
  source: string;
};

const props = defineProps<{
  session: Session;
  paths: { id: string; name: string }[];
  labels: Label[];
  saving: boolean;
}>();
const emit = defineEmits<{ save: [draft: SessionDraft]; cancel: [] }>();

const sources = ["WEB", "IOS", "CHROME_EXTENSION", "MANUAL", "IMPORT"];

function localDateTime(iso?: string) {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function fromSession(session: Session): SessionDraft {
  return {
    pathId: session.pathId || "",
    labelIds: [...(session.labelIds || [])],
    startedAt: localDateTime(session.startedAt),
    endedAt: localDateTime(session.endedAt),
    description: session.description || "",
    source: session.source,
  };
}
const draft = ref<SessionDraft>(fromSession(props.session));
watch(() => props.session.id, () => { draft.value = fromSession(props.session); });
const submit = () => emit("save", { ...draft.value, labelIds: [...draft.value.labelIds] });
/** True once anything differs from the session as loaded. */
const dirty = computed(() => JSON.stringify(draft.value) !== JSON.stringify(fromSession(props.session)));
defineExpose({ dirty });
</script>

<template>
  <form
    class="session-edit"
    @keydown.ctrl.enter.prevent="submit"
    @keydown.meta.enter.prevent="submit"
    @submit.prevent="submit"
  >
    <label class="session-edit-path"
      >Path<select
        v-model="draft.pathId"
        name="session-path"
        autocomplete="off"
        aria-label="Edit session path"
      >
        <option value="">Unassigned</option>
        <option v-for="path in paths" :key="path.id" :value="path.id">
          {{ path.name }}
        </option>
      </select></label
    >
    <div class="session-edit-grid">
      <label class="session-edit-description"
        >Description <span>(optional)</span
        ><textarea
          v-model="draft.description"
          name="session-description"
          autocomplete="off"
          aria-label="Edit session description"
          maxlength="5000"
          rows="1"
          placeholder="What did you work on…"
        ></textarea>
      </label>
      <fieldset class="session-edit-labels">
        <legend>Labels</legend>
        <LabelPicker v-model="draft.labelIds" :labels="labels" label="Session labels" />
      </fieldset>
      <label
        >Source<select
          v-model="draft.source"
          name="session-source"
          autocomplete="off"
          aria-label="Edit session source"
        >
          <option v-for="source in sources" :key="source">
            {{ source }}
          </option>
        </select></label
      >
      <label
        >Started<input
          v-model="draft.startedAt"
          type="datetime-local"
          name="session-started-at"
          autocomplete="off"
          aria-label="Edit session start"
          required
      /></label>
      <label
        >Ended<input
          v-model="draft.endedAt"
          type="datetime-local"
          name="session-ended-at"
          autocomplete="off"
          aria-label="Edit session end"
          required
      /></label>
    </div>
    <div class="session-actions">
      <button class="primary" :disabled="saving">
        {{ saving ? "Saving…" : "Save session" }}
      </button>
      <button type="button" class="text-button" @click="emit('cancel')">
        Cancel
      </button>
    </div>
  </form>
</template>
