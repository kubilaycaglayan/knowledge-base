<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  mdiArrowRight,
  mdiCalendarOutline,
  mdiCardTextOutline,
  mdiChevronDown,
  mdiHistory,
  mdiMagnify,
  mdiNoteTextOutline,
  mdiSignDirection,
  mdiTagOutline,
  mdiTextBoxOutline,
  mdiTimerOutline,
  mdiViewColumnOutline,
} from "@mdi/js";
import { api, ApiError } from "../lib/api";
import { vDialogFocus } from "../lib/dialog-focus";
import { vBackdropClose } from "../lib/backdrop-close";
import { formatTrackedDuration } from "../lib/format";
import {
  forgetSearches,
  highlightParts,
  isGlobalSearchShortcut,
  matchPages,
  recentSearches,
  rememberSearch,
  SEARCH_MAX_LENGTH,
  SEARCH_MORE_SIZE,
  searchGroupLabels,
  searchRequest,
  searchResultLink,
  searchTerms,
  shortcutLabel,
  type AppPage,
  type SearchGroup,
  type SearchResponse,
  type SearchResult,
  type SearchType,
} from "../lib/search";

const DEBOUNCE_MS = 150;

const router = useRouter();
const route = useRoute();

const open = ref(false);
const query = ref("");
const input = ref<HTMLInputElement | null>(null);
const listbox = ref<HTMLElement | null>(null);
const groups = ref<SearchGroup[]>([]);
const fuzzy = ref(false);
const incomplete = ref(false);
const searchedFor = ref("");
const loading = ref(false);
const error = ref("");
const loadingMore = ref<SearchType | "">("");
const activeIndex = ref(-1);
const recent = ref<string[]>([]);
const shortcut = shortcutLabel();

let debounce: ReturnType<typeof setTimeout> | undefined;
let controller: AbortController | null = null;
let sequence = 0;

type Option =
  | { kind: "result"; id: string; group: SearchGroup; result: SearchResult }
  | { kind: "more"; id: string; group: SearchGroup }
  | { kind: "recent"; id: string; query: string }
  | { kind: "page"; id: string; page: AppPage };

const trimmed = computed(() => query.value.trim());
const tooLong = computed(() => query.value.length > SEARCH_MAX_LENGTH);
const terms = computed(() => searchTerms(searchedFor.value));
const totalResults = computed(() => groups.value.reduce((sum, group) => sum + group.total, 0));
const anyCapped = computed(() => groups.value.some((group) => group.capped));
// Pages match on the typed text right away, without waiting for the server.
const pages = computed(() => (tooLong.value ? [] : matchPages(trimmed.value)));

const options = computed<Option[]>(() => {
  if (!trimmed.value)
    return recent.value.map((value, index) => ({ kind: "recent", id: `global-search-recent-${index}`, query: value }));
  const list: Option[] = pages.value.map((page) => ({ kind: "page", id: `global-search-page-${page.id}`, page }));
  for (const group of groups.value) {
    for (const result of group.results)
      list.push({ kind: "result", id: optionId(result), group, result });
    if (group.results.length < group.total)
      list.push({ kind: "more", id: `global-search-more-${group.type}`, group });
  }
  return list;
});
const pageOptions = computed(() =>
  options.value.filter((option): option is Extract<Option, { kind: "page" }> => option.kind === "page"),
);
const activeOption = computed(() => options.value[activeIndex.value]);

function groupOptions(group: SearchGroup) {
  return options.value.filter(
    (option): option is Extract<Option, { kind: "result" | "more" }> =>
      (option.kind === "result" || option.kind === "more") && option.group === group,
  );
}
function optionId(result: SearchResult) {
  return `global-search-${result.type.toLowerCase()}-${result.id}`;
}
function indexOf(id: string) {
  return options.value.findIndex((option) => option.id === id);
}

// --- opening and closing -----------------------------------------------------

function show() {
  if (open.value) {
    input.value?.focus();
    input.value?.select();
    return;
  }
  recent.value = recentSearches();
  open.value = true;
  document.documentElement.classList.add("global-search-open");
  void nextTick(() => {
    input.value?.focus();
    input.value?.select();
  });
}
function close() {
  if (!open.value) return;
  open.value = false;
  document.documentElement.classList.remove("global-search-open");
  clearTimeout(debounce);
  controller?.abort();
  controller = null;
  loading.value = false;
  loadingMore.value = "";
}
defineExpose({ show, close });

function onKeydown(event: KeyboardEvent) {
  if (!isGlobalSearchShortcut(event) || event.isComposing) return;
  event.preventDefault();
  if (open.value && document.activeElement === input.value) close();
  else show();
}
onMounted(() => document.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => {
  document.removeEventListener("keydown", onKeydown);
  close();
});
// Following a result, or any other navigation, puts the search away.
watch(() => route.fullPath, close);

// --- searching -----------------------------------------------------------------

watch(query, () => {
  clearTimeout(debounce);
  error.value = "";
  if (!trimmed.value || tooLong.value) {
    controller?.abort();
    loading.value = false;
    if (!trimmed.value) {
      groups.value = [];
      searchedFor.value = "";
      activeIndex.value = -1;
    }
    return;
  }
  // The best page match is ready before any record result, so Enter can take it.
  activeIndex.value = pages.value.length ? 0 : -1;
  loading.value = true;
  debounce = setTimeout(() => void run(), DEBOUNCE_MS);
});

async function run() {
  const q = trimmed.value;
  if (!q || tooLong.value) return;
  controller?.abort();
  const mine = new AbortController();
  controller = mine;
  const ticket = ++sequence;
  loading.value = true;
  error.value = "";
  try {
    const response = await api<SearchResponse>(searchRequest(q), { signal: mine.signal });
    if (ticket !== sequence) return;
    groups.value = response.groups;
    fuzzy.value = response.fuzzy;
    incomplete.value = response.incomplete;
    searchedFor.value = q;
    activeIndex.value = options.value.length ? 0 : -1;
  } catch (cause) {
    if (ticket !== sequence || mine.signal.aborted) return;
    error.value =
      cause instanceof ApiError && cause.status === 400
        ? cause.message
        : "Search isn’t available right now. Check your connection and try again.";
  } finally {
    if (ticket === sequence) loading.value = false;
  }
}
function retry() {
  void run();
  input.value?.focus();
}

async function showMore(group: SearchGroup) {
  if (loadingMore.value) return;
  const keepActive = activeOption.value?.id;
  loadingMore.value = group.type;
  const ticket = sequence;
  try {
    const response = await api<SearchResponse>(
      searchRequest(searchedFor.value, {
        types: [group.type],
        limit: SEARCH_MORE_SIZE,
        offset: group.results.length,
        fuzzy: fuzzy.value,
      }),
    );
    if (ticket !== sequence) return;
    const more = response.groups[0];
    const target = groups.value.find((value) => value.type === group.type);
    if (!more || !target) {
      // Nothing more after all; stop offering it.
      if (target) target.total = target.results.length;
      return;
    }
    const known = new Set(target.results.map((result) => result.id));
    const firstNew = more.results.find((result) => !known.has(result.id));
    target.results = [...target.results, ...more.results.filter((result) => !known.has(result.id))];
    target.total = Math.max(more.total, target.results.length);
    target.capped = more.capped;
    await nextTick();
    // Keep the keyboard on the first new result so the list continues where it was.
    const next = firstNew ? indexOf(optionId(firstNew)) : keepActive ? indexOf(keepActive) : -1;
    if (next >= 0) setActive(next);
  } catch {
    if (ticket === sequence) error.value = `Couldn’t load more ${searchGroupLabels[group.type].toLowerCase()}. Try again.`;
  } finally {
    loadingMore.value = "";
  }
}

// --- keyboard navigation -----------------------------------------------------------

function setActive(index: number) {
  activeIndex.value = index;
  const option = options.value[index];
  if (!option) return;
  void nextTick(() => document.getElementById(option.id)?.scrollIntoView?.({ block: "nearest" }));
}
function move(step: number) {
  const count = options.value.length;
  if (!count) return;
  const from = activeIndex.value < 0 ? (step > 0 ? -1 : count) : activeIndex.value;
  setActive((from + step + count) % count);
}
function onInputKeydown(event: KeyboardEvent) {
  if (event.isComposing) return;
  switch (event.key) {
    case "ArrowDown":
      event.preventDefault();
      move(1);
      break;
    case "ArrowUp":
      event.preventDefault();
      move(-1);
      break;
    case "PageDown":
      event.preventDefault();
      move(5);
      break;
    case "PageUp":
      event.preventDefault();
      move(-5);
      break;
    case "Enter": {
      event.preventDefault();
      if (activeOption.value?.kind === "page") {
        activate(activeOption.value, event.metaKey || event.ctrlKey);
        return;
      }
      if (loading.value && trimmed.value !== searchedFor.value) {
        // Results for the typed text are on their way; search now instead of waiting.
        clearTimeout(debounce);
        void run();
        return;
      }
      const option = activeOption.value;
      if (option) activate(option, event.metaKey || event.ctrlKey);
      break;
    }
    case "Escape":
      event.preventDefault();
      close();
      break;
  }
}

function activate(option: Option, newTab = false) {
  if (option.kind === "recent") {
    query.value = option.query;
    input.value?.focus();
    return;
  }
  if (option.kind === "more") {
    void showMore(option.group);
    return;
  }
  const link = option.kind === "page" ? option.page.path : searchResultLink(option.result);
  if (option.kind === "result") recent.value = rememberSearch(searchedFor.value);
  if (newTab) {
    window.open(router.resolve(link).href, "_blank", "noopener");
    return;
  }
  close();
  void router.push(link);
}
function onResultClick(event: MouseEvent, option: Option) {
  // Let the browser handle new-tab and new-window clicks on the link itself.
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
    if (option.kind === "result") recent.value = rememberSearch(searchedFor.value);
    return;
  }
  event.preventDefault();
  activate(option);
}
function clearRecent() {
  forgetSearches();
  recent.value = [];
  activeIndex.value = -1;
  input.value?.focus();
}

// --- presentation -------------------------------------------------------------

const icons: Record<SearchType, string> = {
  PATH: mdiSignDirection,
  BOARD: mdiViewColumnOutline,
  LABEL: mdiTagOutline,
  NOTE: mdiNoteTextOutline,
  CARD: mdiCardTextOutline,
  LOG: mdiTextBoxOutline,
  SESSION: mdiTimerOutline,
  CALENDAR_DAY: mdiCalendarOutline,
};
const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const dateOnly = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const longDate = new Intl.DateTimeFormat(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" });
const count = new Intl.NumberFormat();

function formatInstant(value: string | null, withTime = true) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : (withTime ? dateTime : dateOnly).format(date);
}
function calendarDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return value || "";
  const [year, month, day] = value.split("-").map(Number);
  return longDate.format(new Date(year, month - 1, day));
}
function title(result: SearchResult) {
  return result.type === "CALENDAR_DAY" ? calendarDate(result.date) : result.title;
}
function swatch(result: SearchResult) {
  return result.color || result.pathColor || null;
}
function meta(result: SearchResult): string[] {
  switch (result.type) {
    case "SESSION": {
      const parts = [formatInstant(result.at)];
      if (result.endedAt === null) parts.push("Running");
      else if (result.durationSeconds !== null) parts.push(formatTrackedDuration(result.durationSeconds));
      if (result.pathName && result.title !== result.pathName) parts.unshift(result.pathName);
      return parts;
    }
    case "LOG":
      return [formatInstant(result.at)];
    case "CARD":
      return [result.boardName || "Board", result.statusName || ""].filter(Boolean);
    case "BOARD":
      return [result.pathId ? "Path board" : "Board"];
    case "NOTE":
      return [`Updated ${formatInstant(result.at, false)}`];
    case "PATH":
      return ["Path"];
    case "LABEL":
      return ["Label"];
    case "CALENDAR_DAY":
      return ["Calendar"];
  }
}
function viaText(result: SearchResult) {
  if (!result.via || !result.viaName) return "";
  return `${result.via === "PATH" ? "Path" : "Label"}: ${result.viaName}`;
}
function totalText(group: SearchGroup) {
  return group.capped ? `${count.format(group.total)}+` : count.format(group.total);
}
function moreText(group: SearchGroup) {
  const remaining = group.total - group.results.length;
  const next = Math.min(remaining, SEARCH_MORE_SIZE);
  const label = searchGroupLabels[group.type].toLowerCase();
  return `Show ${count.format(next)} more ${label}${group.capped || remaining > next ? ` (${totalText(group)} in all)` : ""}`;
}
function resultLabel(result: SearchResult) {
  const parts = [title(result), ...meta(result)];
  if (result.archived) parts.push("archived");
  const via = viaText(result);
  if (via) parts.push(`matched by ${via}`);
  return parts.join(", ");
}
const status = computed(() => {
  if (tooLong.value) return `Searches are limited to ${SEARCH_MAX_LENGTH} characters.`;
  if (!trimmed.value) return "";
  const pageText = pages.value.length ? `${count.format(pages.value.length)} page${pages.value.length === 1 ? "" : "s"}. ` : "";
  if (loading.value) return `${pageText}Searching…`;
  if (error.value) return error.value;
  if (!searchedFor.value) return "";
  if (!groups.value.length) return `${pageText}No results for “${searchedFor.value}”.`;
  const amount = `${count.format(totalResults.value)}${anyCapped.value ? "+" : ""}`;
  return `${pageText}${amount} result${totalResults.value === 1 ? "" : "s"}${fuzzy.value ? " with similar spelling" : ""}.`;
});
</script>

<template>
  <button
    type="button"
    class="global-search-trigger"
    aria-haspopup="dialog"
    :aria-expanded="open"
    aria-keyshortcuts="Meta+K Control+K"
    :title="`Search everything (${shortcut})`"
    @click="show"
  >
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path :d="mdiMagnify" fill="currentColor" /></svg>
    <span class="global-search-trigger-text">Search</span>
    <kbd class="global-search-trigger-key" aria-hidden="true" translate="no">{{ shortcut }}</kbd>
  </button>
  <Teleport to="body">
    <div v-if="open" class="global-search-backdrop" v-backdrop-close="close">
      <section
        v-dialog-focus
        class="global-search"
        role="dialog"
        aria-modal="true"
        aria-label="Search everything"
        tabindex="-1"
      >
        <div class="global-search-field">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path :d="mdiMagnify" fill="currentColor" /></svg>
          <input
            ref="input"
            v-model="query"
            class="global-search-input"
            type="search"
            name="global-search"
            role="combobox"
            aria-label="Search sessions, boards, notes, labels, paths, and logs"
            aria-autocomplete="list"
            :aria-expanded="options.length > 0"
            aria-controls="global-search-listbox"
            :aria-activedescendant="activeOption?.id"
            :aria-invalid="tooLong || undefined"
            aria-describedby="global-search-status"
            autocomplete="off"
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false"
            enterkeyhint="go"
            placeholder="Search everything…"
            @keydown="onInputKeydown"
          />
          <span v-if="loading" class="global-search-spinner" aria-hidden="true"></span>
          <button type="button" class="global-search-close" @click="close">
            <span class="global-search-close-text">Close</span>
            <kbd aria-hidden="true">Esc</kbd>
          </button>
        </div>
        <p id="global-search-status" class="sr-only" aria-live="polite">{{ status }}</p>
        <div ref="listbox" class="global-search-body">
          <p v-if="tooLong" class="global-search-message" role="alert">
            Searches are limited to {{ SEARCH_MAX_LENGTH }} characters. Shorten your search to see results.
          </p>
          <div v-else-if="error" class="global-search-message global-search-error" role="alert">
            <span>{{ error }}</span>
            <button type="button" class="text-button" @click="retry">Try again</button>
          </div>
          <template v-if="!trimmed">
            <div v-if="recent.length" class="global-search-recent">
              <div class="global-search-group-heading">
                <h2 id="global-search-recent-heading">Recent searches</h2>
                <button type="button" class="global-search-clear text-button" @click="clearRecent">Clear</button>
              </div>
              <div id="global-search-listbox" role="listbox" aria-labelledby="global-search-recent-heading">
                <div
                  v-for="(option, index) in options"
                  :id="option.id"
                  :key="option.id"
                  role="option"
                  class="global-search-option global-search-recent-option"
                  :aria-selected="index === activeIndex"
                  @mousemove="activeIndex = index"
                  @click="activate(option)"
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path :d="mdiHistory" fill="currentColor" /></svg>
                  <span class="global-search-title">{{ option.kind === "recent" ? option.query : "" }}</span>
                </div>
              </div>
            </div>
            <div v-else class="global-search-hint">
              <p>Find sessions, boards and cards, notes, logs, labels, paths, and calendar days.</p>
              <p class="muted">Every word has to match. Records also match through their path and labels.</p>
            </div>
          </template>
          <template v-else-if="!tooLong">
            <p v-if="fuzzy && groups.length" class="global-search-notice">
              No exact matches for “{{ searchedFor }}”. Showing similar spellings.
            </p>
            <p v-if="incomplete" class="global-search-notice">Some results took too long and are left out.</p>
            <div
              v-if="searchedFor && !loading && !error && !groups.length && !pages.length"
              class="global-search-empty"
            >
              <p>No results for “<span class="global-search-empty-query">{{ searchedFor }}</span>”.</p>
              <p class="muted">Try fewer words, or check the spelling.</p>
            </div>
            <div
              v-show="groups.length || pages.length"
              id="global-search-listbox"
              role="listbox"
              aria-label="Search results"
              :aria-busy="loading || undefined"
            >
              <div v-if="pages.length" role="group" class="global-search-group" aria-labelledby="global-search-heading-pages">
                <div class="global-search-group-heading" role="presentation">
                  <h2 id="global-search-heading-pages">Pages</h2>
                </div>
                <RouterLink
                  v-for="option in pageOptions"
                  :id="option.id"
                  :key="option.id"
                  :to="option.page.path"
                  role="option"
                  class="global-search-option global-search-page"
                  :aria-selected="option.id === activeOption?.id"
                  :aria-label="`${option.page.label}, page`"
                  tabindex="-1"
                  @mousemove="activeIndex = indexOf(option.id)"
                  @click="onResultClick($event, option)"
                >
                  <span class="global-search-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="18" height="18"><path :d="mdiArrowRight" fill="currentColor" /></svg>
                  </span>
                  <span class="global-search-text">
                    <span class="global-search-title">{{ option.page.label }}</span>
                    <span class="global-search-meta"><span>Go to page</span></span>
                  </span>
                </RouterLink>
              </div>
              <div
                v-for="group in groups"
                :key="group.type"
                role="group"
                class="global-search-group"
                :class="{ stale: loading }"
                :aria-labelledby="`global-search-heading-${group.type}`"
              >
                <div class="global-search-group-heading" role="presentation">
                  <h2 :id="`global-search-heading-${group.type}`">
                    {{ searchGroupLabels[group.type] }}
                    <span class="global-search-count">{{ totalText(group) }}</span>
                  </h2>
                </div>
                <template v-for="option in groupOptions(group)" :key="option.id">
                  <RouterLink
                    v-if="option.kind === 'result'"
                    :id="option.id"
                    :to="searchResultLink(option.result)"
                    role="option"
                    class="global-search-option"
                    :aria-selected="option.id === activeOption?.id"
                    :aria-label="resultLabel(option.result)"
                    tabindex="-1"
                    @mousemove="activeIndex = indexOf(option.id)"
                    @click="onResultClick($event, option)"
                  >
                    <span class="global-search-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" width="18" height="18"><path :d="icons[option.result.type]" fill="currentColor" /></svg>
                      <span v-if="swatch(option.result)" class="global-search-swatch" :style="{ backgroundColor: swatch(option.result)! }"></span>
                    </span>
                    <span class="global-search-text">
                      <span class="global-search-title">
                        <template v-for="(part, index) in highlightParts(title(option.result), terms)" :key="index"
                          ><mark v-if="part.match">{{ part.text }}</mark
                          ><template v-else>{{ part.text }}</template></template
                        >
                      </span>
                      <span v-if="option.result.snippet" class="global-search-snippet">
                        <template v-for="(part, index) in highlightParts(option.result.snippet, terms)" :key="index"
                          ><mark v-if="part.match">{{ part.text }}</mark
                          ><template v-else>{{ part.text }}</template></template
                        >
                      </span>
                      <span class="global-search-meta">
                        <span v-for="(item, index) in meta(option.result)" :key="index">{{ item }}</span>
                        <span v-if="option.result.archived" class="global-search-badge">Archived</span>
                        <span v-if="viaText(option.result)" class="global-search-badge global-search-via">{{ viaText(option.result) }}</span>
                      </span>
                    </span>
                  </RouterLink>
                  <div
                    v-else-if="option.kind === 'more'"
                    :id="option.id"
                    role="option"
                    class="global-search-option global-search-more"
                    :aria-selected="option.id === activeOption?.id"
                    :aria-disabled="loadingMore === group.type || undefined"
                    @mousemove="activeIndex = indexOf(option.id)"
                    @click="activate(option)"
                  >
                    <span v-if="loadingMore === group.type" class="global-search-spinner" aria-hidden="true"></span>
                    <svg v-else viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path :d="mdiChevronDown" fill="currentColor" /></svg>
                    <span>{{ loadingMore === group.type ? "Loading…" : moreText(group) }}</span>
                  </div>
                </template>
              </div>
            </div>
          </template>
        </div>
        <footer class="global-search-footer" aria-hidden="true">
          <span><kbd>↑</kbd><kbd>↓</kbd> to move</span>
          <span><kbd>↵</kbd> to open</span>
          <span><kbd translate="no">{{ shortcut.startsWith("⌘") ? "⌘" : "Ctrl" }}</kbd><kbd>↵</kbd> new tab</span>
          <span><kbd>Esc</kbd> to close</span>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped src="./global-search.css"></style>
