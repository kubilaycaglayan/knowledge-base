<script setup lang="ts">
import { nextTick } from "vue";

defineProps<{ modelValue: string }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const tabs = [
  { label: "Daily", value: "DAY" },
  { label: "Weekly", value: "WEEK" },
  { label: "Monthly", value: "MONTH" },
  { label: "Quarterly", value: "QUARTER" },
  { label: "Yearly", value: "YEAR" },
];

async function moveFocus(index: number) {
  const tab = tabs[(index + tabs.length) % tabs.length];
  emit("update:modelValue", tab.value);
  await nextTick();
  document
    .querySelector<HTMLElement>(`[data-report-tab="${tab.value}"]`)
    ?.focus();
}
</script>

<template>
  <div class="report-tabs" role="tablist" aria-label="Report aggregation">
    <button
      v-for="(tab, index) in tabs"
      :key="tab.value"
      class="report-tab"
      :class="{ active: modelValue === tab.value }"
      type="button"
      role="tab"
      :data-report-tab="tab.value"
      :aria-selected="modelValue === tab.value"
      :tabindex="modelValue === tab.value ? 0 : -1"
      @click="emit('update:modelValue', tab.value)"
      @keydown.left.prevent="moveFocus(index - 1)"
      @keydown.right.prevent="moveFocus(index + 1)"
      @keydown.home.prevent="moveFocus(0)"
      @keydown.end.prevent="moveFocus(tabs.length - 1)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>
