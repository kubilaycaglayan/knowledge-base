<script setup lang="ts">
defineProps<{
  message: string;
  details?: string;
}>();
</script>

<template>
  <div class="notice error-notice" role="alert" aria-live="polite">
    <p>{{ message }}</p>
    <details v-if="details">
      <summary>Show technical details</summary>
      <pre>{{ details }}</pre>
    </details>
  </div>
</template>

<style scoped>
.error-notice p {
  margin: 0;
}
.error-notice details {
  margin-top: 10px;
  color: var(--workspace-text);
}
.error-notice summary {
  cursor: pointer;
  font-weight: 600;
}
.error-notice pre {
  max-height: 260px;
  margin: 8px 0 0;
  overflow: auto;
  padding: 10px;
  background: var(--workspace-background);
  color: var(--workspace-text);
  font:
    12px/1.45 ui-monospace,
    SFMono-Regular,
    Menlo,
    monospace;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
