<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import LabelPicker from "../components/LabelPicker.vue";
import { useLabelsStore } from "../stores/labels";

const labelsStore = useLabelsStore();
const { labels, loading } = storeToRefs(labelsStore);
const selectedLabelIds = ref<string[]>([]);
const density = ref<"compact" | "comfortable">("compact");
const loadError = ref("");
const selectedCount = computed(() => selectedLabelIds.value.length);
const pickerExamples = computed(() => density.value === "compact"
  ? [420, 310, 200]
  : [640, 470, 320]);

onMounted(async () => {
  try {
    await labelsStore.load();
    selectedLabelIds.value = [...labels.value]
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, Math.min(3, labels.value.length))
      .map((label) => label.id);
  } catch {
    loadError.value = "Could not load your labels. Try refreshing the page.";
  }
});
</script>

<template>
  <div class="development-page">
    <header class="development-heading">
      <span class="experiment-mark" aria-hidden="true">✳</span>
      <p class="eyebrow">COMPONENT WORKSHOP</p>
      <h1>Label picker</h1>
      <p class="development-lede">A new way to find, select, and create labels. Try searching inside a word, selecting a few, and seeing how the chips adapt.</p>
    </header>

    <section class="picker-demo" aria-labelledby="picker-demo-title">
      <div class="demo-title-row">
        <div>
          <p class="demo-overline">EXPERIMENT 01</p>
          <h2 id="picker-demo-title">Multi-select label input</h2>
        </div>
        <span class="draft-badge"><span></span> In development</span>
      </div>
      <div class="density-switch" role="group" aria-label="Picker size">
        <button type="button" :aria-pressed="density === 'compact'" @click="density = 'compact'">Compact <span>Default</span></button>
        <button type="button" :aria-pressed="density === 'comfortable'" @click="density = 'comfortable'">Comfortable <span>Optional</span></button>
      </div>
      <div class="picker-examples">
        <section v-for="width in pickerExamples" :key="width" class="picker-example" :style="{ width: `${width}px` }">
          <label class="picker-label" :for="`development-label-${width}`">Labels <span>{{ width }}px wide</span></label>
          <LabelPicker
            v-model="selectedLabelIds"
            :labels="labels"
            :density="density"
            :input-id="`development-label-${width}`"
            :label="`Labels, ${width}px example`"
          />
        </section>
      </div>
      <p v-if="loadError" class="page-error" role="alert">{{ loadError }}</p>
      <p v-else-if="loading" class="page-note" role="status">Loading your labels…</p>
      <div v-else class="selection-summary" aria-live="polite">
        <span class="summary-check" aria-hidden="true">✓</span>
        <span>{{ selectedCount }} {{ selectedCount === 1 ? "label" : "labels" }} selected</span>
        <button v-if="selectedCount" type="button" class="clear-selection" @click="selectedLabelIds = []">Clear all</button>
      </div>
      <div class="demo-footer">
        <span class="footer-indicator"></span>
        Changes here are temporary until you leave this page.
      </div>
    </section>

    <p class="workshop-caption">This picker is a standalone experiment. Existing label controls remain unchanged while we refine the component.</p>
  </div>
</template>

<style scoped>
.development-page { width: min(100%, 820px); margin: 52px auto 0; padding: 0 20px 64px; }
.development-heading { position: relative; max-width: 660px; margin: 0 auto 34px; text-align: center; }
.experiment-mark { display: inline-grid; place-items: center; width: 38px; height: 38px; margin-bottom: 14px; border: 1px solid var(--workspace-border); border-radius: 12px; background: var(--workspace-surface); color: var(--workspace-selected-text); font-size: 21px; box-shadow: 0 5px 18px color-mix(in srgb, var(--workspace-text) 7%, transparent); }
.development-heading .eyebrow { margin: 0 0 8px; color: var(--workspace-selected-text); font-size: 10px; font-weight: 700; letter-spacing: .14em; }
.development-heading h1 { margin-bottom: 10px; font-size: clamp(30px, 5vw, 38px); letter-spacing: -1.2px; }
.development-lede { max-width: 560px; margin: 0 auto; color: var(--workspace-muted); font-size: 14px; line-height: 1.7; text-wrap: balance; }
.picker-demo { padding: clamp(20px, 4vw, 32px); border: 1px solid var(--workspace-border); border-radius: 16px; background: var(--workspace-surface); box-shadow: 0 18px 50px color-mix(in srgb, var(--workspace-text) 7%, transparent), 0 2px 8px color-mix(in srgb, var(--workspace-text) 4%, transparent); }
.demo-title-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 28px; }
.demo-overline { margin: 0 0 5px; color: var(--workspace-muted); font-size: 10px; font-weight: 650; letter-spacing: .12em; }
.demo-title-row h2 { margin: 0; font-size: 17px; font-weight: 650; letter-spacing: -.2px; }
.draft-badge { display: inline-flex; align-items: center; gap: 7px; min-height: 28px; padding: 4px 9px; border: 1px solid var(--workspace-border); border-radius: 99px; color: var(--workspace-muted); font-size: 10px; white-space: nowrap; }
.draft-badge span, .footer-indicator { width: 7px; height: 7px; border-radius: 50%; background: var(--workspace-selected-text); box-shadow: 0 0 0 3px color-mix(in srgb, var(--workspace-selected-text) 12%, transparent); }
.density-switch { display: flex; width: fit-content; gap: 3px; margin-bottom: 20px; padding: 3px; border: 1px solid var(--workspace-border); border-radius: 8px; background: var(--workspace-background); }
.density-switch button { min-height: 34px; padding: 5px 10px; border: 1px solid transparent; border-radius: 5px; background: transparent; color: var(--workspace-muted); font-size: 11px; }
.density-switch button[aria-pressed="true"] { border-color: var(--workspace-border); background: var(--workspace-surface); color: var(--workspace-text); box-shadow: 0 1px 2px color-mix(in srgb, var(--workspace-text) 8%, transparent); }
.density-switch button span { margin-left: 5px; color: var(--workspace-muted); font-size: 9px; }
.picker-examples { display: grid; justify-items: start; gap: 22px; }
.picker-example { max-width: 100%; }
.picker-label { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 8px; font-size: 12px; font-weight: 600; }
.picker-label span { color: var(--workspace-muted); font-size: 11px; font-weight: 400; }
.selection-summary { display: flex; align-items: center; gap: 8px; min-height: 38px; margin-top: 12px; color: var(--workspace-muted); font-size: 11px; }
.summary-check { display: grid; place-items: center; width: 17px; height: 17px; border-radius: 50%; background: color-mix(in srgb, var(--workspace-selected-text) 14%, transparent); color: var(--workspace-selected-text); font-size: 10px; font-weight: 700; }
.clear-selection { min-height: 30px; margin-left: auto; padding: 4px 7px; border: 0; border-radius: 5px; background: transparent; color: var(--workspace-muted); font-size: 11px; text-decoration: underline; text-underline-offset: 3px; }
.clear-selection:hover { background: var(--workspace-hover); color: var(--workspace-text); }
.page-note, .page-error { margin: 12px 0 0; color: var(--workspace-muted); font-size: 11px; }
.page-error { color: var(--workspace-danger); }
.demo-footer { display: flex; align-items: center; gap: 9px; margin-top: 22px; padding-top: 16px; border-top: 1px solid var(--workspace-border); color: var(--workspace-muted); font-size: 10px; }
.footer-indicator { width: 6px; height: 6px; flex: 0 0 auto; box-shadow: none; }
.workshop-caption { max-width: 600px; margin: 22px auto 0; color: var(--workspace-muted); font-size: 11px; line-height: 1.6; text-align: center; }
@media (max-width: 600px) { .development-page { margin-top: 28px; padding-inline: 0; } .development-heading { margin-bottom: 24px; } .demo-title-row { margin-bottom: 23px; } .draft-badge { padding-inline: 7px; font-size: 9px; } .density-switch { margin-bottom: 16px; } }
</style>
