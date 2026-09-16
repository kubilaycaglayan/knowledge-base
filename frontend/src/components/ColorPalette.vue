<script setup lang="ts">
import { colorPalette } from "../lib/color-palette";

withDefaults(
  defineProps<{
    modelValue: string;
    legend?: string;
    optionLabel?: string;
  }>(),
  { legend: "Color", optionLabel: "Choose color" },
);

const emit = defineEmits<{ "update:modelValue": [value: string] }>();
</script>

<template>
  <fieldset class="color-palette">
    <legend>{{ legend }}</legend>
    <button
      v-for="color in colorPalette"
      :key="color.hex"
      type="button"
      :aria-label="`${optionLabel}: ${color.name} (${color.hex})`"
      :aria-pressed="modelValue === color.hex"
      :style="{ '--palette-color': color.hex }"
      @click="emit('update:modelValue', color.hex)"
    >
      <span aria-hidden="true"></span>
    </button>
  </fieldset>
</template>

<style scoped>
.color-palette {
  display: grid;
  grid-template-columns: repeat(5, 28px);
  gap: 2px;
  align-items: center;
  border: 0;
  padding: 0;
  margin: 0;
}
.color-palette legend {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
.color-palette button {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.color-palette button span {
  display: block;
  width: 22px;
  height: 22px;
  border: 2px solid var(--workspace-surface);
  border-radius: 50%;
  background: var(--palette-color);
  box-shadow: 0 0 0 1px var(--workspace-control-border);
}
.color-palette button:hover span {
  box-shadow: 0 0 0 2px var(--workspace-muted);
}
.color-palette button[aria-pressed="true"] span {
  box-shadow: 0 0 0 2px var(--workspace-text);
}
.color-palette button:focus-visible {
  outline: 2px solid var(--workspace-accent);
  outline-offset: 1px;
}
@media (max-width: 700px) {
  .color-palette {
    grid-template-columns: repeat(5, 44px);
    gap: 2px;
  }
  .color-palette button {
    width: 44px;
    height: 44px;
  }
  .color-palette button span {
    width: 24px;
    height: 24px;
  }
}
</style>
