<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { mdiClose } from "@mdi/js";
import { useNoticesStore } from "../stores/notices";
import { snackbarBottom } from "../lib/snackbar-position";

// One snackbar for the whole app. It sits above the floating time tracker when
// that is on screen (measured, since the tracker grows and follows the
// on-screen keyboard) and at the bottom edge otherwise.
const notices = useNoticesStore();
const open = computed({
  get: () => Boolean(notices.current),
  set: (value) => { if (!value) notices.dismiss(); },
});
const bottom = ref(16);
function trackerTop() {
  const tracker = document.querySelector<HTMLElement>(".floating-tracker-host:not(.inline) .floating-tracker");
  if (!tracker) return null;
  const rect = tracker.getBoundingClientRect();
  return rect.height ? rect.top : null;
}
function place() {
  const viewport = window.visualViewport?.height || window.innerHeight;
  bottom.value = snackbarBottom(viewport, trackerTop());
}
let resize: ResizeObserver | null = null;
watch(open, (shown) => {
  resize?.disconnect();
  window.visualViewport?.removeEventListener("resize", place);
  if (!shown) return;
  place();
  const tracker = document.querySelector(".floating-tracker-host");
  if (tracker && typeof ResizeObserver !== "undefined") { resize = new ResizeObserver(place); resize.observe(tracker); }
  window.visualViewport?.addEventListener("resize", place);
}, { immediate: true });
onBeforeUnmount(() => { resize?.disconnect(); window.visualViewport?.removeEventListener("resize", place); });
</script>

<template>
  <v-snackbar
    v-model="open"
    class="app-snackbar"
    :class="`tone-${notices.current?.tone || 'error'}`"
    :style="{ '--snackbar-bottom': `${bottom}px` }"
    location="bottom"
    :timeout="notices.current?.tone === 'info' ? 4000 : 7000"
    :key="notices.current?.id"
  >
    <!-- Vuetify's snackbar content is already a polite status region. -->
    {{ notices.current?.text }}
    <template #actions>
      <v-btn icon variant="text" size="small" aria-label="Dismiss message" @click="notices.dismiss()">
        <v-icon :icon="mdiClose" size="18" aria-hidden="true" />
      </v-btn>
    </template>
  </v-snackbar>
</template>

<style>
.app-snackbar .v-snackbar__wrapper {
  margin: 0 12px var(--snackbar-bottom, 16px);
  max-width: min(560px, calc(100vw - 24px));
  min-width: min(320px, calc(100vw - 24px));
  border-radius: 8px;
}
.app-snackbar.tone-error .v-snackbar__wrapper {
  border-left: 4px solid #d05a47;
}
</style>
