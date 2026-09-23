<script setup lang="ts">
// The time tracker's play/stop button, shared by the floating tracker and
// board cards. Callers own what a click starts or stops.
defineProps<{ label: string; running?: boolean; busy?: boolean }>();
defineEmits<{ click: [event: MouseEvent] }>();
</script>

<template>
  <button
    class="timer-run-button"
    :class="{ 'is-running': running }"
    type="button"
    :disabled="busy"
    :aria-busy="busy"
    :aria-label="label"
    :title="label"
    @click="$emit('click', $event)"
  >
    <span class="timer-action-icon" :class="{ stop: running }" aria-hidden="true"></span>
  </button>
</template>

<style scoped>
.timer-run-button {
  display: inline-flex;
  width: 36px;
  min-width: 36px;
  min-height: 36px;
  align-items: center;
  justify-content: center;
  border: 1px solid #4f9b6d;
  border-radius: 6px;
  padding: 0;
  background: #edf8f0;
  color: #197a43;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  touch-action: manipulation;
}
.timer-run-button:hover {
  border-color: #197a43;
  background: #d9f0e0;
  color: #105d31;
}
.timer-run-button:active {
  background: #c8e8d1;
}
.timer-run-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
:global(:root[data-theme="dark"] .timer-run-button:not(.is-running)) {
  border-color: #2f6b45;
  background: #15301f;
  color: #7fd49b;
}
:global(:root[data-theme="dark"] .timer-run-button:not(.is-running):hover) {
  border-color: #4f9b6d;
  background: #1c3f29;
  color: #a3e4b7;
}
.timer-run-button.is-running {
  border-color: var(--workspace-danger-border);
  background: var(--workspace-danger-surface);
  color: var(--workspace-danger);
}
.timer-run-button.is-running:hover {
  border-color: var(--workspace-danger);
  color: var(--workspace-danger-hover);
}
.timer-run-button:focus-visible {
  outline: 2px solid var(--workspace-focus);
  outline-offset: 2px;
}
.timer-action-icon {
  width: 0;
  height: 0;
  border-top: 5px solid transparent;
  border-bottom: 5px solid transparent;
  border-left: 7px solid currentColor;
}
.timer-action-icon.stop {
  width: 8px;
  height: 8px;
  border: 0;
  background: currentColor;
}
@media (pointer: coarse) {
  .timer-run-button {
    width: 44px;
    min-width: 44px;
    min-height: 44px;
  }
}
</style>
