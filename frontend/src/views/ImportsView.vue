<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api } from "../lib/api";

type ImportBatch = {
  id: string;
  source: string;
  imported: number;
  skipped: number;
  createdPaths: number;
  createdAt: string;
  undoneAt?: string | null;
};
type ImportSummary = {
  batchId: string;
  imported: number;
  skipped: number;
  createdPaths: number;
};

const clockifyJson = ref(""),
  importSummary = ref(""),
  error = ref(""),
  batches = ref<ImportBatch[]>([]);
const formatDate = (iso: string) => new Date(iso).toLocaleString();

async function load() {
  try {
    batches.value = await api<ImportBatch[]>("/imports/clockify/batches");
  } catch {
    error.value = "Unable to load import batches.";
  }
}
async function importClockify() {
  try {
    const payload = JSON.parse(clockifyJson.value);
    if (!payload || !Array.isArray(payload.timeentries))
      throw new Error("Clockify JSON needs a timeentries array.");
    const summary = await api<ImportSummary>("/imports/clockify", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    importSummary.value = `Imported ${summary.imported} sessions, skipped ${summary.skipped} duplicates, and created ${summary.createdPaths} paths.`;
    clockifyJson.value = "";
    await load();
  } catch (cause) {
    error.value =
      cause instanceof SyntaxError
        ? "Paste valid Clockify JSON."
        : cause instanceof Error
          ? cause.message
          : "Could not import Clockify data.";
  }
}
async function undo(batch: ImportBatch) {
  if (!confirm(`Undo Clockify import from ${formatDate(batch.createdAt)}?`))
    return;
  try {
    const result = await api<{
      deletedEntries: number;
      deletedActivities: number;
    }>(`/imports/clockify/batches/${batch.id}`, { method: "DELETE" });
    importSummary.value = `Removed ${result.deletedEntries} imported sessions and ${result.deletedActivities} activity records.`;
    await load();
  } catch {
    error.value = "Could not undo this import batch.";
  }
}
onMounted(load);
</script>

<template>
  <section>
    <p class="eyebrow">CLOCKIFY IMPORTS=</p>
    <h1>Imports</h1>
    <p class="lede">
      Import completed Clockify sessions and undo a whole imported batch when
      needed.
    </p>
    <section class="card import-panel">
      <textarea
        v-model="clockifyJson"
        rows="10"
        aria-label="Clockify JSON"
        placeholder="Paste Clockify export JSON here"
      ></textarea>
      <div class="item-actions">
        <button
          class="primary"
          :disabled="!clockifyJson.trim()"
          @click="importClockify"
        >
          Import Clockify sessions</button
        ><span v-if="importSummary" class="muted" role="status">{{
          importSummary
        }}</span>
      </div>
    </section>
    <section class="card history-box">
      <p class="eyebrow">IMPORT BATCHES</p>
      <div v-for="batch in batches" :key="batch.id" class="history-row">
        <span
          ><strong>{{ formatDate(batch.createdAt) }}</strong
          ><span class="muted">
            · {{ batch.imported }} imported · {{ batch.skipped }} skipped ·
            {{ batch.createdPaths }} paths</span
          ></span
        ><span v-if="batch.undoneAt" class="pill">undone</span
        ><button v-else class="text-button danger" @click="undo(batch)">
          Undo
        </button>
      </div>
      <p v-if="!batches.length" class="muted">No Clockify imports yet.</p>
    </section>
    <p v-if="error" class="notice" role="alert">{{ error }}</p>
  </section>
</template>
