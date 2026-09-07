<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from "vue";

defineProps<{ appearance?: "flat" }>();

type PromptOptions = { multiline?: boolean; confirmation?: boolean };

const visible = ref(false);
const message = ref("");
const value = ref("");
const multiline = ref(false);
const confirmation = ref(false);
let resolvePrompt: ((result: string | null) => void) | null = null;

function finish(result: string | null) {
  if (!resolvePrompt) return;
  const resolve = resolvePrompt;
  resolvePrompt = null;
  visible.value = false;
  resolve(result);
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
  visible.value = true;
  void nextTick(() => {
    document
      .querySelector<HTMLElement>(".prompt-dialog input, .prompt-dialog textarea")
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
  <div v-if="visible" class="prompt-dialog-backdrop" :class="{ flat: appearance === 'flat' }">
    <section
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
        autofocus
        @keydown.ctrl.enter.prevent="finish(value)"
      ></textarea>
      <input
        v-else-if="!confirmation"
        v-model="value"
        :aria-label="message"
        autofocus
        @keydown.enter.prevent="finish(value)"
      />
      <div class="prompt-dialog-actions">
        <button class="text-button" @click="finish(null)">Cancel</button>
        <button class="primary" @click="finish(value)">{{ confirmation ? "Confirm" : "OK" }}</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* Optional workspace appearance; existing consumers keep their current style. */
.flat { background: #18212f66; overscroll-behavior: contain; }
.flat .prompt-dialog {
  max-height: calc(100dvh - 40px);
  overflow-y: auto;
  overscroll-behavior: contain;
  border: 1px solid var(--workspace-control-border, #aab3c0);
  border-radius: 6px;
  padding: 24px;
  background: var(--workspace-surface, #fff);
  color: var(--workspace-text, #252b36);
  box-shadow: none;
}
.flat h2 { font-size: 18px; font-weight: 600; letter-spacing: -.2px; overflow-wrap: anywhere; }
.flat input, .flat textarea {
  min-width: 0;
  border-color: var(--workspace-control-border, #aab3c0);
  border-radius: 4px;
  padding: 10px 12px;
  color: inherit;
  font-size: 16px;
}
.flat button {
  min-height: 40px;
  min-width: 64px;
  border: 1px solid var(--workspace-control-border, #aab3c0);
  border-radius: 4px;
  padding: 8px 14px;
  background: var(--workspace-surface, #fff);
  color: var(--workspace-text, #252b36);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
}
.flat button:hover { border-color: #606b7b; background: #edf0f4; }
.flat button:active { background: #dce2ea; }
.flat .primary { background: var(--workspace-accent, #334155); color: #fff; border-color: var(--workspace-accent, #334155); }
.flat .primary:hover { background: #1b2533; }
.flat .primary:active { background: #101822; }
.flat :focus-visible { outline: 2px solid var(--workspace-focus, #2563b5); outline-offset: 3px; }
.flat input, .flat textarea, .flat button { touch-action: manipulation; }
@media (max-width: 700px) { .flat button { min-height: 44px; } }
</style>
