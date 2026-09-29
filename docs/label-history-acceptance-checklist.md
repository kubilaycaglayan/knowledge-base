# Label history acceptance checklist

Each label on the Labels page has a History icon button that opens a dialog
about how the label has been used: when it was first (and last) used, how often
it is used over time with tracked hours on a monthly timeline, which hours of
the day it is used in, and which other labels it is used together with. The
server computes the history from the owner's sessions, logs, notes, calendar
days, and board cards so every client can show the same numbers. Each item
names the tests that cover it. Tick an item only once those tests pass.

## API

- [x] **LH-01** `GET /api/v1/labels/{id}/history` returns the label's `labelId`, `name`, and `color` with `firstUsedAt`, `lastUsedAt`, `totalUses`, `trackedSeconds`, and `uses` counts for `sessions`, `logs`, `notes`, `calendarDays`, and `cards`. A use happens at a session's start, a log's `occurredAt`, a note's or card's creation time, or the start of a calendar day. Tracked seconds are the label's sessions' durations (a running session counts up to now).
  _Tests:_ `LabelHistoryIntegrationTest.historySummarisesEveryKindOfUse`
- [x] **LH-02** An unused label returns `null` first/last use, zero counts, an empty `timeline`, 24 empty `hours`, and no `related` labels.
  _Tests:_ `LabelHistoryIntegrationTest.unusedLabelHasAnEmptyHistory`
- [x] **LH-03** `timeline` lists every month (`YYYY-MM`) from the first use through the current month (at most the latest 36 months) with `uses` and `trackedSeconds`; `hours` lists hours 0–23 with `uses` and the tracked seconds that fell in that hour. Months and hours use the optional IANA `zone` query parameter (default UTC); an unknown zone returns `400`.
  _Tests:_ `LabelHistoryIntegrationTest.timelineAndHoursUseTheRequestedZone`, `LabelHistoryIntegrationTest.unknownZoneIsRejected`
- [x] **LH-04** `related` lists other labels used on the same session, log, note, calendar day, or card, with `id`, `name`, `color`, `together` (shared uses), and `trackedSeconds` (shared session time), most shared first, at most 12.
  _Tests:_ `LabelHistoryIntegrationTest.relatedLabelsCountSharedUses`
- [x] **LH-05** History is scoped to the owner: another user's label returns `404`. Deleted sessions and archived notes do not count.
  _Tests:_ `LabelHistoryIntegrationTest.historyIsScopedToItsOwner`, `LabelHistoryIntegrationTest.deletedSessionsAndArchivedNotesDoNotCount`

## Web

- [x] **LH-06** Every label row on the Labels page has an icon-only History button (`aria-label` “Show history of <name>”) that opens a History dialog for that label, requesting `/labels/{id}/history` with the browser's time zone.
  _Tests:_ `LabelsView.test.ts` "opens a label's history from its icon button"
- [x] **LH-07** The dialog shows the first and last use as locale-formatted dates, total uses, tracked hours, and uses per kind; a monthly timeline of tracked hours with use counts; and an hour-of-day chart. Charts have text alternatives.
  _Tests:_ `LabelHistoryDialog.test.ts` "shows first use, totals, the timeline, and hours"
- [x] **LH-08** The dialog lists related labels with their color, shared uses, and shared hours; each opens that label's history. An unused label shows “Not used yet”.
  _Tests:_ `LabelHistoryDialog.test.ts` "lists related labels and switches to one", `LabelHistoryDialog.test.ts` "shows an empty state for an unused label"
- [x] **LH-09** The dialog closes with Esc, the backdrop, or its close button, and a failed load shows an error with Retry.
  _Tests:_ `LabelHistoryDialog.test.ts` "closes with Escape and the close button", `LabelHistoryDialog.test.ts` "retries after a failed load"
- [x] **LH-10** `docs/api.md` documents the endpoint; the roadmap notes that iOS does not show label history yet.
  _Tests:_ smoke `run-smoke-tests.sh` (history of the smoke calendar label on PostgreSQL)
