# Architecture

The backend is a modular monolith. Docker PostgreSQL is the only live system of record; Vue, SwiftUI, and the Chrome extension are API clients and do not own domain state. Neon is an hourly, explicitly designated backup target refreshed by scheduled `pg_dump`/`pg_restore`; it is not an application datasource, read replica, or automatic failover target. UUID ownership columns and authenticated repository lookups prevent cross-user access. Flyway migrations are the schema contract.

The first vertical slice is authentication and paths. Reusable session labels, notes, activities, timers, and statistics build on the same user boundary and versioned `/api/v1` API.

Boards are a separate user-owned aggregate. PostgreSQL stores boards, ordered
statuses, cards, path relationships, and label relationships in the plural
`boards`/`board_*` tables introduced by `V43__boards.sql`. The service keeps
board ownership checks at every nested lookup, stores card bodies as the same
Tiptap-compatible JSON used by notes, and treats date ranges as inclusive. The
web client is the first board client; iOS parity is intentionally deferred.

Kanban and Gantt share one Pinia card collection. Gantt is a date-window
projection of active Kanban cards, while local create/edit/move/archive/restore
operations reconcile both views immediately. Board-list, board-load, page,
Gantt, move, and card-edit requests use revisions so late responses cannot
overwrite newer selected-board state. A failed lazy page stops automatic
retries and exposes an explicit retry action; card-save failures preserve the
editor draft.

Timer synchronization uses a hybrid model. REST commands (`start`, `stop`, `cancel`, and
`configure`) mutate the server-owned timer in PostgreSQL. After a successful transaction,
the backend publishes a user-scoped full timer snapshot over the native `/ws/timers`
WebSocket. Connected clients update directly from that snapshot and do not issue a
follow-up `/timers/current` request for each event. Web clients fall back to two-second
polling when the socket is unavailable; the extension retains its polling implementation
for compatibility. Clients should also refresh from `/timers/current` on initial load,
reconnect, and mobile foreground/resume. The elapsed clock is derived locally from the
server-provided `startedAt`; timer existence and ownership remain server-authoritative.
