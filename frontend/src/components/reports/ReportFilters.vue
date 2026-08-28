<script setup lang="ts">
export type ReportFiltersModel = { team: string; client: string; project: string; task: string; tag: string; description: string };
const props = defineProps<{ modelValue: ReportFiltersModel; projectOptions: string[] }>();
const emit = defineEmits<{ "update:modelValue": [value: ReportFiltersModel]; apply: [] }>();
function set(key: keyof ReportFiltersModel, value: string) {
  emit("update:modelValue", { ...props.modelValue, [key]: value });
}
</script>

<template>
  <div class="report-filters">
    <span class="filter-label">FILTER</span>
    <v-text-field :model-value="modelValue.team" label="Team" density="compact" variant="plain" hide-details @update:model-value="set('team', $event || '')" />
    <v-text-field :model-value="modelValue.client" label="Client" density="compact" variant="plain" hide-details @update:model-value="set('client', $event || '')" />
    <v-select :model-value="modelValue.project" :items="projectOptions" label="Project" density="compact" variant="plain" hide-details clearable @update:model-value="set('project', $event || '')" />
    <v-text-field :model-value="modelValue.task" label="Task" density="compact" variant="plain" hide-details @update:model-value="set('task', $event || '')" />
    <v-text-field :model-value="modelValue.tag" label="Tag" density="compact" variant="plain" hide-details @update:model-value="set('tag', $event || '')" />
    <v-text-field :model-value="modelValue.description" label="Description" density="compact" variant="plain" hide-details @update:model-value="set('description', $event || '')" />
    <v-btn color="primary" size="small" @click="emit('apply')">Apply filter</v-btn>
  </div>
</template>
