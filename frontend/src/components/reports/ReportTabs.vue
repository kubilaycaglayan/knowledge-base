<script setup lang="ts">
defineProps<{ modelValue: string }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const tabs = ["Summary", "Detailed", "Weekly", "Shared"];
</script>

<template>
  <div class="report-tabs" role="tablist" aria-label="Report type">
    <button v-for="tab in tabs" :key="tab" class="report-tab" :class="{ active: modelValue === tab }" role="tab" :aria-selected="modelValue === tab" @click="emit('update:modelValue', tab)">
      {{ tab }}
    </button>
  </div>
</template>
