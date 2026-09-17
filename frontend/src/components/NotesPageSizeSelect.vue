<script setup lang="ts">
defineProps<{
  modelValue: number;
  items: number[];
}>();

const emit = defineEmits<{
  "update:modelValue": [value: number];
}>();
</script>

<template>
  <v-select
    :model-value="modelValue"
    :items="items"
    name="notes-per-page"
    aria-label="Notes per page"
    density="compact"
    variant="outlined"
    hide-details
    :menu-props="{
      contentClass: 'notes-page-size-menu',
      location: 'top',
      maxHeight: 168,
    }"
    @update:model-value="emit('update:modelValue', Number($event))"
  />
</template>
