<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api } from "../lib/api";
import { formatDateTime } from "../lib/date";

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
  knowledgeBaseCsv = ref(""),
  activeTab = ref<"clockify" | "knowledge-base">("clockify"),
  importingKnowledgeBase = ref(false),
  importSummary = ref(""),
  error = ref(""),
  batches = ref<ImportBatch[]>([]);
const formatDate = (iso: string) => formatDateTime(iso);

async function load() {
  try {
    const clockify = await api<ImportBatch[]>("/imports/clockify/batches");
    batches.value = clockify;
  } catch {
    error.value = "Unable to load import batches.";
  }
}
async function selectTab(tab: "clockify" | "knowledge-base") {
  activeTab.value = tab;
  if (tab === "knowledge-base") {
    try {
      const knowledgeBase = await api<ImportBatch[]>("/imports/knowledge-base/batches");
      batches.value = [...batches.value.filter((batch) => batch.source !== "KNOWLEDGE_BASE"), ...knowledgeBase]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch { error.value = "Unable to load Knowledge Base import batches."; }
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
async function importKnowledgeBase() {
  importingKnowledgeBase.value = true;
  try {
    if (!knowledgeBaseCsv.value.trim()) throw new Error("Paste a Knowledge Base CSV file first.");
    const summary = await api<ImportSummary>("/imports/knowledge-base", {
      method: "POST", headers: { "Content-Type": "text/csv" }, body: knowledgeBaseCsv.value,
    });
    importSummary.value = `Imported ${summary.imported} records, skipped ${summary.skipped} duplicates, and created ${summary.createdPaths} paths.`;
    knowledgeBaseCsv.value = "";
    await load();
  } catch (cause) { error.value = cause instanceof Error ? cause.message : "Could not import Knowledge Base data."; }
  finally { importingKnowledgeBase.value = false; }
}
async function undo(batch: ImportBatch) {
  if (!confirm(`Undo Clockify import from ${formatDate(batch.createdAt)}?`))
    return;
  try {
    const result = await api<{
      deletedEntries: number;
      deletedActivities: number;
      deletedPaths?: number;
    }>(`/imports/${batch.source === "KNOWLEDGE_BASE" ? "knowledge-base" : "clockify"}/batches/${batch.id}`, { method: "DELETE" });
    importSummary.value = `Removed ${result.deletedEntries} imported sessions, ${result.deletedActivities} timeline records, and ${result.deletedPaths ?? 0} paths.`;
    await load();
  } catch {
    error.value = "Could not undo this import batch.";
  }
}
onMounted(load);
</script>

<template>
  <section>
    <p class="eyebrow">CLOCKIFY IMPORTS</p>
    <h1>Imports</h1>
    <p class="lede">
      Import completed Clockify sessions and undo a whole imported batch when
      needed.
    </p>
    <div class="import-tabs" role="tablist" aria-label="Import source">
      <button type="button" role="tab" :aria-selected="activeTab === 'clockify'" :class="{ selected: activeTab === 'clockify' }" @click="selectTab('clockify')">Clockify</button>
      <button type="button" role="tab" :aria-selected="activeTab === 'knowledge-base'" :class="{ selected: activeTab === 'knowledge-base' }" @click="selectTab('knowledge-base')">Knowledge Base</button>
    </div>
    <section v-if="activeTab === 'clockify'" class="card import-panel" role="tabpanel">
      <textarea
        v-model="clockifyJson"
        rows="10"
        aria-label="Clockify JSON"
        placeholder="Paste Clockify export JSON here…"
      ></textarea>
      <div class="row-actions">
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
    <section v-else class="card import-panel" role="tabpanel">
      <p class="muted">Import a CSV previously downloaded from Settings. Existing records with the same IDs are skipped.</p>
      <label class="file-input">Choose CSV file
        <input type="file" accept=".csv,text/csv" @change="async (event) => { const file = (event.target as HTMLInputElement).files?.[0]; if (file) knowledgeBaseCsv = await file.text(); }" />
      </label>
      <textarea v-model="knowledgeBaseCsv" rows="10" aria-label="Knowledge Base CSV" placeholder="Paste a Knowledge Base export CSV here…"></textarea>
      <div class="row-actions">
        <button class="primary" type="button" :disabled="!knowledgeBaseCsv.trim() || importingKnowledgeBase" @click="importKnowledgeBase">{{ importingKnowledgeBase ? "Importing…" : "Import Knowledge Base data" }}</button>
        <span v-if="importSummary" class="muted" role="status">{{ importSummary }}</span>
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

<style scoped>
.import-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--workspace-border); margin-bottom: 8px; }
.import-tabs button { min-height: 44px; padding: 8px 14px; border-bottom: 2px solid transparent; }
.import-tabs button.selected { border-bottom-color: var(--workspace-accent); font-weight: 700; }
.file-input { display: grid; gap: 6px; font-weight: 600; margin-bottom: 12px; }
</style>
