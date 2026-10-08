import { Extension, type Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

// Per-line edit times for note and card bodies, like git blame. The server
// stamps each body line on save (backend LineAttribution) and returns the
// times as `lineEdits`, one per line of the saved body. A body's lines are its
// textblocks in document order, split at hard breaks and newlines; task items
// prefix "[x] " or "[ ] ". contentLines must match LineAttribution.lines —
// backend/src/test/resources/line-history-cases.json keeps them in step.

const TEXTBLOCKS = new Set(["paragraph", "heading", "codeBlock"]);
type JsonNode = { type?: unknown; text?: unknown; attrs?: { checked?: unknown }; content?: unknown };

const taskPrefix = (checked: unknown) => (checked === true ? "[x] " : "[ ] ");

/** The lines of a stored body. Bodies that are not JSON are legacy plain text. */
export function contentLines(content: string | null | undefined): string[] {
  if (content == null) return [];
  let root: unknown;
  try {
    root = JSON.parse(content);
  } catch {
    return content.split("\n");
  }
  if (!root || typeof root !== "object" || Array.isArray(root)) return content.split("\n");
  const lines: string[] = [];
  const collect = (node: JsonNode, prefix: string) => {
    const children = Array.isArray(node.content) ? (node.content as JsonNode[]) : [];
    if (typeof node.type === "string" && TEXTBLOCKS.has(node.type)) {
      const text = children.map((child) => (child.type === "text" ? String(child.text ?? "") : child.type === "hardBreak" ? "\n" : "")).join("");
      lines.push(...(prefix + text).split("\n"));
      return;
    }
    const childPrefix = node.type === "taskItem" ? taskPrefix(node.attrs?.checked) : "";
    children.forEach((child) => collect(child, childPrefix));
  };
  if ((root as JsonNode).type === "doc") collect(root as JsonNode, "");
  return lines;
}

export type DocumentLine = { text: string; pos: number };

/** The lines of a live editor document, with the position where each starts. */
export function documentLines(doc: ProseMirrorNode): DocumentLine[] {
  const lines: DocumentLine[] = [];
  doc.descendants((node, pos, parent) => {
    if (!TEXTBLOCKS.has(node.type.name)) return true;
    let current: DocumentLine = { text: parent?.type.name === "taskItem" ? taskPrefix(parent.attrs.checked) : "", pos: pos + 1 };
    node.forEach((child, offset) => {
      const start = pos + 1 + offset;
      if (child.isText) {
        const parts = (child.text || "").split("\n");
        current.text += parts[0];
        let consumed = parts[0].length;
        for (const part of parts.slice(1)) {
          lines.push(current);
          consumed += 1;
          current = { text: part, pos: start + consumed };
          consumed += part.length;
        }
      } else if (child.type.name === "hardBreak") {
        lines.push(current);
        current = { text: "", pos: start + 1 };
      }
    });
    lines.push(current);
    return false;
  });
  return lines;
}

/**
 * A body's plain-text copy: one line per body line, without task checkboxes. The
 * Chrome extension edits this copy and rebuilds the body from it, so it must not
 * add blank lines between blocks the way a block-separated getText does.
 */
export function plainText(doc: ProseMirrorNode) {
  return documentLines(doc).map((line) => line.text.replace(TASK_PREFIX, "")).join("\n");
}
const TASK_PREFIX = /^\[[x ]\] /;

// Alignment cost is lines x lines; past this, only the common head and tail keep their times.
const MAX_ALIGNMENT_CELLS = 2_000_000;

const TASK = /^\[[x ]\] /;
/**
 * Whether two lines are the same line, mirroring LineAttribution.same: a line also matches itself
 * without its task checkbox (plain-text clients drop checkboxes), but not with the other checkbox.
 */
export function sameLine(a: string, b: string) {
  if (a === b) return true;
  const taskA = TASK.test(a);
  const taskB = TASK.test(b);
  return taskA !== taskB && (taskA ? a.slice(4) : a) === (taskB ? b.slice(4) : b);
}

/** Gives each current line the time of the saved line it matches, or null when it is unsaved. */
export function alignTimes(saved: string[], times: (string | null)[], current: string[]): (string | null)[] {
  const result: (string | null)[] = current.map(() => null);
  if (saved.length !== times.length) return result;
  let head = 0;
  while (head < saved.length && head < current.length && sameLine(saved[head], current[head])) {
    result[head] = times[head];
    head++;
  }
  let tail = 0;
  while (tail < saved.length - head && tail < current.length - head && sameLine(saved[saved.length - 1 - tail], current[current.length - 1 - tail])) {
    result[current.length - 1 - tail] = times[saved.length - 1 - tail];
    tail++;
  }
  const n = saved.length - head - tail;
  const m = current.length - head - tail;
  if (n === 0 || m === 0 || n * m > MAX_ALIGNMENT_CELLS) return result;
  const lengths = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lengths[i][j] = sameLine(saved[head + i], current[head + j]) ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (sameLine(saved[head + i], current[head + j])) result[head + j++] = times[head + i++];
    else if (lengths[i + 1][j] >= lengths[i][j + 1]) i++;
    else j++;
  }
  return result;
}

// Formatters are costly to build and the page's locale does not change, so build them once.
let formats: Record<"time" | "date" | "shortDate" | "full", Intl.DateTimeFormat> | null = null;
function lineFormats() {
  formats ||= {
    time: new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
    date: new Intl.DateTimeFormat(undefined, { year: "numeric", month: "2-digit", day: "2-digit" }),
    shortDate: new Intl.DateTimeFormat(undefined, { month: "2-digit", day: "2-digit" }),
    full: new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short" }),
  };
  return formats;
}

/** "13:34" and the locale's numeric date, e.g. "10/08/2026" (or "10/08" for narrow gutters), for a line's gutter. */
export function formatLineTime(iso: string) {
  const value = new Date(iso);
  const { time, date, shortDate, full } = lineFormats();
  return { time: time.format(value), date: date.format(value), shortDate: shortDate.format(value), full: full.format(value), iso: value.toISOString() };
}

export type LineHistoryState = { content: string; times: string[] } | null;
type Saved = { lines: string[]; times: (string | null)[] };
type Aligned = { lines: DocumentLine[]; times: (string | null)[] };
type PluginState = { saved: Saved | null; decorations: DecorationSet; aligned: Aligned | null };
const lineHistoryKey = new PluginKey<PluginState>("lineHistory");

// A time the browser cannot read is treated as unknown rather than breaking the gutter.
const readable = (time: string) => (Number.isNaN(Date.parse(time)) ? null : time);

function stamp(time: string | null, text: string) {
  const element = document.createElement("span");
  element.className = "line-history-stamp";
  element.contentEditable = "false";
  // The times are a visual aid; the editor's text stays the textbox's only content for assistive tech.
  element.setAttribute("aria-hidden", "true");
  // An empty unsaved line is usually the trailing paragraph the editor adds itself; leave it unlabeled.
  if (!time && !text) return element;
  if (!time) {
    element.classList.add("unsaved");
    element.textContent = "Unsaved";
    element.title = "Not saved yet";
    return element;
  }
  const { time: clock, date, shortDate, full, iso } = formatLineTime(time);
  const label = document.createElement("time");
  label.dateTime = iso;
  label.title = `Edited ${full}`;
  for (const [className, value] of [["line-history-clock", clock], ["line-history-date", date], ["line-history-short-date", shortDate]]) {
    const part = document.createElement("span");
    part.className = className;
    part.textContent = value;
    label.append(part);
    if (className === "line-history-clock") label.append(" ");
  }
  element.append(label);
  return element;
}

function aligned(doc: ProseMirrorNode, saved: Saved | null): Aligned | null {
  if (!saved) return null;
  const lines = documentLines(doc);
  return { lines, times: alignTimes(saved.lines, saved.times, lines.map((line) => line.text)) };
}

function decorations(doc: ProseMirrorNode, lines: Aligned | null) {
  if (!lines) return DecorationSet.empty;
  return DecorationSet.create(
    doc,
    lines.lines.map((line, index) => Decoration.widget(line.pos, () => stamp(lines.times[index], line.text), { side: -1, ignoreSelection: true, key: `${index}:${lines.times[index] ?? (line.text ? "unsaved" : "empty")}` })),
  );
}

// What a screen reader hears for the caret's line; the gutter itself is hidden from assistive tech.
// The line number keeps neighbouring lines with the same time distinct, which
// screen readers would otherwise skip as a repeated announcement.
export function lineAnnouncement(time: string | null, text: string, line: number) {
  if (time) return `Line ${line}, edited ${formatLineTime(time).full}`;
  return text ? `Line ${line}, not saved yet` : "";
}

function caretLine(state: { selection: { from: number } }, lines: Aligned) {
  let index = -1;
  for (let i = 0; i < lines.lines.length && lines.lines[i].pos <= state.selection.from; i++) index = i;
  return index;
}

// A polite live region beside the editor announces the caret line's edit time
// whenever the caret reaches another line, or the gutter turns on.
function announcer(view: EditorView) {
  const status = document.createElement("span");
  status.className = "line-history-status";
  status.setAttribute("role", "status");
  Object.assign(status.style, { position: "absolute", width: "1px", height: "1px", overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" });
  view.dom.after(status);
  let last = "";
  const announce = (current: EditorView) => {
    const lines = lineHistoryKey.getState(current.state)?.aligned;
    const index = lines ? caretLine(current.state, lines) : -1;
    const message = lines && index >= 0 ? lineAnnouncement(lines.times[index], lines.lines[index].text, index + 1) : "";
    const key = lines ? `${index}:${message}` : "";
    if (key === last) return;
    last = key;
    status.textContent = message;
  };
  return {
    update: (current: EditorView) => {
      if (!status.isConnected && current.dom.isConnected) current.dom.after(status);
      announce(current);
    },
    destroy: () => status.remove(),
  };
}

// The saved body is parsed once per save, not on every keystroke.
function savedLines(history: LineHistoryState): Saved | null {
  return history ? { lines: contentLines(history.content), times: history.times.map(readable) } : null;
}

/** Draws each line's edit time in a gutter while a history is set with setLineHistory. */
export const LineHistory = Extension.create({
  name: "lineHistory",
  addProseMirrorPlugins() {
    return [
      new Plugin<PluginState>({
        key: lineHistoryKey,
        state: {
          init: () => ({ saved: null, decorations: DecorationSet.empty, aligned: null }),
          apply(tr, value, _previous, state) {
            const meta = tr.getMeta(lineHistoryKey) as { history: LineHistoryState } | undefined;
            if (!meta && (!tr.docChanged || !value.saved)) return value;
            const saved = meta ? savedLines(meta.history) : value.saved;
            const lines = aligned(state.doc, saved);
            return { saved, decorations: decorations(state.doc, lines), aligned: lines };
          },
        },
        view: announcer,
        props: {
          decorations: (state) => lineHistoryKey.getState(state)?.decorations,
          attributes: (state): Record<string, string> => (lineHistoryKey.getState(state)?.saved ? { class: "line-history-on" } : {}),
        },
      }),
    ];
  },
});

/** Shows the gutter for the saved body and its times, or hides it with null. */
export function setLineHistory(editor: Editor, history: LineHistoryState) {
  if (editor.isDestroyed) return;
  editor.view.dispatch(editor.state.tr.setMeta(lineHistoryKey, { history }).setMeta("addToHistory", false));
}
