<script setup lang="ts">
import type { Editor } from "@tiptap/core";
import {
  mdiChevronDown,
  mdiCodeBraces,
  mdiFormatBold,
  mdiFormatItalic,
  mdiFormatListBulleted,
  mdiFormatListChecks,
  mdiFormatListNumbered,
  mdiFormatQuoteOpen,
  mdiFormatStrikethrough,
  mdiFormatUnderline,
} from "@mdi/js";
import { computed, onBeforeUnmount, ref, toRaw, watch } from "vue";

// The formatting toolbar shared by note bodies and board card bodies. It is a
// WAI-ARIA toolbar: one Tab stop, with arrow keys, Home, and End moving focus.
const props = defineProps<{ editor: Editor }>();
// ProseMirror rejects transactions from a proxied editor, so always use the raw one.
const editor = computed(() => toRaw(props.editor));

// The editor is not reactive, so re-read its state after every transaction.
const revision = ref(0);
const bump = () => { revision.value += 1; };
watch(editor, (next, previous) => {
  previous?.off("transaction", bump);
  next.on("transaction", bump);
  bump();
}, { immediate: true });
onBeforeUnmount(() => editor.value.off("transaction", bump));

type Chain = ReturnType<Editor["chain"]>;
const styles = [
  { level: 0, label: "Normal text" },
  { level: 1, label: "Heading 1" },
  { level: 2, label: "Heading 2" },
  { level: 3, label: "Heading 3" },
] as const;
const groups: { name: string; icon: string; active: string; run: (chain: Chain) => Chain }[][] = [
  [
    { name: "Bold", icon: mdiFormatBold, active: "bold", run: (chain) => chain.toggleBold() },
    { name: "Italic", icon: mdiFormatItalic, active: "italic", run: (chain) => chain.toggleItalic() },
    { name: "Underline", icon: mdiFormatUnderline, active: "underline", run: (chain) => chain.toggleUnderline() },
    { name: "Strikethrough", icon: mdiFormatStrikethrough, active: "strike", run: (chain) => chain.toggleStrike() },
  ],
  [
    { name: "Bullet list", icon: mdiFormatListBulleted, active: "bulletList", run: (chain) => chain.toggleBulletList() },
    { name: "Numbered list", icon: mdiFormatListNumbered, active: "orderedList", run: (chain) => chain.toggleOrderedList() },
    { name: "Checklist", icon: mdiFormatListChecks, active: "taskList", run: (chain) => chain.toggleTaskList() },
  ],
  [
    { name: "Quote", icon: mdiFormatQuoteOpen, active: "blockquote", run: (chain) => chain.toggleBlockquote() },
    { name: "Code block", icon: mdiCodeBraces, active: "codeBlock", run: (chain) => chain.toggleCodeBlock() },
  ],
];

const isActive = (name: string) => { void revision.value; return editor.value.isActive(name); };
const currentStyle = computed(() => { void revision.value; return styles.find((style) => style.level && editor.value.isActive("heading", { level: style.level })) || styles[0]; });
const styleOpen = ref(false);
function applyStyle(level: number) {
  const chain = editor.value.chain().focus();
  (level ? chain.setHeading({ level: level as 1 | 2 | 3 }) : chain.setParagraph()).run();
  styleOpen.value = false;
}
function apply(run: (chain: Chain) => Chain) { run(editor.value.chain().focus()).run(); }

// Roving tab index: only the last focused control is in the Tab order.
const bar = ref<HTMLElement | null>(null);
const current = ref(0);
const indexOf = (group: number, item: number) => 1 + groups.slice(0, group).reduce((sum, list) => sum + list.length, 0) + item;
const controls = () => [...(bar.value?.querySelectorAll<HTMLButtonElement>("button") || [])];
function remember(event: FocusEvent) { const index = controls().indexOf(event.target as HTMLButtonElement); if (index >= 0) current.value = index; }
function move(event: KeyboardEvent) {
  const items = controls();
  if (!items.length) return;
  const from = Math.max(0, items.indexOf(document.activeElement as HTMLButtonElement));
  const next = { ArrowRight: from + 1, ArrowLeft: from - 1, Home: 0, End: items.length - 1 }[event.key];
  if (next === undefined) return;
  event.preventDefault();
  current.value = (next + items.length) % items.length;
  items[current.value].focus();
}
</script>

<template>
  <div class="rich-text-toolbar">
    <div ref="bar" class="rich-text-toolbar-row" role="toolbar" aria-label="Formatting" @keydown="move" @focusin="remember">
      <v-menu v-model="styleOpen" location="top start" content-class="rich-text-style-menu">
        <template #activator="{ props: menuProps }">
          <button v-bind="menuProps" class="rich-text-style" type="button" :aria-label="`Text style: ${currentStyle.label}`" :tabindex="current === 0 ? 0 : -1" @mousedown.prevent>
            <span class="rich-text-style-label">{{ currentStyle.label }}</span><v-icon :icon="mdiChevronDown" size="16" aria-hidden="true" />
          </button>
        </template>
        <div class="rich-text-style-list" role="menu" aria-label="Text style">
          <button v-for="style in styles" :key="style.level" type="button" role="menuitemradio" :aria-checked="currentStyle.level === style.level" :class="[`level-${style.level}`, { active: currentStyle.level === style.level }]" @mousedown.prevent @click="applyStyle(style.level)">{{ style.label }}</button>
        </div>
      </v-menu>
      <template v-for="(group, groupIndex) in groups" :key="groupIndex">
        <span class="rich-text-toolbar-divider" aria-hidden="true"></span>
        <button v-for="(action, itemIndex) in group" :key="action.name" class="rich-text-action" type="button" :aria-label="action.name" :title="action.name" :aria-pressed="isActive(action.active)" :tabindex="current === indexOf(groupIndex, itemIndex) ? 0 : -1" @mousedown.prevent @click="apply(action.run)">
          <v-icon :icon="action.icon" size="20" aria-hidden="true" />
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.rich-text-toolbar { flex:0 0 auto; border-top:1px solid var(--workspace-border); }
.rich-text-toolbar-row { display:flex; align-items:center; gap:2px; padding:4px; overflow-x:auto; overscroll-behavior-x:contain; scrollbar-width:thin; }
.rich-text-toolbar button { display:inline-flex; flex:0 0 auto; align-items:center; justify-content:center; min-width:32px; min-height:32px; padding:0 6px; border:0; border-radius:6px; background:transparent; color:var(--workspace-muted); font:inherit; font-size:.8rem; cursor:pointer; touch-action:manipulation; transition:background-color .15s ease, color .15s ease; }
.rich-text-toolbar button:hover { background:var(--workspace-selected); color:inherit; }
.rich-text-toolbar button:focus-visible { outline:2px solid #e8754e; outline-offset:-2px; }
.rich-text-toolbar button[aria-pressed="true"] { background:var(--workspace-selected); color:inherit; }
.rich-text-style { gap:2px; min-width:7.5rem !important; justify-content:space-between !important; }
.rich-text-style-label { white-space:nowrap; }
.rich-text-toolbar-divider { flex:0 0 1px; align-self:stretch; margin:6px 2px; background:var(--workspace-border); }
@media (pointer: coarse), (max-width: 700px) { .rich-text-toolbar button { min-width:44px; min-height:44px; } }
</style>

<style>
.rich-text-style-menu .rich-text-style-list { display:grid; min-width:10rem; padding:4px; border:1px solid var(--workspace-border); border-radius:8px; background:var(--workspace-surface); box-shadow:0 1px 2px #0001, 0 8px 24px #0002; }
.rich-text-style-menu button { min-height:36px; padding:0 10px; border:0; border-radius:6px; background:transparent; color:inherit; font:inherit; text-align:left; cursor:pointer; }
.rich-text-style-menu button:hover, .rich-text-style-menu button.active { background:var(--workspace-selected); }
.rich-text-style-menu button:focus-visible { outline:2px solid #e8754e; outline-offset:-2px; }
.rich-text-style-menu .level-1 { font-size:1.25rem; font-weight:700; } .rich-text-style-menu .level-2 { font-size:1.1rem; font-weight:700; } .rich-text-style-menu .level-3 { font-weight:700; }
@media (pointer: coarse) { .rich-text-style-menu button { min-height:44px; } }
</style>
