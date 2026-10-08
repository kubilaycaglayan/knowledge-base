import { Extension, type Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

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

// Alignment cost is lines x lines; past this, only the common head and tail keep their times.
const MAX_ALIGNMENT_CELLS = 2_000_000;

/** Gives each current line the time of the saved line it matches, or null when it is unsaved. */
export function alignTimes(saved: string[], times: string[], current: string[]): (string | null)[] {
  const result: (string | null)[] = current.map(() => null);
  if (saved.length !== times.length) return result;
  let head = 0;
  while (head < saved.length && head < current.length && saved[head] === current[head]) {
    result[head] = times[head];
    head++;
  }
  let tail = 0;
  while (tail < saved.length - head && tail < current.length - head && saved[saved.length - 1 - tail] === current[current.length - 1 - tail]) {
    result[current.length - 1 - tail] = times[saved.length - 1 - tail];
    tail++;
  }
  const n = saved.length - head - tail;
  const m = current.length - head - tail;
  if (n === 0 || m === 0 || n * m > MAX_ALIGNMENT_CELLS) return result;
  const lengths = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lengths[i][j] = saved[head + i] === current[head + j] ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (saved[head + i] === current[head + j]) result[head + j++] = times[head + i++];
    else if (lengths[i + 1][j] >= lengths[i][j + 1]) i++;
    else j++;
  }
  return result;
}

const timeFormat = () => new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dateFormat = () => new Intl.DateTimeFormat(undefined, { year: "numeric", month: "2-digit", day: "2-digit" });
const shortDateFormat = () => new Intl.DateTimeFormat(undefined, { month: "2-digit", day: "2-digit" });
const fullFormat = () => new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short" });

/** "13:34" and the locale's numeric date, e.g. "10/08/2026" (or "10/08" for narrow gutters), for a line's gutter. */
export function formatLineTime(iso: string) {
  const value = new Date(iso);
  return { time: timeFormat().format(value), date: dateFormat().format(value), shortDate: shortDateFormat().format(value), full: fullFormat().format(value) };
}

export type LineHistoryState = { content: string; times: string[] } | null;
type PluginState = { history: LineHistoryState; decorations: DecorationSet };
const lineHistoryKey = new PluginKey<PluginState>("lineHistory");

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
  const { time: clock, date, shortDate, full } = formatLineTime(time);
  const label = document.createElement("time");
  label.dateTime = time;
  label.title = `Edited ${full}`;
  label.innerHTML = `<span class="line-history-clock"></span> <span class="line-history-date"></span><span class="line-history-short-date"></span>`;
  label.querySelector(".line-history-clock")!.textContent = clock;
  label.querySelector(".line-history-date")!.textContent = date;
  label.querySelector(".line-history-short-date")!.textContent = shortDate;
  element.append(label);
  return element;
}

function decorations(doc: ProseMirrorNode, history: LineHistoryState) {
  if (!history) return DecorationSet.empty;
  const lines = documentLines(doc);
  const times = alignTimes(contentLines(history.content), history.times, lines.map((line) => line.text));
  return DecorationSet.create(
    doc,
    lines.map((line, index) => Decoration.widget(line.pos, () => stamp(times[index], line.text), { side: -1, ignoreSelection: true, key: `${index}:${times[index] ?? "unsaved"}` })),
  );
}

/** Draws each line's edit time in a gutter while a history is set with setLineHistory. */
export const LineHistory = Extension.create({
  name: "lineHistory",
  addProseMirrorPlugins() {
    return [
      new Plugin<PluginState>({
        key: lineHistoryKey,
        state: {
          init: () => ({ history: null, decorations: DecorationSet.empty }),
          apply(tr, value, _previous, state) {
            const meta = tr.getMeta(lineHistoryKey) as { history: LineHistoryState } | undefined;
            const history = meta ? meta.history : value.history;
            if (!meta && !tr.docChanged) return value;
            return { history, decorations: decorations(state.doc, history) };
          },
        },
        props: {
          decorations: (state) => lineHistoryKey.getState(state)?.decorations,
          attributes: (state): Record<string, string> => (lineHistoryKey.getState(state)?.history ? { class: "line-history-on" } : {}),
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
