<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import { EditorContent } from "@tiptap/vue-3";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { api } from "../lib/api";
import { storeToRefs } from "pinia";
import {
  useNotesStore,
  type Note as StoreNote,
  type NoteLabel as StoreNoteLabel,
} from "../stores/notes";

type Note = StoreNote;
type NoteLabel = StoreNoteLabel;
type NotePage = {
  items: Note[];
  page: number;
  size: number;
  totalItems: number;
  totalPages: number;
};

const route = useRoute();
const router = useRouter();
const notesStore = useNotesStore();
const { notes, selected, existingLabels } = storeToRefs(notesStore);
const query = ref("");
const showArchived = ref(false);
const page = ref(0);
const size = ref(20);
const totalPages = ref(0);
const totalItems = ref(0);
const loading = ref(false);
const error = ref("");
const title = ref("");
const tagInput = ref("");
const tags = ref<string[]>([]);
const highlightedLabelIndex = ref(0);
const status = ref<"saved" | "saving" | "error">("saved");
const editorHost = ref<HTMLElement | null>(null);
const editor = shallowRef<Editor | null>(null);
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
  const selectedNames = new Set(
    tags.value.map((tag) => tag.toLocaleLowerCase()),
  );
  return existingLabels.value
    .filter(
      (label) =>
        !selectedNames.has(label.name.toLocaleLowerCase()) &&
        label.name.toLocaleLowerCase().includes(query),
    )
    .slice(0, 8);
});
watch(tagInput, () => {
  highlightedLabelIndex.value = 0;
});
const parseContent = (value?: string) => {
  if (!value) return defaultDocument;
  try {
    const parsed = JSON.parse(value);
    return parsed?.type === "doc"
      ? parsed
      : {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: value }] },
          ],
        };
  } catch {
    return {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: value }] },
      ],
    };
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
    if (document?.type === "doc") return "Empty note";
  } catch {
    // Older notes may contain plain text in contentText.
  }
  return raw.replace(/\s+/g, " ").trim().slice(0, 150) || "Empty note";
}
function isEmptyNote(note: Note) {
  const raw = note.contentText || note.content || "";
  try {
    const document = JSON.parse(raw);
    if (document?.type !== "doc") return !raw.trim();
    const collect = (value: unknown): string => {
      if (!value || typeof value !== "object") return "";
      const node = value as { text?: unknown; content?: unknown };
      return `${typeof node.text === "string" ? node.text : ""} ${Array.isArray(node.content) ? node.content.map(collect).join(" ") : ""}`;
    };
    return !collect(document).replace(/\s+/g, " ").trim();
  } catch {
    return !raw.trim();
  }
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}
async function loadNotes(force = false) {
  loading.value = true;
  error.value = "";
  try {
    const params = new URLSearchParams({
      page: String(page.value),
      size: String(size.value),
      archived: String(showArchived.value),
    });
    if (query.value.trim()) params.set("q", query.value.trim());
    const cacheKey = params.toString();
    const cached = !force && notesStore.cachedPage(cacheKey);
    if (cached) {
      notesStore.setPage(cacheKey, cached);
      totalPages.value = cached.totalPages;
      totalItems.value = cached.totalItems;
      return;
    }
    const result = await api<NotePage>(`/notes?${params}`);
    notesStore.setPage(cacheKey, result);
    totalPages.value = result.totalPages;
    totalItems.value = result.totalItems;
  } catch {
    error.value = "Unable to load notes.";
  } finally {
    loading.value = false;
  }
}
async function archiveNote(note: Note) {
  if (
    !window.confirm(
      `Move “${note.title}” to Archive? Archived notes are permanently deleted after 30 days.`,
    )
  )
    return;
  try {
    await api(`/notes/${note.id}`, { method: "DELETE" });
    notesStore.remove(note.id);
    notesStore.clearPages();
    await loadNotes();
  } catch {
    error.value = "Unable to archive note.";
  }
}
async function restoreNote(note: Note) {
  try {
    await api(`/notes/${note.id}/restore`, { method: "POST" });
    notesStore.clearPages();
    await loadNotes();
  } catch {
    error.value = "Unable to restore note.";
  }
}
function toggleArchive() {
  showArchived.value = !showArchived.value;
  page.value = 0;
  loadNotes();
}
function searchLater() {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    page.value = 0;
    loadNotes();
  }, 250);
}
async function newNote() {
  if (creating) return;
  creating = true;
  try {
    const created = await api<Note>("/notes", {
      method: "POST",
      body: JSON.stringify({
        title: "Untitled note",
        content: JSON.stringify(defaultDocument),
        contentText: "",
        tags: [],
      }),
    });
    notesStore.clearPages();
    notesStore.upsert(created);
    await router.push({ name: "note-editor", params: { id: created.id } });
  } catch {
    error.value = "Unable to create a note.";
  } finally {
    creating = false;
  }
}
function addTag() {
  const value = tagInput.value.trim().replace(/^#/, "");
  if (
    value &&
    !tags.value.some((tag) => tag.toLowerCase() === value.toLowerCase())
  )
    tags.value.push(value);
  tagInput.value = "";
  scheduleSave();
}
function chooseLabel(label: NoteLabel) {
  if (!tags.value.some((tag) => tag.toLowerCase() === label.name.toLowerCase()))
    tags.value.push(label.name);
  tagInput.value = "";
  scheduleSave();
}
function handleLabelKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229) return;
  if (event.key === "ArrowDown" && matchingLabels.value.length) {
    event.preventDefault();
    highlightedLabelIndex.value =
      (highlightedLabelIndex.value + 1) % matchingLabels.value.length;
  } else if (event.key === "ArrowUp" && matchingLabels.value.length) {
    event.preventDefault();
    highlightedLabelIndex.value =
      (highlightedLabelIndex.value - 1 + matchingLabels.value.length) %
      matchingLabels.value.length;
  } else if (event.key === "Enter") {
    event.preventDefault();
    if (matchingLabels.value.length && highlightedLabelIndex.value >= 0) {
      chooseLabel(matchingLabels.value[highlightedLabelIndex.value]);
    } else {
      addTag();
    }
  } else if (event.key === "Escape") {
    event.preventDefault();
    tagInput.value = "";
  }
}
function handleLabelBeforeInput(event: InputEvent) {
  if (
    event.inputType !== "insertLineBreak" &&
    event.inputType !== "insertParagraph"
  )
    return;
  event.preventDefault();
  addTag();
}
function removeTag(tag: string) {
  tags.value = tags.value.filter((value) => value !== tag);
  scheduleSave();
}
function scheduleSave() {
  status.value = "saving";
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 650);
}
async function save() {
  if (!selected.value || !editor.value) return;
  if (saveInFlight) {
    saveQueued = true;
    return;
  }
  saveInFlight = true;
  status.value = "saving";
  const snapshot = {
    title: title.value.trim() || "Untitled note",
    content: JSON.stringify(editor.value.getJSON()),
    contentText: editor.value.getText({ blockSeparator: "\n" }),
    tags: [...tags.value],
  };
  try {
    let saved: Note;
    try {
      saved = await api<Note>(`/notes/${selected.value.id}`, {
        method: "PUT",
        body: JSON.stringify({ ...snapshot, version: selected.value.version }),
      });
    } catch (cause) {
      if (!String(cause).includes("Note changed in another window"))
        throw cause;
      const latest = await api<Note>(`/notes/${selected.value.id}`);
      notesStore.setSelected(latest);
      saved = await api<Note>(`/notes/${selected.value.id}`, {
        method: "PUT",
        body: JSON.stringify({ ...snapshot, version: latest.version }),
      });
    }
    notesStore.upsert(saved);
    notesStore.clearPages();
    notesStore.setSelected(saved);
    const stillOnSnapshot =
      title.value.trim() === snapshot.title &&
      JSON.stringify(editor.value.getJSON()) === snapshot.content &&
      JSON.stringify(tags.value) === JSON.stringify(snapshot.tags);
    if (stillOnSnapshot) {
      title.value = saved.title;
      tags.value = saved.tags || [];
    }
    status.value = "saved";
  } catch {
    status.value = "error";
  } finally {
    saveInFlight = false;
    if (saveQueued) {
      saveQueued = false;
      scheduleSave();
    }
  }
}
function keepEditorVisible() {
  void nextTick(() => {
    if (document.activeElement?.closest(".rich-editor")) {
      editorHost.value
        ?.querySelector(".ProseMirror")
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  });
}
async function loadEditor() {
  const id = route.params.id;
  if (!id || typeof id !== "string") return;
  try {
    const fromList = await api<Note>(`/notes/${id}`);
    notesStore.upsert(fromList);
    notesStore.setSelected(fromList);
    title.value = fromList.title;
    tags.value = [...(fromList.tags || [])];
    try {
      notesStore.setLabels((await api<NoteLabel[]>("/notes/labels")) || []);
    } catch {
      notesStore.setLabels([]);
    }
    editor.value?.destroy();
    editor.value = new Editor({
      extensions: [StarterKit, TaskList, TaskItem.configure({ nested: true })],
      content: parseContent(fromList.content),
      editorProps: {
        attributes: {
          role: "textbox",
          "aria-label": "Note content",
          "aria-multiline": "true",
        },
      },
      onUpdate: scheduleSave,
      onFocus: keepEditorVisible,
    });
  } catch {
    error.value = "Unable to open this note.";
  }
}
async function closeEditor() {
  await router.push({ name: "notes" });
}
function previousPage() {
  if (page.value > 0) {
    page.value--;
    loadNotes();
  }
}
function nextPage() {
  if (page.value + 1 < totalPages.value) {
    page.value++;
    loadNotes();
  }
}
watch(query, searchLater);
watch(size, () => {
  page.value = 0;
  loadNotes();
});
watch(
  () => route.params.id,
  async () => {
    if (isEditor.value) {
      await nextTick();
      await loadEditor();
    } else {
      editor.value?.destroy();
      editor.value = null;
      notesStore.setSelected(null);
      await loadNotes();
    }
  },
);
function refreshVisibleList() {
  if (!isEditor.value && document.visibilityState === "visible")
    void loadNotes(true);
}
onMounted(async () => {
  window.visualViewport?.addEventListener("resize", keepEditorVisible);
  if (isEditor.value) {
    await nextTick();
    await loadEditor();
  } else {
    await loadNotes();
    refreshTimer = setInterval(refreshVisibleList, 15000);
    window.addEventListener("focus", refreshVisibleList);
  }
});
onBeforeUnmount(() => {
  window.visualViewport?.removeEventListener("resize", keepEditorVisible);
  if (saveTimer) clearTimeout(saveTimer);
  if (searchTimer) clearTimeout(searchTimer);
  if (refreshTimer) clearInterval(refreshTimer);
  window.removeEventListener("focus", refreshVisibleList);
  editor.value?.destroy();
});
</script>

<template>
  <section class="notes-page">
    <header class="notes-heading">
      <div>
        <p class="eyebrow">KNOWLEDGE BASE</p>
        <h1>{{ showArchived ? "Archived notes" : "Notes" }}</h1>
      </div>
      <button
        v-if="!showArchived"
        class="icon-button"
        aria-label="Create new note"
        title="Create new note"
        @click="newNote"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          aria-hidden="true"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </header>

    <p v-if="error" class="notes-error" role="alert">{{ error }}</p>
    <template v-if="!isEditor">
      <div class="notes-toolbar">
        <label class="search-field"
          ><span class="sr-only">Search notes</span
          ><input
            v-model="query"
            name="note-search"
            autocomplete="off"
            aria-label="Search notes"
            placeholder="Search title, body, or label…"
        /></label>
        <label class="size-field"
          ><span>Show</span
          ><select
            v-model="size"
            name="notes-per-page"
            aria-label="Notes per page"
          >
            <option :value="20">20</option>
            <option :value="50">50</option>
            <option :value="100">100</option>
          </select></label
        >
        <button class="flat-button" @click="toggleArchive">
          {{ showArchived ? "Active notes" : "Archive" }}
        </button>
      </div>
      <p v-if="!loading && !notes.length" class="notes-empty">
        {{
          query ? "No notes match your search." : "Your notes will appear here."
        }}
      </p>
      <div v-else class="note-list" aria-label="Notes">
        <div
          v-for="note in notes"
          :key="note.id"
          class="note-row"
          :class="{ archived: showArchived }"
        >
          <component
            :is="showArchived ? 'span' : 'RouterLink'"
            :to="{ name: 'note-editor', params: { id: note.id } }"
            class="note-row-main"
            ><strong>{{ note.title }}</strong
            ><span
              ><em v-if="isEmptyNote(note)">Empty note</em
              ><template v-else>{{ excerpt(note) }}</template></span
            ></component
          >
          <span class="note-row-meta"
            ><span class="note-tags"
              ><i v-for="tag in note.tags" :key="tag">{{ tag }}</i></span
            ><time
              :datetime="
                showArchived && note.deletedAt ? note.deletedAt : note.updatedAt
              "
              >{{
                showArchived && note.deletedAt
                  ? `Archived ${formatDate(note.deletedAt)}`
                  : formatDate(note.updatedAt)
              }}</time
            ><span
              ><button
                v-if="showArchived"
                class="flat-button"
                @click.stop="restoreNote(note)"
              >
                Restore</button
              ><button
                v-else
                class="flat-button danger"
                @click.stop="archiveNote(note)"
              >
                Archive
              </button></span
            ></span
          >
        </div>
      </div>
      <footer v-if="totalPages > 1 || totalItems" class="notes-pagination">
        <span>{{ totalItems }} note{{ totalItems === 1 ? "" : "s" }}</span>
        <div>
          <button
            class="flat-button"
            :disabled="page === 0"
            @click="previousPage"
          >
            Previous</button
          ><span>Page {{ page + 1 }} of {{ Math.max(totalPages, 1) }}</span
          ><button
            class="flat-button"
            :disabled="page + 1 >= totalPages"
            @click="nextPage"
          >
            Next
          </button>
        </div>
      </footer>
    </template>

    <template v-else>
      <div class="editor-toolbar" aria-label="Formatting toolbar">
        <button
          class="flat-button"
          aria-label="Back to notes"
          @click="closeEditor"
        >
          ← Notes
        </button>
        <span role="status" class="save-state" :class="status">{{
          status === "saving"
            ? "Saving…"
            : status === "error"
              ? "Not saved"
              : "Saved"
        }}</span>
        <span class="toolbar-spacer"></span>
        <button
          class="flat-button"
          :disabled="!editor?.can().undo()"
          aria-label="Undo"
          @click="editor?.commands.undo()"
        >
          ↶</button
        ><button
          class="flat-button"
          :disabled="!editor?.can().redo()"
          aria-label="Redo"
          @click="editor?.commands.redo()"
        >
          ↷
        </button>
      </div>
      <div class="note-title-row">
        <input
          v-model="title"
          class="note-title-input"
          name="note-title"
          autocomplete="off"
          aria-label="Note title"
          maxlength="240"
          @input="scheduleSave"
        />
        <div class="tag-editor">
          <!-- prettier-ignore -->
          <span v-for="tag in tags" :key="tag" class="note-tag">{{ tag }}<button type="button" :aria-label="`Remove ${tag}`" @click="removeTag(tag)">×</button></span
          ><input
            v-model="tagInput"
            name="note-label"
            aria-label="Add label"
            placeholder="Add label and press Enter…"
            autocomplete="off"
            enterkeyhint="done"
            role="combobox"
            aria-autocomplete="list"
            :aria-expanded="matchingLabels.length > 0"
            aria-controls="note-label-suggestions"
            :aria-activedescendant="
              matchingLabels.length
                ? `note-label-suggestion-${matchingLabels[highlightedLabelIndex].id}`
                : undefined
            "
            @beforeinput="handleLabelBeforeInput"
            @keydown="handleLabelKeydown"
          />
          <div
            v-if="matchingLabels.length"
            id="note-label-suggestions"
            class="label-suggestions"
            role="listbox"
            aria-label="Matching existing labels"
          >
            <button
              v-for="(label, index) in matchingLabels"
              :id="`note-label-suggestion-${label.id}`"
              :key="label.id"
              type="button"
              role="option"
              class="label-suggestion"
              :class="{ active: index === highlightedLabelIndex }"
              :aria-selected="index === highlightedLabelIndex"
              @click="chooseLabel(label)"
            >
              {{ label.name }}
            </button>
          </div>
        </div>
      </div>
      <div ref="editorHost" class="rich-editor">
        <EditorContent v-if="editor" :editor="editor" />
      </div>
      <p v-if="selected" class="note-dates">
        Created {{ formatDate(selected.createdAt) }} · Updated
        {{ formatDate(selected.updatedAt) }}
      </p>
    </template>
  </section>
</template>

<style scoped>
.notes-page {
  max-width: 1200px;
  margin: 0 auto;
  color: var(--workspace-text);
}
.notes-heading,
.notes-toolbar,
.editor-toolbar,
.notes-pagination {
  display: flex;
  align-items: center;
  gap: 16px;
}
.notes-heading {
  justify-content: space-between;
  margin-bottom: 24px;
}
.notes-heading h1 {
  margin: 8px 0 0;
  font-size: 26px;
}
.icon-button {
  width: 46px;
  height: 46px;
  border: 0;
  border-radius: var(--workspace-radius);
  background: var(--workspace-accent);
  color: var(--workspace-on-accent);
  font-size: 28px;
  line-height: 1;
  cursor: pointer;
}
.notes-toolbar {
  margin-bottom: 16px;
}
.search-field {
  flex: 1;
}
.search-field input,
.size-field select,
.tag-editor input {
  width: 100%;
  border: 1px solid var(--workspace-control-border);
  background: var(--workspace-surface);
  padding: 9px 11px;
  font: inherit;
  border-radius: var(--workspace-radius);
}
.size-field {
  display: flex;
  gap: 8px;
  align-items: center;
  color: var(--workspace-muted);
  white-space: nowrap;
}
.size-field select {
  width: auto;
}
.note-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr));
  align-items: stretch;
  gap: 12px;
  padding-top: 8px;
}
.note-row {
  width: 100%;
  min-height: 184px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 20px;
  text-align: left;
  border: 1px solid var(--workspace-border);
  border-radius: 10px;
  padding: 18px;
  background: var(--workspace-surface);
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease,
    transform 160ms ease;
}
.note-row:hover,
.note-row:focus-within {
  background: var(--workspace-hover);
  border-color: var(--workspace-border);
  box-shadow: 0 5px 16px rgb(0 0 0 / 7%);
}
.note-row-main {
  min-width: 0;
  display: grid;
  align-content: start;
  gap: 8px;
}
.note-row-main strong {
  display: -webkit-box;
  overflow: hidden;
  font-size: 16px;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.note-row-main span {
  display: -webkit-box;
  overflow: hidden;
  color: var(--workspace-muted);
  line-height: 1.5;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}
.note-row-meta {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  justify-items: stretch;
  gap: 10px;
  color: var(--workspace-muted);
  font-size: 12px;
  white-space: nowrap;
}
.note-tags {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 5px;
}
.note-row-meta > .note-tags {
  grid-column: 1 / -1;
}
.note-row-meta > time {
  grid-column: 1;
  align-self: center;
  justify-self: start;
}
.note-row-meta > span:last-child {
  grid-column: 2;
  justify-self: end;
}
.note-tags i,
.note-tag {
  font-style: normal;
  color: var(--workspace-muted);
  background: var(--workspace-selected);
  padding: 4px 8px;
  font-size: 11px;
}
.notes-pagination {
  justify-content: space-between;
  padding: 18px 0;
  color: var(--workspace-muted);
  font-size: 13px;
}
.notes-pagination div {
  display: flex;
  align-items: center;
  gap: 10px;
}
.notes-empty,
.notes-error {
  padding: 30px 0;
  color: var(--workspace-muted);
}
.notes-error {
  color: var(--workspace-danger);
}
.editor-toolbar {
  border-bottom: 1px solid var(--workspace-border);
  padding: 0 0 12px;
}
.toolbar-spacer {
  flex: 1;
}
.save-state {
  color: var(--workspace-muted);
  font-size: 13px;
}
.save-state.error {
  color: var(--workspace-danger);
}
.note-title-input {
  width: 100%;
  border: 0;
  background: transparent;
  font: inherit;
  font-size: 26px;
  font-weight: 650;
  letter-spacing: -1px;
  padding: 22px 0 14px;
}
.tag-editor {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  align-items: center;
  border-bottom: 1px solid var(--workspace-border);
  padding: 0 0 14px;
}
.tag-editor input {
  border: 0;
  padding: 6px 0;
  width: 180px;
  flex: 1;
  min-width: 150px;
}
.note-tag button {
  min-width: 24px;
  min-height: 24px;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  padding: 0 0 0 5px;
}
.label-suggestions {
  position: absolute;
  z-index: 2;
  top: calc(100% - 8px);
  left: 0;
  min-width: 220px;
  max-width: min(360px, 100%);
  display: grid;
  padding: 5px;
  border: 1px solid var(--workspace-border);
  background: var(--workspace-surface);
}
.label-suggestion {
  border: 0;
  background: transparent;
  color: var(--workspace-muted);
  cursor: pointer;
  padding: 8px 10px;
  text-align: left;
  font: inherit;
}
.label-suggestion:hover,
.label-suggestion:focus-visible,
.label-suggestion.active {
  background: var(--workspace-selected);
}
.rich-editor {
  min-height: 420px;
  padding: 20px 0;
}
.rich-editor :deep(.ProseMirror) {
  min-height: 380px;
  line-height: 1.45;
}
.rich-editor :deep(h1),
.rich-editor :deep(h2),
.rich-editor :deep(h3) {
  letter-spacing: -1px;
}
.rich-editor :deep(ul[data-type="taskList"]) {
  list-style: none;
  padding-left: 0;
}
.rich-editor :deep(ul[data-type="taskList"] li) {
  display: flex;
  gap: 8px;
}
.rich-editor :deep(ul[data-type="taskList"] li > label) {
  margin-top: 5px;
}
.note-dates {
  color: var(--workspace-muted);
  font-size: 12px;
  border-top: 1px solid var(--workspace-border);
  padding-top: 12px;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
@media (max-width: 650px) {
  .notes-toolbar {
    align-items: stretch;
    flex-direction: column;
  }
  .note-row-meta {
    display: grid;
    align-items: center;
  }
  .notes-pagination {
    align-items: flex-start;
    flex-direction: column;
  }
  .notes-pagination div {
    width: 100%;
    justify-content: space-between;
  }
  .notes-heading {
    margin-bottom: 22px;
  }
}
.note-row-main {
  flex: 1;
  color: inherit;
  text-decoration: none;
}
.note-tag {
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
}
.icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.note-row-main:hover strong {
  text-decoration: underline;
}
.note-row-meta {
  min-width: 0;
  max-width: 45%;
  white-space: normal;
}
.note-tags i {
  overflow-wrap: anywhere;
}
.icon-button:hover {
  background: var(--workspace-accent-hover);
}
.rich-editor :deep(pre) {
  overflow-x: auto;
  padding: 12px;
  background: var(--workspace-selected);
  border-radius: var(--workspace-radius);
}
.rich-editor :deep(blockquote) {
  border-left: 2px solid var(--workspace-control-border);
  margin-inline: 0;
  padding-left: 16px;
  color: var(--workspace-muted);
}
.note-title-row {
  display: flex;
  align-items: center;
  gap: 18px;
  border-bottom: 1px solid var(--workspace-border);
}
.note-title-row .note-title-input {
  min-width: 0;
  flex: 1;
  padding-bottom: 14px;
}
.note-title-row .tag-editor {
  flex: 0 1 42%;
  border-bottom: 0;
  padding-bottom: 0;
}
.rich-editor :deep(.ProseMirror) {
  scroll-margin-bottom: 180px;
}
.rich-editor :deep(.ProseMirror p) {
  margin: 0 0 8px;
}
@media (max-width: 700px) {
  .note-tag button {
    min-width: 44px;
    min-height: 44px;
  }
  .note-row-meta {
    max-width: 100%;
  }
  .note-row {
    min-height: 168px;
    padding: 16px;
  }
}
@media (max-width: 700px) {
  .note-title-row {
    align-items: stretch;
    flex-direction: column;
    gap: 0;
  }
  .note-title-row .tag-editor {
    flex-basis: auto;
    padding-bottom: 10px;
  }
  .floating-tracker-panel {
    max-height: calc(100dvh - 24px);
    overflow-y: auto;
    overscroll-behavior: contain;
  }
}
@media (prefers-reduced-motion: reduce) {
  .note-row {
    transition: none;
  }
}
</style>
