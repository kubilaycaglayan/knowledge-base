<script setup lang="ts">
import { computed } from "vue";
import { contrastingPathTextColor, pathTextContrastRatio } from "../lib/path-colors";

const props = defineProps<{
  id: string;
  backgroundColor: string;
  modelValue?: string | null;
}>();
const emit = defineEmits<{ "update:modelValue": [color: string | null] }>();
const automaticColor = computed(() => contrastingPathTextColor(props.backgroundColor));
const selectedColor = computed(() => props.modelValue || automaticColor.value);
const contrastRatio = computed(() => pathTextContrastRatio(props.backgroundColor, selectedColor.value));
function selectCustom() {
  emit("update:modelValue", props.modelValue || automaticColor.value);
}
function updateCustom(event: Event) {
  emit("update:modelValue", (event.target as HTMLInputElement).value.toUpperCase());
}
</script>

<template>
  <fieldset class="path-text-color-control">
    <legend>Path text color</legend>
    <div class="path-text-color-options">
      <label :for="`${id}-auto`">
        <input :id="`${id}-auto`" type="radio" :name="id" :checked="!modelValue" @change="emit('update:modelValue', null)" />
        Automatic contrast
      </label>
      <label :for="`${id}-custom`">
        <input :id="`${id}-custom`" type="radio" :name="id" :checked="Boolean(modelValue)" @change="selectCustom" />
        Custom
      </label>
      <input
        type="color"
        :value="modelValue || automaticColor"
        :disabled="!modelValue"
        aria-label="Custom path text color"
        @input="updateCustom"
      />
      <span class="path-text-color-preview" :style="{ backgroundColor, color: selectedColor }" aria-hidden="true">Aa</span>
    </div>
    <p class="muted">Automatic chooses whichever of light or dark text has better contrast.</p>
    <p class="path-text-color-contrast" :class="{ low: contrastRatio < 4.5 }" aria-live="polite">
      Contrast {{ contrastRatio.toFixed(2) }}:1{{ contrastRatio < 4.5 ? ". Low for small text." : "." }}
    </p>
  </fieldset>
</template>

<style scoped>
.path-text-color-control { min-width:0; border:0; padding:0; margin:0; }
.path-text-color-control legend { margin-bottom:.25rem; font-size:.84rem; font-weight:650; }
.path-text-color-options { display:flex; align-items:center; flex-wrap:wrap; gap:.65rem; }
.path-text-color-options label { display:inline-flex; align-items:center; gap:.35rem; min-height:32px; cursor:pointer; }
.path-text-color-options input[type="radio"] { width:16px; height:16px; margin:0; }
.path-text-color-options input[type="color"] { width:40px; height:36px; min-height:36px; padding:3px; border:1px solid var(--workspace-border); border-radius:6px; background:var(--workspace-surface); }
.path-text-color-options input[type="color"]:disabled { opacity:.5; }
.path-text-color-preview { display:grid; place-items:center; width:48px; height:28px; border-radius:5px; font-weight:700; }
.path-text-color-control p { margin:.25rem 0 0; font-size:.78rem; }
.path-text-color-contrast { font-variant-numeric:tabular-nums; }
.path-text-color-contrast.low { color:var(--workspace-danger, #a11b1b); font-weight:600; }
@media (max-width:700px) {
  .path-text-color-options label { min-height:44px; }
  .path-text-color-options input[type="color"] { width:44px; height:44px; min-height:44px; }
}
</style>
