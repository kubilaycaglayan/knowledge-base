<script setup lang="ts">
defineProps<{ label: string; anchor: string }>();
const emit = defineEmits<{ previous: []; next: []; today: []; "update:anchor": [value: string] }>();
</script>

<template>
  <div class="report-date-range">
    <v-btn variant="outlined" size="small" prepend-icon="mdi-calendar-month-outline" class="range-label">{{ label }}</v-btn>
    <v-btn icon="mdi-chevron-left" aria-label="Previous week" variant="outlined" size="small" @click="emit('previous')" />
    <v-btn icon="mdi-chevron-right" aria-label="Next week" variant="outlined" size="small" @click="emit('next')" />
    <input :value="anchor" type="date" aria-label="Report anchor date" @change="emit('update:anchor', ($event.target as HTMLInputElement).value)" />
  </div>
</template>
