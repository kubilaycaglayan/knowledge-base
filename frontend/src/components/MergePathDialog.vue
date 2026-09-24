<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { vDialogFocus } from "../lib/dialog-focus";
import { vBackdropClose } from "../lib/backdrop-close";

type Path = { id: string; name: string; description?: string; status: string };

const props = defineProps<{ source: Path | null; paths: Path[] }>();
const emit = defineEmits<{ cancel: []; confirm: [target: Path] }>();
const query = ref("");
const targetId = ref("");
const visible = computed(() => Boolean(props.source));
const candidates = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase();
  return props.paths.filter(
    (path) =>
      path.id !== props.source?.id &&
      (!needle ||
        `${path.name} ${path.description || ""}`
          .toLocaleLowerCase()
          .includes(needle)),
  );
});

watch(visible, (isVisible) => {
  if (!isVisible) return;
  query.value = "";
  targetId.value = "";
  void nextTick(() =>
    document.querySelector<HTMLElement>("#merge-path-search")?.focus(),
  );
});

function confirm() {
  const target = candidates.value.find((path) => path.id === targetId.value);
  if (target) emit("confirm", target);
}
</script>

<template>
  <div
    v-if="visible"
    class="prompt-dialog-backdrop"
    v-backdrop-close="() => emit('cancel')"
  >
    <section
      v-dialog-focus
      class="prompt-dialog card merge-path-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="merge-path-heading"
      tabindex="-1"
      @keydown.esc.prevent="emit('cancel')"
    >
      <h2 id="merge-path-heading">Merge “{{ source?.name }}” into…</h2>
      <p class="muted">
        Move every session to the target path, then remove this path.
      </p>
      <label for="merge-path-search">Find a target path</label>
      <input
        id="merge-path-search"
        v-model="query"
        type="search"
        name="merge-path-search"
        autocomplete="off"
        placeholder="Search paths…"
      />
      <fieldset class="merge-path-options">
        <legend>Target path</legend>
        <label
          v-for="path in candidates"
          :key="path.id"
          class="merge-path-option"
        >
          <input
            v-model="targetId"
            type="radio"
            name="merge-target-path"
            :value="path.id"
          />
          <span
            ><strong>{{ path.name }}</strong
            ><small v-if="path.description">{{ path.description }}</small></span
          >
        </label>
        <p v-if="!candidates.length" class="muted">
          No matching paths. Change your search or create another path first.
        </p>
      </fieldset>
      <div class="prompt-dialog-actions">
        <button type="button" class="text-button" @click="emit('cancel')">
          Cancel
        </button>
        <button
          type="button"
          class="primary"
          :disabled="!targetId"
          @click="confirm"
        >
          OK
        </button>
      </div>
    </section>
  </div>
</template>
