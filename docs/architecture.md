# Architecture

The backend is a modular monolith. Docker PostgreSQL is the only live system of record; Vue, SwiftUI, and the Chrome extension are API clients and do not own domain state. A remote backup database (currently Neon) is an hourly, explicitly designated backup target refreshed by scheduled `pg_dump`/`pg_restore`; it is not an application datasource, read replica, or automatic failover target. UUID ownership columns and authenticated repository lookups prevent cross-user access. Flyway migrations are the schema contract.

The first vertical slice is authentication and paths. Reusable session labels, notes, activities, timers, and statistics build on the same user boundary and versioned `/api/v1` API.

Boards are a separate user-owned aggregate. PostgreSQL stores boards, ordered
statuses, cards, path relationships, and label relationships in the plural
`boards`/`board_*` tables introduced by `V43__boards.sql`. The service keeps
board ownership checks at every nested lookup, stores card bodies as the same
Tiptap-compatible JSON used by notes, and treats date ranges as inclusive. The
web client is the first board client; iOS parity is intentionally deferred.

Signed-in web sessions warm up the other pages in the background
(`frontend/src/lib/warmup.ts`): every lazy route chunk is preloaded, and the
default view of Sessions, Paths, Labels, Notes, Calendar, Reports, Logs, and
the Board page (the board list, the board it will open, and that board's Gantt
window) is fetched into the Pinia caches those pages already read, so a warmed
page opens without a request. To keep reloads, tabs, and test browsers from flooding the
API, data warm-up waits 3 s plus browser idle on a visible tab, sends one
request at a time with a 250 ms gap (about ten requests plus one per column of
the warmed board), skips caches the
open page already filled, stops at the first failure, and runs at most once per
10 minute cooldown stored in `localStorage` (`know_warmup_at`, cleared on
sign-out). It is off for automated browsers (`navigator.webdriver`), Save-Data,
`VITE_WARMUP=off` builds, and `localStorage.know_warmup = "off"`; `"force"`
turns it on for browser tests. Board data is cached without selecting a board,
so the Board page still restores the saved board itself. Acceptance:
`docs/warmup-cache-acceptance-checklist.md`.

Kanban and Gantt share one Pinia card collection. Gantt is a date-window
projection of active Kanban cards, while local create/edit/move/archive/restore
operations reconcile both views immediately. Board-list, board-load, page,
Gantt, move, and card-edit requests use revisions so late responses cannot
overwrite newer selected-board state. A failed lazy page stops automatic
retries and exposes an explicit retry action; card-save failures preserve the
editor draft. Card updates carry the last observed `updatedAt` as an optimistic
concurrency precondition; stale tab writes receive `409`, refresh the latest
card, and leave the user’s draft open for an explicit retry. Card timestamps are
normalized to PostgreSQL microsecond precision so a same-tab save is not falsely
classified as stale.

Timer synchronization uses a hybrid model. REST commands (`start`, `stop`, `cancel`, and
`configure`) mutate the server-owned timer in PostgreSQL. After a successful transaction,
the backend publishes a user-scoped full timer snapshot over the native `/ws/timers`
WebSocket. Connected clients update directly from that snapshot and do not issue a
follow-up `/timers/current` request for each event. Web clients fall back to two-second
polling when the socket is unavailable; the extension retains its polling implementation
for compatibility. Clients should also refresh from `/timers/current` on initial load and
reconnect; the web client refreshes on focus or tab visibility only while the socket is
down. The server pings authenticated sockets every 30 seconds so idle proxies such as
Cloudflare keep them open. Every proxy that serves the web app must route `/ws/*` to the
API. The elapsed clock is derived locally from the
server-provided `startedAt`; timer existence and ownership remain server-authoritative.
