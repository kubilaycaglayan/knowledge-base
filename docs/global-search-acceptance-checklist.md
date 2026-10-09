# Global search acceptance checklist

Global search finds any owned record from any page and opens it at its own
address. Automated coverage: `SearchIntegrationTest` (H2) and
`SearchPostgresIntegrationTest` (PostgreSQL, opt-in), `SearchApiTest`,
`GlobalSearch.test.ts`, `search.test.ts`, `DeepLinks.test.ts`, and the smoke
test.

## Opening and closing

- [x] **GS-01** ⌘K on Apple platforms and Ctrl+K elsewhere open global search on every signed-in page, including while typing in a field; the browser's own shortcut is suppressed.
- [x] **GS-02** The header Search button opens it too and names the shortcut; on phones it is a 44px icon button and the dialog fills the screen.
- [x] **GS-03** Escape, the Close button, the backdrop, or the shortcut again (from the field) closes it; focus returns to where it was, and the page behind does not scroll while it is open.
- [x] **GS-04** Following any result, or any other navigation, closes it.

## Searching

- [x] **GS-05** Typing waits 150 ms before searching; an older answer arriving after a newer one is ignored and the older request is cancelled.
- [x] **GS-06** Every word has to match. Case does not matter, word parts match ("kube" finds "Kubernetes"), and `%`, `_`, `\`, and quotes are plain text.
- [x] **GS-07** Sessions, logs, notes, cards, and calendar days also match through their labels; sessions, notes, and cards through their path. Those results show "Label: …" or "Path: …" and rank below direct matches.
- [x] **GS-08** When nothing matches literally, near-miss spellings of words of four or more letters are shown under "No exact matches … Showing similar spellings."
- [x] **GS-09** Archived notes, cards, and boards appear with an Archived badge; deleted sessions, logs, and paths never appear.
- [x] **GS-10** Another user's records, labels, and paths never cause a match.

## Results

- [x] **GS-11** Results are grouped (Paths, Boards, Labels, Notes, Cards, Logs, Sessions, Calendar days) with counts ("1,000+" when capped); matching pages come first, then Cards, then the remaining groups in API order.
- [x] **GS-12** Matches are highlighted in titles and snippets; long titles and snippets are clipped with an ellipsis, and multi-line text shows " · " between lines.
- [x] **GS-13** "Show N more …" loads up to 20 more of that type in place and moves the keyboard to the first new result.
- [x] **GS-14** Arrow keys (wrapping) and Page Up/Down move through results; Enter opens; ⌘/Ctrl+Enter or a modified click opens a new tab; results are real links.
- [x] **GS-15** Empty, error (with Try again), over-length, and timed-out states each explain themselves; a polite live region announces the result count.
- [x] **GS-16** Recent searches (six, in this browser only) are offered when the field is empty and can be cleared; blocked storage is ignored.

## Addresses

- [x] **GS-17** `/sessions/:id` shows the session over the Sessions page whichever page it is on, with Edit (end must follow start), Remove…, Start again, and an unsaved-changes prompt; a running session is read-only; a missing one says so.
- [x] **GS-18** `/logs/:id` shows the log with its labels, Edit (⌘/Ctrl+Enter saves, conflicts are retried on the latest version), Remove…, and Show in list (jumps to its page and marks it).
- [x] **GS-19** `/paths/:id` and `/labels/:id` open their history dialogs; closing returns to the list and keeps its filter. A path outside the loaded list is fetched; a missing one says so.
- [x] **GS-20** `/calendar?date=YYYY-MM-DD` opens that month with the day selected, and the selected day stays in the address; impossible dates are ignored.
- [x] **GS-21** Archived notes open `/notes?archived=1&q=<title>`; archived cards and boards open `/board/archive` with the row scrolled to and marked.
- [x] **GS-22** Log times and session dates in their lists link to the record's address.
- [x] **GS-23** Logs, Labels, and the Board card search use `/` (outside text fields and dialogs) for their own filters.
- [x] **GS-24** Typing a main page's name (or the start of any word in it, e.g. `board`, `arch`, `home`) lists it under Pages above the record results; Cards follow Pages and precede other record groups. The best page is active at once, so Enter goes there even before the record search answers. Page jumps aren't saved as recent searches.
