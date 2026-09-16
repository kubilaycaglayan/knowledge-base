<script setup lang="ts">
import { reportColors as colors } from "../../lib/chart-colors";
import { formatDurationHoursMinutes } from "../../utils/duration";
withDefaults(
  defineProps<{
    categories: Array<{
      id?: string;
      label: string;
      seconds: number;
      color?: string;
    }>;
    categoryLabel?: string;
  }>(),
  { categoryLabel: "Path" },
);
</script>
<template>
  <div class="duration-table-wrap">
    <v-table density="comfortable" class="duration-table">
      <thead>
        <tr>
          <th>{{ categoryLabel }}</th>
          <th class="text-right">Total</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(category, index) in categories"
          :key="category.id || category.label"
        >
          <td>
            <span
              class="category-dot"
              :style="{
                background: category.color || colors[index % colors.length],
              }"
            ></span
            >{{ category.label }}
          </td>
          <td class="text-right">
            {{ formatDurationHoursMinutes(category.seconds) }}
          </td>
        </tr>
        <tr v-if="!categories.length">
          <td colspan="2" class="muted">No tracked time in this period.</td>
        </tr>
      </tbody>
    </v-table>
  </div>
</template>
