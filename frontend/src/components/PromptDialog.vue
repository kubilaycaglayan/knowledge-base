<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from "vue";
import { vDialogFocus } from "../lib/dialog-focus";

defineProps<{ appearance?: "flat" }>();

type PromptOptions = {
  multiline?: boolean;
  confirmation?: boolean;
  inputType?: "text" | "datetime-local";
  confirmLabel?: string;
};

const visible = ref(false);
const message = ref("");
const value = ref("");
const multiline = ref(false);
const confirmation = ref(false);
const inputType = ref<PromptOptions["inputType"]>("text");
const confirmLabel = ref("");
let resolvePrompt: ((result: string | null) => void) | null = null;

function finish(result: string | null) {
  if (!resolvePrompt) return;
  const resolve = resolvePrompt;
  resolvePrompt = null;
  visible.value = false;
  resolve(result);
}
function handleSingleLineBeforeInput(event: InputEvent) {
  if (
    event.inputType !== "insertLineBreak" &&
    event.inputType !== "insertParagraph"
  )
    return;
  event.preventDefault();
  finish(value.value);
}

function open(
  nextMessage: string,
  defaultValue = "",
  options: PromptOptions = {},
): Promise<string | null> {
  if (resolvePrompt) finish(null);
  message.value = nextMessage;
  value.value = defaultValue;
  multiline.value = Boolean(options.multiline);
  confirmation.value = Boolean(options.confirmation);
  inputType.value = options.inputType || "text";
  confirmLabel.value = options.confirmLabel || "";
  visible.value = true;
  void nextTick(() => {
    document
      .querySelector<HTMLElement>(
        ".prompt-dialog input, .prompt-dialog textarea",
      )
      ?.focus();
  });
  return new Promise((resolve) => {
    resolvePrompt = resolve;
  });
}

watch(visible, (isVisible) => {
  if (!isVisible) finish(null);
});

onUnmounted(() => finish(null));

defineExpose({ open });
</script>

<template>
  <div
    v-if="visible"
    class="prompt-dialog-backdrop"
    :class="{ flat: appearance === 'flat' }"
    @click.self="finish(null)"
  >
    <section
      v-dialog-focus
      class="prompt-dialog card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="prompt-dialog-message"
      tabindex="-1"
      @keydown.esc.prevent="finish(null)"
    >
      <h2 id="prompt-dialog-message">{{ message }}</h2>
      <textarea
        v-if="!confirmation && multiline"
        v-model="value"
        :aria-label="message"
        rows="4"
        @keydown.ctrl.enter.prevent="finish(value)"
        @keydown.meta.enter.prevent="finish(value)"
      ></textarea>
      <input
        v-else-if="!confirmation"
        v-model="value"
        :type="inputType"
        :aria-label="message"
        enterkeyhint="done"
        @beforeinput="handleSingleLineBeforeInput"
        @keydown.enter.prevent="finish(value)"
      />
      <div class="prompt-dialog-actions">
        <button class="text-button" @click="finish(null)">Cancel</button>
        <button class="primary" @click="finish(value)">
          {{ confirmLabel || (confirmation ? "Confirm" : "OK") }}
        </button>
      </div>
    </section>
  </div>
</template>
