<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { EditorContent } from "@tiptap/vue-3";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { api } from "../lib/api";

type Note = {
  id: string;
  title: string;
  content: string;
  contentText?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  version: number;
  tags: string[];
};
type NoteLabel = { id: string; name: string };
type NotePage = { items: Note[]; page: number; size: number; totalItems: number; totalPages: number };

const route = useRoute();
const router = useRouter();
const notes = ref<Note[]>([]);
const query = ref("");
const showArchived = ref(false);
const page = ref(0);
const size = ref(20);
const totalPages = ref(0);
const totalItems = ref(0);
const loading = ref(false);
const error = ref("");
const selected = ref<Note | null>(null);
const title = ref("");
const tagInput = ref("");
const tags = ref<string[]>([]);
const existingLabels = ref<NoteLabel[]>([]);
const status = ref<"saved" | "saving" | "error">("saved");
const editorHost = ref<HTMLElement | null>(null);
let editor: Editor | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let searchTimer: ReturnType<typeof setTimeout> | null = null;
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let creating = false;
let saveInFlight = false;
let saveQueued = false;

const isEditor = computed(() => route.name === "note-editor");
const defaultDocument = { type: "doc", content: [{ type: "paragraph" }] };
const matchingLabels = computed(() => {
  const query = tagInput.value.trim().toLocaleLowerCase();
  if (!query) return [];
  const selectedNames = new Set(tags.value.map(tag => tag.toLocaleLowerCase()));
  return existingLabels.value
    .filter(label => !selectedNames.has(label.name.toLocaleLowerCase()) && label.name.toLocaleLowerCase().includes(query))
    .slice(0, 8);
});
const parseContent = (value?: string) => {
  if (!value) return defaultDocument;
  try {
    const parsed = JSON.parse(value);
    return parsed?.type === "doc" ? parsed : { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: value }] }] };
  } catch {
    return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: value }] }] };
  }
};

function excerpt(note: Note) {
  const raw = note.contentText || note.content || "";
  try {
    const document = JSON.parse(raw);
    const collect = (value: unknown): string => {
      if (!value || typeof value !== "object") return "";
      const node = value as { text?: unknown; content?: unknown };
      return `${typeof node.text === "string" ? node.text : ""} ${Array.isArray(node.content) ? node.content.map(collect).join(" ") : ""}`;
    };
    const text = collect(document).replace(/\s+/g, " ").trim();
    if (text) return text.slice(0, 150);
  } catch {
    // Older notes may contain plain text in contentText.
  }
  return raw.replace(/\s+/g, " ").trim().slice(0, 150) || "Empty note";
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}
async function loadNotes() {
  loading.value = true;
  error.value = "";
  try {
    const params = new URLSearchParams({ page: String(page.value), size: String(size.value), archived: String(showArchived.value) });
    if (query.value.trim()) params.set("q", query.value.trim());
    const result = await api<NotePage>(`/notes?${params}`);
    notes.value = result.items;
    totalPages.value = result.totalPages;
    totalItems.value = result.totalItems;
  } catch {
    error.value = "Unable to load notes.";
  } finally {
    loading.value = false;
  }
}
async function archiveNote(note: Note) {
  if (!window.confirm(`Move “${note.title}” to Archive? Archived notes are permanently deleted after 30 days.`)) return;
  try {
    await api(`/notes/${note.id}`, { method: "DELETE" });
    await loadNotes();
  } catch { error.value = "Unable to archive note."; }
}
async function restoreNote(note: Note) {
  try {
    await api(`/notes/${note.id}/restore`, { method: "POST" });
    await loadNotes();
  } catch { error.value = "Unable to restore note."; }
}
function toggleArchive() { showArchived.value = !showArchived.value; page.value = 0; loadNotes(); }
function searchLater() {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { page.value = 0; loadNotes(); }, 250);
}
async function newNote() {
  if (creating) return;
  creating = true;
  try {
    const created = await api<Note>("/notes", {
      method: "POST",
      body: JSON.stringify({ title: "Untitled note", content: JSON.stringify(defaultDocument), contentText: "", tags: [] }),
    });
    await router.push({ name: "note-editor", params: { id: created.id } });
  } catch {
    error.value = "Unable to create a note.";
  } finally { creating = false; }
}
async function openNote(note: Note) { await router.push({ name: "note-editor", params: { id: note.id } }); }
function addTag() {
  const value = tagInput.value.trim().replace(/^#/, "");
  if (value && !tags.value.some(tag => tag.toLowerCase() === value.toLowerCase())) tags.value.push(value);
  tagInput.value = "";
  scheduleSave();
}
function chooseLabel(label: NoteLabel) {
  if (!tags.value.some(tag => tag.toLowerCase() === label.name.toLowerCase())) tags.value.push(label.name);
  tagInput.value = "";
  scheduleSave();
}
function removeTag(tag: string) { tags.value = tags.value.filter(value => value !== tag); scheduleSave(); }
function scheduleSave() {
  status.value = "saving";
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 650);
}
async function save() {
  if (!selected.value || !editor) return;
  if (saveInFlight) { saveQueued = true; return; }
  saveInFlight = true;
  status.value = "saving";
  const snapshot = {
    title: title.value.trim() || "Untitled note",
    content: JSON.stringify(editor.getJSON()),
    contentText: editor.getText({ blockSeparator: "\n" }),
    tags: [...tags.value],
  };
  try {
    let saved: Note;
    try {
      saved = await api<Note>(`/notes/${selected.value.id}`, { method: "PUT", body: JSON.stringify({ ...snapshot, version: selected.value.version }) });
    } catch (cause) {
      if (!String(cause).includes("Note changed in another window")) throw cause;
      const latest = await api<Note>(`/notes/${selected.value.id}`);
      selected.value = latest;
      saved = await api<Note>(`/notes/${selected.value.id}`, { method: "PUT", body: JSON.stringify({ ...snapshot, version: latest.version }) });
    }
    selected.value = saved;
    const stillOnSnapshot = title.value.trim() === snapshot.title
      && JSON.stringify(editor.getJSON()) === snapshot.content
      && JSON.stringify(tags.value) === JSON.stringify(snapshot.tags);
    if (stillOnSnapshot) {
      title.value = saved.title;
      tags.value = saved.tags || [];
    }
    status.value = "saved";
  } catch {
    status.value = "error";
  } finally {
    saveInFlight = false;
    if (saveQueued) { saveQueued = false; scheduleSave(); }
  }
}
async function loadEditor() {
  const id = route.params.id;
  if (!id || typeof id !== "string") return;
  try {
    const fromList = await api<Note>(`/notes/${id}`);
    selected.value = fromList;
    title.value = fromList.title;
    tags.value = [...(fromList.tags || [])];
    try {
      existingLabels.value = (await api<NoteLabel[]>("/notes/labels")) || [];
    } catch {
      existingLabels.value = [];
    }
    editor?.destroy();
    editor = new Editor({
      extensions: [StarterKit, TaskList, TaskItem.configure({ nested: true })],
      content: parseContent(fromList.content),
      onUpdate: scheduleSave,
    });
  } catch { error.value = "Unable to open this note."; }
}
async function closeEditor() { await router.push({ name: "notes" }); }
function previousPage() { if (page.value > 0) { page.value--; loadNotes(); } }
function nextPage() { if (page.value + 1 < totalPages.value) { page.value++; loadNotes(); } }
watch(query, searchLater);
watch(size, () => { page.value = 0; loadNotes(); });
watch(() => route.params.id, async () => { if (isEditor.value) { await nextTick(); await loadEditor(); } else { editor?.destroy(); editor = null; selected.value = null; await loadNotes(); } });
function refreshVisibleList() {
  if (!isEditor.value && document.visibilityState === "visible") void loadNotes();
}
onMounted(async () => {
  if (isEditor.value) { await nextTick(); await loadEditor(); }
  else {
    await loadNotes();
    refreshTimer = setInterval(refreshVisibleList, 15000);
    window.addEventListener("focus", refreshVisibleList);
  }
});
onBeforeUnmount(() => {
  if (saveTimer) clearTimeout(saveTimer);
  if (searchTimer) clearTimeout(searchTimer);
  if (refreshTimer) clearInterval(refreshTimer);
  window.removeEventListener("focus", refreshVisibleList);
  editor?.destroy();
});
</script>

<template>
  <section class="notes-page">
    <header class="notes-heading">
      <div><p class="eyebrow">KNOWLEDGE BASE</p><h1>{{ showArchived ? "Archived notes" : "Notes" }}</h1></div>
      <button v-if="!showArchived" class="icon-button" aria-label="Create new note" title="Create new note" @click="newNote">＋</button>
    </header>

    <template v-if="!isEditor">
      <div class="notes-toolbar">
        <label class="search-field"><span class="sr-only">Search notes</span><input v-model="query" aria-label="Search notes" placeholder="Search title or body" /></label>
        <label class="size-field"><span>Show</span><select v-model="size" aria-label="Notes per page"><option :value="20">20</option><option :value="50">50</option><option :value="100">100</option></select></label>
        <button class="flat-button" @click="toggleArchive">{{ showArchived ? "Active notes" : "Archive" }}</button>
      </div>
      <p v-if="error" class="notes-error" role="alert">{{ error }}</p>
      <p v-if="!loading && !notes.length" class="notes-empty">{{ query ? "No notes match your search." : "Your notes will appear here." }}</p>
      <div v-else class="note-list" aria-label="Notes">
        <div v-for="note in notes" :key="note.id" class="note-row" :class="{ archived: showArchived }" @click="!showArchived && openNote(note)">
          <span class="note-row-main"><strong>{{ note.title }}</strong><span>{{ excerpt(note) }}</span></span>
          <span class="note-row-meta"><span class="note-tags"><i v-for="tag in note.tags" :key="tag">{{ tag }}</i></span><time :datetime="showArchived && note.deletedAt ? note.deletedAt : note.updatedAt">{{ showArchived && note.deletedAt ? `Archived ${formatDate(note.deletedAt)}` : formatDate(note.updatedAt) }}</time><span><button v-if="showArchived" class="flat-button" @click.stop="restoreNote(note)">Restore</button><button v-else class="flat-button danger" @click.stop="archiveNote(note)">Archive</button></span></span>
        </div>
      </div>
      <footer v-if="totalPages > 1 || totalItems" class="notes-pagination">
        <span>{{ totalItems }} note{{ totalItems === 1 ? "" : "s" }}</span><div><button class="flat-button" :disabled="page === 0" @click="previousPage">Previous</button><span>Page {{ page + 1 }} of {{ Math.max(totalPages, 1) }}</span><button class="flat-button" :disabled="page + 1 >= totalPages" @click="nextPage">Next</button></div>
      </footer>
    </template>

    <template v-else>
      <div class="editor-toolbar" aria-label="Formatting toolbar">
        <button class="flat-button" aria-label="Back to notes" @click="closeEditor">← Notes</button>
        <span class="save-state" :class="status">{{ status === "saving" ? "Saving…" : status === "error" ? "Not saved" : "Saved" }}</span>
        <span class="toolbar-spacer"></span>
        <button class="flat-button" :disabled="!editor?.can().undo()" aria-label="Undo" @click="editor?.commands.undo()">↶</button><button class="flat-button" :disabled="!editor?.can().redo()" aria-label="Redo" @click="editor?.commands.redo()">↷</button>
      </div>
      <input v-model="title" class="note-title-input" aria-label="Note title" maxlength="240" @input="scheduleSave" />
      <div class="tag-editor"><span v-for="tag in tags" :key="tag" class="note-tag">{{ tag }}<button type="button" :aria-label="`Remove ${tag}`" @click="removeTag(tag)">×</button></span><input v-model="tagInput" aria-label="Add label" placeholder="Add label and press Enter" autocomplete="off" role="combobox" aria-autocomplete="list" :aria-expanded="matchingLabels.length > 0" aria-controls="note-label-suggestions" @keydown.enter.prevent="addTag" @keydown.escape="tagInput = ''" /><div v-if="matchingLabels.length" id="note-label-suggestions" class="label-suggestions" role="listbox" aria-label="Matching existing labels"><button v-for="label in matchingLabels" :key="label.id" type="button" role="option" class="label-suggestion" @click="chooseLabel(label)">{{ label.name }}</button></div></div>
      <div ref="editorHost" class="rich-editor"><EditorContent v-if="editor" :editor="editor" /></div>
      <p v-if="selected" class="note-dates">Created {{ formatDate(selected.createdAt) }} · Updated {{ formatDate(selected.updatedAt) }}</p>
    </template>
  </section>
</template>

<style scoped>
.notes-page { max-width: 900px; margin: 0 auto; color: #1e2926; }
.notes-heading, .notes-toolbar, .editor-toolbar, .notes-pagination { display: flex; align-items: center; gap: 16px; }
.notes-heading { justify-content: space-between; margin-bottom: 30px; }
.notes-heading h1 { margin: 8px 0 0; font-size: clamp(32px, 6vw, 48px); }
.icon-button { width: 46px; height: 46px; border: 0; border-radius: 50%; background: #e8754e; color: white; font-size: 28px; line-height: 1; cursor: pointer; }
.notes-toolbar { margin-bottom: 16px; }
.search-field { flex: 1; }.search-field input, .size-field select, .tag-editor input { width: 100%; border: 1px solid #dbe2da; background: #fff; padding: 12px 14px; font: inherit; border-radius: 0; }.size-field { display:flex; gap: 8px; align-items:center; color:#75827c; white-space:nowrap; }.size-field select { width:auto; }
.note-list { border-top: 1px solid #dbe2da; }.note-row { width: 100%; display:flex; justify-content:space-between; gap:20px; text-align:left; border:0; border-bottom:1px solid #dbe2da; padding:18px 0; background:transparent; cursor:pointer; }.note-row:hover { background:#fff; }.note-row-main { min-width:0; display:grid; gap:7px; }.note-row-main strong { font-size:18px; }.note-row-main span { color:#75827c; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }.note-row-meta { display:grid; justify-items:end; gap:8px; color:#75827c; font-size:12px; white-space:nowrap; }.note-tags { display:flex; gap:5px; }.note-tags i, .note-tag { font-style:normal; color:#497d6b; background:#e7f0e9; padding:4px 8px; font-size:11px; }.notes-pagination { justify-content:space-between; padding:18px 0; color:#75827c; font-size:13px; }.notes-pagination div { display:flex; align-items:center; gap:10px; }.flat-button { border:0; background:transparent; color:#497d6b; padding:8px; cursor:pointer; }.flat-button:disabled { opacity:.35; cursor:default; }.notes-empty, .notes-error { padding:30px 0; color:#75827c; }.notes-error { color:#a64f32; }
.editor-toolbar { border-bottom:1px solid #dbe2da; padding:0 0 12px; }.toolbar-spacer { flex:1; }.save-state { color:#75827c; font-size:13px; }.save-state.error { color:#a64f32; }.note-title-input { width:100%; border:0; outline:0; background:transparent; font:inherit; font-size:clamp(26px, 5vw, 40px); font-weight:800; letter-spacing:-1px; padding:22px 0 14px; }.tag-editor { position:relative; display:flex; flex-wrap:wrap; gap:7px; align-items:center; border-bottom:1px solid #dbe2da; padding:0 0 14px; }.tag-editor input { border:0; padding:6px 0; width:180px; flex:1; min-width:150px; }.note-tag button { border:0; background:transparent; color:inherit; cursor:pointer; padding:0 0 0 5px; }.label-suggestions { position:absolute; z-index:2; top:calc(100% - 8px); left:0; min-width:220px; max-width:min(360px, 100%); display:grid; padding:5px; border:1px solid #dbe2da; background:#fff; box-shadow:0 8px 20px rgba(40, 55, 48, .12); }.label-suggestion { border:0; background:transparent; color:#497d6b; cursor:pointer; padding:8px 10px; text-align:left; font:inherit; }.label-suggestion:hover, .label-suggestion:focus-visible { background:#e7f0e9; outline:0; }.rich-editor { min-height:420px; padding:20px 0; }.rich-editor :deep(.ProseMirror) { min-height:380px; outline:0; line-height:1.45; }.rich-editor :deep(h1), .rich-editor :deep(h2), .rich-editor :deep(h3) { letter-spacing:-1px; }.rich-editor :deep(ul[data-type="taskList"]) { list-style:none; padding-left:0; }.rich-editor :deep(ul[data-type="taskList"] li) { display:flex; gap:8px; }.rich-editor :deep(ul[data-type="taskList"] li > label) { margin-top:5px; }.note-dates { color:#75827c; font-size:12px; border-top:1px solid #dbe2da; padding-top:12px; }.sr-only { position:absolute; width:1px; height:1px; padding:0; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
@media(max-width:650px) { .notes-toolbar { align-items:stretch; flex-direction:column; }.note-row { display:grid; }.note-row-meta { display:flex; justify-content:space-between; align-items:center; }.notes-pagination { align-items:flex-start; flex-direction:column; }.notes-pagination div { width:100%; justify-content:space-between; }.notes-heading { margin-bottom:22px; } }
</style>
