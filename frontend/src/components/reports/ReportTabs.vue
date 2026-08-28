<script setup lang="ts">
defineProps<{ modelValue: string }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const tabs = [
  { label: "Weekly", value: "WEEK" },
  { label: "Monthly", value: "MONTH" },
  { label: "Yearly", value: "YEAR" },
];
</script>

<template>
  <div class="report-tabs" role="tablist" aria-label="Report period">
    <button v-for="tab in tabs" :key="tab.value" class="report-tab" :class="{ active: modelValue === tab.value }" role="tab" :aria-selected="modelValue === tab.value" @click="emit('update:modelValue', tab.value)">
      {{ tab.label }}
    </button>
  </div>
</template>
