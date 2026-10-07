<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from "vue";
import { api } from "../lib/api";
import { labelColors } from "../lib/label-colors";
import { defaultLabelScopes, useLabelsStore, type Label, type LabelScope } from "../stores/labels";

type PickerLabel = Pick<Label, "id" | "name"> & Partial<Pick<Label, "color" | "scopes">>;

const props = withDefaults(defineProps<{
  modelValue: string[];
  labels: PickerLabel[];
  label?: string;
  inputId?: string;
  density?: "compact" | "comfortable";
  createScopes?: LabelScope[];
  createColor?: string | null;
  disabled?: boolean;
  triggerMode?: "input" | "icon";
}>(), { density: "compact", triggerMode: "input" });
const emit = defineEmits<{ "update:modelValue": [value: string[]]; "label-created": [label: Label]; "open-change": [open: boolean] }>();
const labelsStore = useLabelsStore();
const listboxId = useId();
const inputId = computed(() => props.inputId || `${listboxId}-input`);
const root = ref<HTMLElement | null>(null);
const input = ref<HTMLInputElement | null>(null);
const menu = ref<HTMLElement | null>(null);
const query = ref("");
const open = ref(false);
const menuPosition = ref<Record<string, string>>({});
const activeIndex = ref(0);
const creating = ref(false);
const error = ref("");
const availableWidth = ref(0);
const chipWidths = ref<number[]>([]);
const moreWidth = ref(42);
const measureRow = ref<HTMLElement | null>(null);
let resizeObserver: ResizeObserver | undefined;

const selectedLabels = computed(() => props.modelValue
  .map((id) => props.labels.find((label) => label.id === id))
  .filter((label): label is Label => Boolean(label)));
const normalizedQuery = computed(() => query.value.trim().toLocaleLowerCase());
const matchingLabels = computed(() => {
  const search = normalizedQuery.value;
  if (!search) return [...props.labels].sort((a, b) => a.name.localeCompare(b.name));
  return props.labels
    .map((label, index) => {
      const name = label.name.toLocaleLowerCase();
      const at = name.indexOf(search);
      const rank = at === 0 ? 0 : at > 0 && /[\s_-]/.test(name[at - 1]) ? 1 : at >= 0 ? 2 : 3;
      return { label, rank, index };
    })
    .filter((entry) => entry.rank < 3)
    .sort((a, b) => a.rank - b.rank || a.label.name.localeCompare(b.label.name) || a.index - b.index)
    .map(({ label }) => label);
});
const dropdownLabels = computed(() => [
  ...selectedLabels.value,
  ...matchingLabels.value.filter((label) => !props.modelValue.includes(label.id)),
]);
const exactLabel = computed(() => props.labels.find((label) =>
  label.name.toLocaleLowerCase() === normalizedQuery.value));
const canCreate = computed(() => Boolean(normalizedQuery.value) && !exactLabel.value);
const visibleCount = computed(() => {
  const count = Math.min(selectedLabels.value.length, chipWidths.value.length);
  for (const includeCount of [true, false]) {
    for (let visible = count; visible >= 1; visible--) {
      const priorChips = chipWidths.value
        .slice(0, visible - 1)
        .reduce((sum, width, index) => sum + width + (index ? 6 : 0), 0);
      const hidden = selectedLabels.value.length - visible;
      const suffix = hidden && includeCount ? moreWidth.value + 6 : 0;
      const lastChipSpace = availableWidth.value - priorChips - (visible > 1 ? 6 : 0) - suffix;
      if (lastChipSpace >= 45) return visible;
    }
  }
  return 0;
});
const hiddenCount = computed(() => Math.max(0, selectedLabels.value.length - visibleCount.value));
const showHiddenCount = computed(() => {
  if (!hiddenCount.value || !visibleCount.value) return false;
  const priorChips = chipWidths.value
    .slice(0, visibleCount.value - 1)
    .reduce((sum, width, index) => sum + width + (index ? 6 : 0), 0);
  const lastChipSpace = availableWidth.value - priorChips - (visibleCount.value > 1 ? 6 : 0) - moreWidth.value - 6;
  return lastChipSpace >= 45;
});
const activeDescendant = computed(() => !open.value || activeIndex.value < 0
  ? undefined
  : activeIndex.value < dropdownLabels.value.length
    ? `${listboxId}-option-${activeIndex.value}`
    : canCreate.value ? `${listboxId}-option-create` : undefined);

async function openPicker() {
  if (props.disabled) return;
  query.value = "";
  open.value = true;
  await nextTick();
  positionMenu();
  await nextTick();
  input.value?.focus({ preventScroll: true });
}
function togglePicker() {
  if (props.disabled) return;
  if (open.value) {
    open.value = false;
    query.value = "";
  } else {
    openPicker();
  }
}
function chipMaxWidth(index: number) {
  if (index !== visibleCount.value - 1 || !chipWidths.value[index]) return undefined;
  const priorChips = chipWidths.value
    .slice(0, index)
    .reduce((sum, width, chipIndex) => sum + width + (chipIndex ? 6 : 0), 0);
  const suffixWidth = showHiddenCount.value ? moreWidth.value + 6 : 0;
  const maxWidth = availableWidth.value - priorChips - (index ? 6 : 0) - suffixWidth;
  return chipWidths.value[index] > maxWidth ? `${maxWidth}px` : undefined;
}

function toggleLabel(label: Label) {
  if (props.disabled) return;
  const selected = props.modelValue.includes(label.id);
  emit("update:modelValue", selected
    ? props.modelValue.filter((id) => id !== label.id)
    : [...props.modelValue, label.id]);
  error.value = "";
  input.value?.focus({ preventScroll: true });
}
function removeLabel(label: Label) {
  if (props.disabled) return;
  emit("update:modelValue", props.modelValue.filter((id) => id !== label.id));
  void nextTick(() => root.value?.querySelector<HTMLButtonElement>(".picker-chevron")?.focus({ preventScroll: true }));
}
async function createLabel() {
  const name = query.value.trim();
  if (!name || exactLabel.value || creating.value) return;
  creating.value = true;
  error.value = "";
  try {
    const created = await api<Label>("/labels", {
      method: "POST",
    body: JSON.stringify({ name, color: props.createColor ?? null, scopes: props.createScopes ?? defaultLabelScopes() }),
    });
    labelsStore.add({ ...created, scopes: created.scopes || defaultLabelScopes() });
    emit("label-created", created);
    emit("update:modelValue", [...new Set([...props.modelValue, created.id])]);
    query.value = "";
  } catch {
    error.value = "Could not create that label. Names must be unique.";
  } finally {
    creating.value = false;
  }
}
function onKeydown(event: KeyboardEvent) {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    open.value = true;
    activeIndex.value = Math.min(activeIndex.value + 1, dropdownLabels.value.length + (canCreate.value ? 1 : 0) - 1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    activeIndex.value = Math.max(0, activeIndex.value - 1);
  } else if (event.key === "Enter" && open.value) {
    event.preventDefault();
    if (canCreate.value && activeIndex.value === dropdownLabels.value.length) void createLabel();
    else if (dropdownLabels.value[activeIndex.value]) toggleLabel(dropdownLabels.value[activeIndex.value]);
  } else if (event.key === "Escape") {
    open.value = false;
    query.value = "";
    void nextTick(() => root.value?.querySelector<HTMLButtonElement>(".picker-chevron")?.focus({ preventScroll: true }));
  } else if (event.key === "Backspace" && !query.value && selectedLabels.value.length) {
    removeLabel(selectedLabels.value[selectedLabels.value.length - 1]);
  }
}
function segments(name: string) {
  const search = normalizedQuery.value;
  if (!search) return [{ text: name, match: false }];
  const index = name.toLocaleLowerCase().indexOf(search);
  if (index < 0) return [{ text: name, match: false }];
  return [
    ...(index ? [{ text: name.slice(0, index), match: false }] : []),
    { text: name.slice(index, index + search.length), match: true },
    ...(index + search.length < name.length ? [{ text: name.slice(index + search.length), match: false }] : []),
  ];
}
function measure() {
  if (!root.value) return;
  const control = root.value.querySelector<HTMLElement>(".label-picker-control");
  const chevronWidth = root.value.querySelector(".picker-chevron")?.getBoundingClientRect().width ?? 28;
  const style = control ? getComputedStyle(control) : null;
  const horizontalPadding = style ? parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) : 17;
  const horizontalBorder = style ? parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth) : 2;
  const gap = style ? parseFloat(style.columnGap || style.gap) : 6;
  availableWidth.value = Math.max(0, root.value.clientWidth - horizontalPadding - horizontalBorder - chevronWidth - gap);
  const chips = measureRow.value?.querySelectorAll<HTMLElement>("[data-measure-chip]") ?? [];
  chipWidths.value = Array.from(chips, (chip) => Math.ceil(chip.getBoundingClientRect().width));
  const more = measureRow.value?.querySelector<HTMLElement>("[data-measure-more]");
  if (more) moreWidth.value = Math.ceil(more.getBoundingClientRect().width);
}
function positionMenu() {
  const anchor = root.value?.getBoundingClientRect();
  if (!anchor || !open.value) return;
  const viewport = window.visualViewport;
  const styles = getComputedStyle(root.value);
  const marginX = Math.max(8, parseFloat(styles.getPropertyValue("--picker-safe-left")) || 0, parseFloat(styles.getPropertyValue("--picker-safe-right")) || 0);
  const marginY = Math.max(8, parseFloat(styles.getPropertyValue("--picker-safe-top")) || 0, parseFloat(styles.getPropertyValue("--picker-safe-bottom")) || 0);
  const viewportLeft = viewport?.offsetLeft ?? 0;
  const viewportTop = viewport?.offsetTop ?? 0;
  const viewportWidth = viewport?.width ?? document.documentElement.clientWidth;
  const viewportHeight = viewport?.height ?? window.innerHeight;
  const anchorLeft = anchor.left - viewportLeft;
  const anchorTop = anchor.top - viewportTop;
  const anchorBottom = anchor.bottom - viewportTop;
  const width = Math.max(0, Math.min(Math.max(anchor.width, props.triggerMode === "icon" ? 240 : 0), viewportWidth - marginX * 2));
  const left = Math.max(marginX, Math.min(anchorLeft, viewportWidth - width - marginX));
  const maxHeight = Math.max(120, viewportHeight - marginY * 2);
  const menuHeight = Math.min(menu.value?.getBoundingClientRect().height ?? 300, maxHeight);
  const below = viewportHeight - anchorBottom - 6 - marginY;
  const above = anchorTop - 6 - marginY;
  const placeAbove = below < menuHeight && above > below;
  const top = placeAbove
    ? Math.max(marginY, anchorTop - menuHeight - 6)
    : Math.min(anchorBottom + 6, viewportHeight - menuHeight - marginY);
  menuPosition.value = {
    position: "fixed",
    left: `${left}px`,
    top: `${Math.max(marginY, top)}px`,
    width: `${width}px`,
    maxHeight: `${maxHeight}px`,
  };
}
function repositionForVisualViewport() { positionMenu(); }
function outsideClick(event: PointerEvent) {
  const target = event.target as Node;
  if (!root.value?.contains(target) && !menu.value?.contains(target)) open.value = false;
}
watch(activeIndex, async (index) => {
  await nextTick();
  const option = document.getElementById(`${listboxId}-option-${index}`);
  if (option && menu.value?.contains(option)) option.scrollIntoView?.({ block: "nearest" });
});
watch([selectedLabels, open], async () => { await nextTick(); measure(); positionMenu(); }, { deep: true });
watch(open, (value) => emit("open-change", value));
watch([matchingLabels, canCreate, error], async () => { await nextTick(); positionMenu(); });
watch(dropdownLabels, () => { activeIndex.value = 0; });
onMounted(() => {
  if (root.value && typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => { measure(); positionMenu(); });
    resizeObserver.observe(root.value);
  }
  document.addEventListener("pointerdown", outsideClick);
  window.addEventListener("resize", positionMenu);
  window.addEventListener("orientationchange", positionMenu);
  window.addEventListener("scroll", positionMenu, true);
  window.visualViewport?.addEventListener("resize", repositionForVisualViewport);
  window.visualViewport?.addEventListener("scroll", repositionForVisualViewport);
  measure();
});
onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  document.removeEventListener("pointerdown", outsideClick);
  window.removeEventListener("resize", positionMenu);
  window.removeEventListener("orientationchange", positionMenu);
  window.removeEventListener("scroll", positionMenu, true);
  window.visualViewport?.removeEventListener("resize", repositionForVisualViewport);
  window.visualViewport?.removeEventListener("scroll", repositionForVisualViewport);
});
</script>

<template>
  <div ref="root" class="label-picker" :class="[`density-${density}`, { 'is-open': open, 'is-disabled': disabled }]">
    <button v-if="triggerMode === 'icon'" class="label-picker-icon-trigger" :class="{ 'has-selection': modelValue.length > 0 }" type="button" :disabled="disabled" :aria-label="label || 'Choose labels'" :aria-expanded="open" :aria-controls="listboxId" @click="togglePicker">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.6 10.6 13.4 3.4A2 2 0 0 0 12 2.8H4a1.2 1.2 0 0 0-1.2 1.2v8a2 2 0 0 0 .6 1.4l7.2 7.2a2 2 0 0 0 2.8 0l7.2-7.2a2 2 0 0 0 0-2.8Z" /><circle cx="7.5" cy="7.5" r="1.2" /></svg>
    </button>
    <div v-else class="label-picker-control" @click="openPicker">
      <span v-for="(label, index) in selectedLabels.slice(0, visibleCount)" :key="label.id" class="selected-chip" :style="{ ...(label.color ? { '--chip-color': label.color } : {}), ...(chipMaxWidth(index) ? { maxWidth: chipMaxWidth(index) } : {}) }">
        <span class="chip-dot" aria-hidden="true"></span><span class="chip-name">{{ label.name }}</span>
        <button type="button" :disabled="disabled" :aria-label="`Remove ${label.name}`" @click.stop="removeLabel(label)">×</button>
      </span>
      <span v-if="showHiddenCount" class="more-chip" :aria-label="`${hiddenCount} more selected labels`">+{{ hiddenCount }}</span>
      <span v-if="!selectedLabels.length" class="empty-picker">Choose labels…</span>
      <button class="picker-chevron" type="button" :disabled="disabled" :aria-label="open ? 'Close label picker' : 'Open label picker'" :aria-expanded="open" :aria-controls="listboxId" @click.stop="togglePicker"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5.5 7.5 4.5 4.5 4.5-4.5" /></svg></button>
    </div>
    <div ref="measureRow" class="measure-row" aria-hidden="true">
      <span v-for="label in selectedLabels" :key="label.id" data-measure-chip class="selected-chip"><span class="chip-dot"></span><span class="chip-name">{{ label.name }}</span><button type="button" aria-hidden="true" tabindex="-1">×</button></span>
      <span data-measure-more class="more-chip">+99</span>
    </div>
    <Teleport to="body">
    <div v-if="open" ref="menu" class="label-picker-menu" :style="menuPosition">
      <input :id="inputId" ref="input" v-model="query" role="combobox" aria-autocomplete="list" :aria-label="label || 'Search labels'" :aria-controls="listboxId" :aria-activedescendant="activeDescendant" :aria-expanded="open" placeholder="Search labels…" @keydown="onKeydown" />
      <div :id="listboxId" class="label-picker-options" role="listbox" aria-label="Available labels" aria-multiselectable="true">
        <button v-for="(label, index) in dropdownLabels" :key="label.id" :id="`${listboxId}-option-${index}`" type="button" role="option" :aria-selected="modelValue.includes(label.id)" :class="{ active: index === activeIndex, selected: modelValue.includes(label.id) }" @mouseenter="activeIndex = index" @click="toggleLabel(label)">
          <span class="option-check" aria-hidden="true">{{ modelValue.includes(label.id) ? '✓' : '' }}</span>
          <span class="option-dot" :style="{ background: label.color || labelColors[0] }" aria-hidden="true"></span>
          <span class="option-name"><template v-for="(part, partIndex) in segments(label.name)" :key="partIndex"><mark v-if="part.match">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template></span>
        </button>
        <button v-if="canCreate" :id="`${listboxId}-option-create`" type="button" role="option" :aria-selected="false" :class="{ active: activeIndex === dropdownLabels.length }" :disabled="creating" @mouseenter="activeIndex = dropdownLabels.length" @click="createLabel">
          <span class="option-check" aria-hidden="true">＋</span><span class="create-copy">Create <strong>{{ query.trim() }}</strong></span><span v-if="creating" class="option-state">Creating…</span>
        </button>
        <p v-if="!dropdownLabels.length && !canCreate" class="no-labels">No matching labels</p>
      </div>
      <p v-if="error" class="picker-error" role="alert">{{ error }}</p>
      <div class="picker-hint"><kbd>↑</kbd><kbd>↓</kbd> navigate <kbd>↵</kbd> select <kbd>esc</kbd> close</div>
    </div>
    </Teleport>
  </div>
</template>

<style scoped>
.label-picker { position: relative; width: 100%; min-width:0; color: var(--workspace-text); --picker-safe-left:env(safe-area-inset-left); --picker-safe-right:env(safe-area-inset-right); --picker-safe-top:env(safe-area-inset-top); --picker-safe-bottom:env(safe-area-inset-bottom); }
.label-picker.is-disabled { opacity: .55; }
.label-picker-icon-trigger { display:grid; place-items:center; width:36px; min-width:36px; min-height:36px; padding:0; border:0; border-radius:6px; background:transparent; color:var(--workspace-muted); cursor:pointer; touch-action:manipulation; }
.label-picker-icon-trigger:hover,.is-open .label-picker-icon-trigger { background:transparent; color:var(--workspace-text); }
.label-picker-icon-trigger:focus-visible { outline:2px solid var(--workspace-focus); outline-offset:2px; }
.label-picker-icon-trigger svg { width:20px; height:20px; transform:rotate(315deg); fill:none; stroke:currentColor; stroke-width:1.8; stroke-linejoin:round; }
.label-picker-icon-trigger.has-selection svg { fill:currentColor; stroke:none; }
.label-picker-icon-trigger.has-selection svg circle { fill:var(--workspace-surface); stroke:none; }
.label-picker-icon-trigger.has-selection { color:var(--workspace-strong); }
.label-picker-control { display: flex; align-items: center; gap: 6px; min-height: 42px; width: 100%; overflow: hidden; padding: 4px 8px 4px 9px; border: 1px solid var(--workspace-control-border); border-radius: 6px; background: var(--workspace-surface); cursor: pointer; touch-action:manipulation; }
.label-picker-control:focus-within, .is-open .label-picker-control { border-color: var(--workspace-focus); box-shadow: 0 0 0 3px color-mix(in srgb, var(--workspace-focus) 16%, transparent); }
.empty-picker { flex: 1; min-width: 0; overflow: hidden; color: var(--workspace-muted); font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.picker-chevron { display: grid; place-items: center; width: 28px; height: 30px; flex: 0 0 auto; margin-left: auto; padding: 0; border: 0; border-radius: 4px; background: transparent; color: var(--workspace-muted); touch-action:manipulation; }
.picker-chevron:hover { background: var(--workspace-hover); color: var(--workspace-strong); }
.picker-chevron svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; transition: transform 120ms ease; }
.is-open .picker-chevron svg { transform: rotate(180deg); }
.selected-chip, .more-chip { display: inline-flex; align-items: center; gap: 5px; max-width: 190px; min-height: 28px; flex: 0 0 auto; padding: 2px 4px 2px 7px; border: 1px solid color-mix(in srgb, var(--chip-color, var(--workspace-selected-text)) 32%, var(--workspace-border)); border-radius: 5px; background: color-mix(in srgb, var(--chip-color, var(--workspace-selected-text)) 10%, var(--workspace-surface)); color: var(--workspace-text); font-size: 12px; }
.selected-chip { position: relative; padding-right: 24px; }
.chip-dot { width: 7px; height: 7px; flex: 0 0 auto; border-radius: 50%; background: var(--chip-color, var(--workspace-selected-text)); }
.chip-name { min-width: 0; flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.selected-chip button { position: absolute; top: 1px; right: 1px; display: grid; place-items: center; width: 24px; height: 24px; flex: 0 0 auto; padding: 0; border: 0; border-radius: 4px; background: transparent; color: var(--workspace-muted); font-size: 17px; line-height: 1; }
.selected-chip button:hover { background: var(--workspace-hover); color: var(--workspace-strong); }
.more-chip { min-width: 38px; justify-content: center; padding-inline: 8px; color: var(--workspace-muted); background: var(--workspace-hover); border-color: var(--workspace-border); font-variant-numeric: tabular-nums; }
.measure-row { position: absolute; z-index: -1; top: 0; left: 0; display: flex; visibility: hidden; pointer-events: none; white-space: nowrap; }
.label-picker-menu { box-sizing:border-box; z-index: 1000; max-height: min(360px, 60vh); overflow: auto; overscroll-behavior: contain; padding: 7px; border: 1px solid var(--workspace-border); border-radius: 8px; background: var(--workspace-surface); box-shadow: 0 14px 38px rgb(0 0 0 / 20%), 0 2px 8px rgb(0 0 0 / 9%); }
.label-picker-menu > input { box-sizing:border-box; width: 100%; min-width:0; min-height: 44px; margin-bottom: 5px; padding: 7px 9px; border-radius: 5px; font-size: 16px; }
.label-picker-options { max-height: 255px; overflow: auto; overscroll-behavior: contain; }
.label-picker-options > button { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 44px; padding: 6px 8px; border: 0; border-radius: 5px; background: transparent; color: var(--workspace-text); text-align: left; cursor: pointer; touch-action:manipulation; }
.label-picker-options > button:hover, .label-picker-options > button.active { background: var(--workspace-hover); }
.label-picker-options > button.selected { background: color-mix(in srgb, var(--workspace-selected) 60%, transparent); }
.option-check { display: grid; place-items: center; width: 18px; height: 18px; flex: 0 0 auto; color: var(--workspace-selected-text); font-weight: 700; }
.option-dot { width: 9px; height: 9px; flex: 0 0 auto; border-radius: 50%; }
.option-name, .create-copy { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.option-name mark { border-radius: 2px; background: color-mix(in srgb, var(--workspace-accent) 25%, transparent); color: inherit; font-weight: 700; }
.no-labels, .picker-error { margin: 0; padding: 12px; color: var(--workspace-muted); }
.picker-error { color: var(--workspace-danger); }
.picker-hint { display: flex; align-items: center; gap: 5px; padding: 9px 8px 4px; border-top: 1px solid var(--workspace-border); color: var(--workspace-muted); font-size: 10px; }
kbd { min-width: 18px; padding: 1px 4px; border: 1px solid var(--workspace-border); border-radius: 4px; text-align: center; font: inherit; }
.density-comfortable .label-picker-control { min-height: 54px; padding: 7px 10px 7px 12px; border-radius: 10px; }
.density-comfortable .selected-chip, .density-comfortable .more-chip { min-height: 30px; padding: 3px 6px 3px 9px; border-radius: 7px; }
@media (max-width: 600px) { .label-picker-control { min-height:44px; gap: 4px; padding-inline: 8px; } .picker-chevron { width: 44px; height: 44px; } .selected-chip { max-width: 135px; } .label-picker-menu { max-height: calc(100dvh - 16px); } }
@media (pointer: coarse) { .label-picker-control { min-height:44px; } .label-picker-icon-trigger { width:44px; min-width:44px; min-height:44px; } .picker-chevron { width:44px; height:44px; } .selected-chip { min-height:44px; padding-right:44px; } .selected-chip button { top:50%; right:0; width:44px; height:44px; transform:translateY(-50%); } .label-picker-options > button { min-height:48px; } }
</style>
