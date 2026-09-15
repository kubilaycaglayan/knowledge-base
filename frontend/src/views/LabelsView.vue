<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { api } from "../lib/api";
import { labelColors } from "../lib/label-colors";
import PromptDialog from "../components/PromptDialog.vue";
import ColorPalette from "../components/ColorPalette.vue";
import { vDialogFocus } from "../lib/dialog-focus";
import { useLabelsStore, type Label, type LabelScope } from "../stores/labels";
import { useReportsStore } from "../stores/reports";

type Scope = LabelScope;
const scopeOptions: { value: Scope; label: string }[] = [
  { value: "NOTE", label: "Notes" },
  { value: "CALENDAR", label: "Calendar" },
  { value: "TIME_ENTRY", label: "Sessions" },
  { value: "LOG", label: "Logs" },
];
const defaultScopes = (): Scope[] => scopeOptions.filter(option => option.value !== "CALENDAR").map(option => option.value);
const colors = labelColors;
const labelStore = useLabelsStore();
const reportsStore = useReportsStore();
const { labels, loading } = storeToRefs(labelStore);
const name = ref("");
const color = ref(colors[0]);
// The API stores where a label is available. The UI deliberately presents the
// inverse: checked scopes are places where the label should be hidden.
const scopes = ref<Scope[]>(defaultScopes());
const editingId = ref("");
const draft = ref<{ name: string; color: string; scopes: Scope[] } | null>(null);
const saving = ref(false);
const error = ref("");
const addDialogOpen = ref(false);
const promptDialog = ref<InstanceType<typeof PromptDialog> | null>(null);
const sortedLabels = computed(() => [...labels.value].sort((a, b) => a.name.localeCompare(b.name)));

async function load() {
  try { await labelStore.load(); }
  catch { error.value = "Could not load labels."; }
}
function checked(scope: Scope, selected: Scope[]) { return !selected.includes(scope); }
function toggleScope(selected: Scope[], scope: Scope) {
  const next = selected.includes(scope) ? selected.filter(value => value !== scope) : [...selected, scope];
  selected.splice(0, selected.length, ...next);
}
async function add() {
  if (!name.value.trim()) { error.value = "Enter a name."; return; }
  saving.value = true; error.value = "";
  try {
    const created = await api<Label>("/labels", { method: "POST", body: JSON.stringify({ name: name.value.trim(), color: color.value, scopes: scopes.value }) });
    labelStore.add(created); name.value = "";
    color.value = colors[0];
    scopes.value = defaultScopes();
    addDialogOpen.value = false;
    reportsStore.clear();
  } catch { error.value = "Could not create this label. Names must be unique."; }
  finally { saving.value = false; }
}
function openAddDialog() {
  error.value = "";
  name.value = "";
  color.value = colors[0];
  scopes.value = defaultScopes();
  addDialogOpen.value = true;
}
function closeAddDialog() {
  addDialogOpen.value = false;
  error.value = "";
}
function beginEdit(label: Label) {
  editingId.value = label.id;
  draft.value = { name: label.name, color: label.color || colors[0], scopes: [...label.scopes] };
}
function cancelEdit() { editingId.value = ""; draft.value = null; }
async function save(label: Label) {
  if (!draft.value?.name.trim()) { error.value = "Enter a name."; return; }
  saving.value = true; error.value = "";
  try {
    const saved = await api<Label>(`/labels/${label.id}`, { method: "PUT", body: JSON.stringify({ ...draft.value, name: draft.value.name.trim() }) });
    labelStore.replace(saved); reportsStore.clear(); cancelEdit();
  } catch { error.value = "Could not save this label. Remove assignments before removing a scope."; }
  finally { saving.value = false; }
}
async function remove(label: Label) {
  const result = await promptDialog.value!.open(`Remove “${label.name}”?`, "Labels in use must be unassigned first.", { confirmation: true });
  if (result === null) return;
  try {
    await api(`/labels/${label.id}`, { method: "DELETE" });
    labelStore.remove(label.id);
    reportsStore.clear();
  } catch {
    const assigned = await promptDialog.value!.open(
      `“${label.name}” has assignments. Remove the label and its assignments?`,
      "This keeps the assigned notes, sessions, and calendar days.",
      { confirmation: true },
    );
    if (assigned === null) return;
    try {
      await api(`/labels/${label.id}?removeAssignments=true`, { method: "DELETE" });
      labelStore.remove(label.id);
      reportsStore.clear();
    } catch { error.value = "Could not remove this label."; }
  }
}
onMounted(load);
</script>

<template>
  <PromptDialog ref="promptDialog" />
  <section class="labels-view">
    <header class="labels-heading">
      <div><p class="eyebrow">WORKSPACE</p><h1>Labels</h1></div>
      <button class="icon-button" type="button" aria-label="Add label" title="Add label" aria-haspopup="dialog" @click="openAddDialog"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></button>
    </header>
    <p class="lede">Create reusable labels and choose where they don’t appear. A label can be used in more than one place.</p>
    <p v-if="error && !addDialogOpen" class="notice" role="alert" aria-live="polite">{{ error }}</p>
    <section class="card label-list" aria-labelledby="label-list-title">
      <div class="label-list-heading"><h2 id="label-list-title">Your labels</h2><span class="muted">{{ labels.length }} total</span></div>
      <p v-if="loading" class="muted">Loading labels…</p>
      <p v-else-if="!sortedLabels.length" class="muted">No labels yet. Add one above to get started.</p>
      <div v-for="label in sortedLabels" v-else :key="label.id" class="label-row">
        <template v-if="editingId !== label.id"><span class="label-swatch" :style="{ backgroundColor: label.color || colors[0] }" aria-hidden="true"></span><strong>{{ label.name }}</strong><span class="scope-list">{{ label.scopes.map(scope => scopeOptions.find(option => option.value === scope)?.label).join(" · ") }}</span><button class="ghost" type="button" @click="beginEdit(label)">Edit</button><button class="ghost danger" type="button" @click="remove(label)">Remove</button></template>
        <template v-else-if="draft"><input v-model="draft.name" class="edit-name" maxlength="80" :aria-label="`Edit ${label.name} name`" /><ColorPalette v-model="draft.color" class="label-edit-colors" :legend="`Edit ${label.name} color`" option-label="Set edit label color" /><fieldset class="scope-editor"><legend>Don’t show in</legend><label v-for="option in scopeOptions" :key="option.value"><input type="checkbox" :checked="checked(option.value, draft.scopes)" @change="toggleScope(draft.scopes, option.value)" />{{ option.label }}</label></fieldset><button class="primary compact" type="button" :disabled="saving" @click="save(label)">Save</button><button class="ghost" type="button" @click="cancelEdit">Cancel</button></template>
      </div>
    </section>
    <div v-if="addDialogOpen" class="prompt-dialog-backdrop" @click.self="closeAddDialog">
      <section v-dialog-focus class="prompt-dialog card label-create-dialog" role="dialog" aria-modal="true" aria-labelledby="new-label-title" tabindex="-1" @keydown.esc.prevent="closeAddDialog">
        <div class="label-dialog-heading">
          <div><p class="eyebrow">NEW LABEL</p><h2 id="new-label-title">Add a label</h2></div>
        </div>
        <form class="label-create-form" @submit.prevent="add">
          <label>Name<input v-model="name" name="label-name" maxlength="80" placeholder="e.g. Deep work…" autocomplete="off" required /></label>
          <ColorPalette v-model="color" legend="Label color" option-label="Choose label color" />
          <fieldset class="scope-selector"><legend>Don’t show in</legend><label v-for="option in scopeOptions" :key="option.value" class="scope-option"><input type="checkbox" :checked="checked(option.value, scopes)" @change="toggleScope(scopes, option.value)" /><span>{{ option.label }}</span></label></fieldset>
          <p v-if="error" class="notice" role="alert" aria-live="polite">{{ error }}</p>
          <div class="prompt-dialog-actions">
            <button type="button" class="text-button" @click="closeAddDialog">Cancel</button>
            <button class="primary" type="submit" :disabled="saving">{{ saving ? "Adding…" : "Add label" }}</button>
          </div>
        </form>
      </section>
    </div>
  </section>
</template>

<style scoped>
.labels-view { max-width: 1200px; margin: 0 auto; display: grid; gap: 18px; }
.labels-view h1, .labels-view h2, .labels-view p { margin: 0; }
.labels-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.labels-heading h1 { margin: 8px 0 0; }
.icon-button { display: inline-flex; width: 46px; height: 46px; align-items: center; justify-content: center; border: 0; border-radius: var(--workspace-radius); background: var(--workspace-accent); color: var(--workspace-on-accent); cursor: pointer; }
.icon-button:hover { background: var(--workspace-accent-hover); }
.label-list { display: grid; gap: 16px; }
.label-create-dialog { width: min(560px, calc(100vw - 32px)); }
.label-dialog-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.label-dialog-heading h2 { margin: 3px 0 0; font-size: 20px; }
.label-create-form { display: grid; gap: 14px; margin-top: 4px; }
.label-create-form label, .scope-editor label { display: grid; gap: 6px; font-weight: 600; }
.label-create-form fieldset { display: grid; gap: 6px; border: 0; padding: 0; margin: 0; }
.label-create-form fieldset legend { font-weight: 600; margin-bottom: 2px; }
.label-create-form :deep(.color-palette), .label-list :deep(.color-palette) { display: grid; grid-template-columns: repeat(5, 28px); gap: 2px; width: max-content; }
.scope-option { display: grid !important; grid-template-columns: 18px 1fr; align-items: center; gap: 8px; width: max-content; min-height: 28px; font-weight: 400 !important; }
.scope-option input { margin: 0; }
.scope-option span { display: block; white-space: nowrap; }
.label-list-heading, .label-row { display: flex; align-items: center; gap: 12px; }
.label-list-heading { justify-content: space-between; }
.label-row { border-top: 1px solid var(--workspace-border); padding: 14px 0; min-width: 0; }
.label-row strong { min-width: 120px; overflow-wrap: anywhere; }
.label-swatch { width: 14px; height: 14px; border-radius: 50%; flex: none; }
.scope-list { color: var(--workspace-muted); flex: 1; min-width: 0; }
.system-label { color: var(--workspace-muted); font-size: 12px; white-space: nowrap; }
.danger { color: var(--workspace-danger); }
.edit-name { flex: 1; min-width: 120px; }
.scope-editor { display: flex; gap: 10px; flex-wrap: wrap; flex: 1; min-inline-size: 0; margin: 0; padding: 0; border: 0; }
.scope-editor legend { flex-basis: 100%; padding: 0; font-size: 12px; font-weight: 600; }
.scope-editor label { display: flex; align-items: center; gap: 5px; font-weight: 400; white-space: nowrap; }
.compact { padding: 8px 12px; }
@media (max-width: 760px) { .label-row { flex-wrap: wrap; } .scope-list { order: 4; flex-basis: 100%; } }
@media (max-width: 700px) { .label-create-form :deep(.color-palette), .label-list :deep(.color-palette) { grid-template-columns: repeat(5, 44px); } }
</style>
