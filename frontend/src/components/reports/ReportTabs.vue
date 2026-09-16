<script setup lang="ts">
const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const tabs = [
  { label: "Daily", value: "DAY" },
  { label: "Weekly", value: "WEEK" },
  { label: "Monthly", value: "MONTH" },
  { label: "Quarterly", value: "QUARTER" },
  { label: "Yearly", value: "YEAR" },
];
</script>

<template>
  <select
    class="report-tabs report-tab"
    :value="props.modelValue"
    aria-label="Report aggregation"
    @change="
      emit('update:modelValue', ($event.target as HTMLSelectElement).value)
    "
  >
    <option v-for="tab in tabs" :key="tab.value" :value="tab.value">
      {{ tab.label }}
    </option>
  </select>
</template>
