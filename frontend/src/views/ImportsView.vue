<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { api } from "../lib/api";
import { formatDateTime } from "../lib/date";
import ErrorNotice from "../components/ErrorNotice.vue";
import { useReportsStore } from "../stores/reports";
import { useSessionsStore } from "../stores/sessions";

const props = defineProps<{ knowledgeBaseOnly?: boolean; embedded?: boolean }>();
const HISTORY_PAGE_SIZE = 5;
const reportsStore = useReportsStore();
const sessionsStore = useSessionsStore();

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
  activeTab = ref<"clockify" | "knowledge-base">(props.knowledgeBaseOnly ? "knowledge-base" : "clockify"),
  importingKnowledgeBase = ref(false),
  importSummary = ref(""),
  error = ref(""),
  errorDetails = ref(""),
  batches = ref<ImportBatch[]>([]),
  historyPage = ref(1);
const visibleBatches = computed(() => batches.value.slice((historyPage.value - 1) * HISTORY_PAGE_SIZE, historyPage.value * HISTORY_PAGE_SIZE));
const totalHistoryPages = computed(() => Math.max(1, Math.ceil(batches.value.length / HISTORY_PAGE_SIZE)));
const formatDate = (iso: string) => formatDateTime(iso);
function invalidateActivityCaches() {
  sessionsStore.clearPages();
  reportsStore.clear();
}
function showError(message: string, cause?: unknown) {
  error.value = message;
  errorDetails.value = cause && typeof cause === "object" && "details" in cause
    ? String(cause.details || "")
    : "";
}

async function load() {
  try {
    const source = activeTab.value === "knowledge-base" ? "knowledge-base" : "clockify";
    batches.value = await api<ImportBatch[]>(`/imports/${source}/batches`);
    historyPage.value = Math.min(historyPage.value, totalHistoryPages.value);
  } catch {
    showError("Unable to load import batches.");
  }
}
async function selectTab(tab: "clockify" | "knowledge-base") {
  activeTab.value = tab;
  historyPage.value = 1;
  await load();
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
    invalidateActivityCaches();
    await load();
  } catch (cause) {
    showError(
      cause instanceof SyntaxError
        ? "Paste valid Clockify JSON."
        : cause instanceof Error
          ? cause.message
          : "Could not import Clockify data.",
      cause,
    );
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
    invalidateActivityCaches();
    await load();
  } catch (cause) {
    showError("Could not import Knowledge Base data.", cause);
  }
  finally { importingKnowledgeBase.value = false; }
}
async function undo(batch: ImportBatch) {
  const sourceLabel = batch.source === "KNOWLEDGE_BASE" ? "Knowledge Base" : "Clockify";
  if (!confirm(`Undo ${sourceLabel} import from ${formatDate(batch.createdAt)}?`))
    return;
  try {
    const result = await api<{
      deletedEntries: number;
      deletedActivities: number;
      deletedPaths?: number;
    }>(`/imports/${batch.source === "KNOWLEDGE_BASE" ? "knowledge-base" : "clockify"}/batches/${batch.id}`, { method: "DELETE" });
    importSummary.value = `Removed ${result.deletedEntries} imported sessions, ${result.deletedActivities} timeline records, and ${result.deletedPaths ?? 0} paths.`;
    invalidateActivityCaches();
    await load();
  } catch {
    showError("Could not undo this import batch.");
  }
}
onMounted(load);
</script>

<template>
  <section>
    <p v-if="!props.embedded" class="eyebrow">CLOCKIFY IMPORTS</p>
    <h1 v-if="!props.embedded">Imports</h1>
    <p v-if="!props.embedded" class="lede">
      Import completed Clockify sessions and undo a whole imported batch when
      needed.
    </p>
    <div v-if="!props.knowledgeBaseOnly" class="import-tabs" role="tablist" aria-label="Import source">
      <button id="imports-tab-clockify" type="button" role="tab" aria-controls="imports-panel-clockify" :aria-selected="activeTab === 'clockify'" :class="{ selected: activeTab === 'clockify' }" @click="selectTab('clockify')">Clockify</button>
      <button id="imports-tab-knowledge-base" type="button" role="tab" aria-controls="imports-panel-knowledge-base" :aria-selected="activeTab === 'knowledge-base'" :class="{ selected: activeTab === 'knowledge-base' }" @click="selectTab('knowledge-base')">Knowledge Base</button>
    </div>
    <section v-if="activeTab === 'clockify' && !props.knowledgeBaseOnly" id="imports-panel-clockify" class="card import-panel" role="tabpanel" aria-labelledby="imports-tab-clockify" tabindex="0">
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
    <section v-else id="imports-panel-knowledge-base" class="card import-panel" role="tabpanel" aria-labelledby="imports-tab-knowledge-base" tabindex="0">
      <p class="muted">Import a CSV previously downloaded from Settings. Path and label colors, scopes, and assignments are restored. Existing records and conflicting records are skipped.</p>
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
      <div v-for="batch in visibleBatches" :key="batch.id" class="history-row">
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
      <div v-if="totalHistoryPages > 1" class="history-pagination" aria-label="Import history pagination">
        <button type="button" :disabled="historyPage === 1" @click="historyPage--">Previous</button>
        <span class="muted">Page {{ historyPage }} of {{ totalHistoryPages }}</span>
        <button type="button" :disabled="historyPage === totalHistoryPages" @click="historyPage++">Next</button>
      </div>
      <p v-if="!batches.length" class="muted">No {{ props.knowledgeBaseOnly ? "Knowledge Base" : activeTab === "clockify" ? "Clockify" : "Knowledge Base" }} imports yet.</p>
    </section>
    <ErrorNotice v-if="error" :message="error" :details="errorDetails" />
  </section>
</template>

<style scoped>
.import-tabs { display: inline-flex; gap: 2px; margin-bottom: 16px; padding: 3px; border: 1px solid var(--workspace-border); border-radius: var(--workspace-radius); background: var(--workspace-selected); }
.import-tabs button { min-height: 36px; padding: 7px 14px; border: 1px solid transparent; border-radius: calc(var(--workspace-radius) - 1px); background: transparent; color: var(--workspace-muted); font-size: 12px; font-weight: 650; }
.import-tabs button:hover { background: var(--workspace-hover); color: var(--workspace-strong); }
.import-tabs button.selected { border-color: var(--workspace-border); background: var(--workspace-surface); box-shadow: 0 1px 2px rgb(0 0 0 / 8%); color: var(--workspace-text); }
.file-input { display: grid; gap: 6px; font-weight: 600; margin-bottom: 12px; }
.history-pagination { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 12px; }
.history-pagination button { min-height: 40px; padding: 8px 12px; }
</style>
