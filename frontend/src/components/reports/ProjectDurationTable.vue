<script setup lang="ts">
import { formatDuration, decimalHours } from "../../utils/duration";
defineProps<{ categories: Array<{ id?: string; label: string; seconds: number }>; totalSeconds: number }>();
</script>
<template>
  <div class="duration-table-wrap">
    <v-table density="comfortable" class="duration-table">
      <thead><tr><th>Project / category</th><th class="text-right">Duration</th><th class="text-right">Hours</th></tr></thead>
      <tbody><tr v-for="category in categories" :key="category.id || category.label"><td><span class="category-dot"></span>{{ category.label }}</td><td class="text-right">{{ formatDuration(category.seconds) }}</td><td class="text-right muted">{{ decimalHours(category.seconds).toFixed(2) }}</td></tr><tr v-if="!categories.length"><td colspan="3" class="muted">No tracked time in this period.</td></tr></tbody>
    </v-table>
  </div>
</template>
