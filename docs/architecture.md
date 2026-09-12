# Architecture

The backend is a modular monolith. PostgreSQL is the system of record; Vue, SwiftUI, and the Chrome extension are API clients and do not own domain state. UUID ownership columns and authenticated repository lookups prevent cross-user access. Flyway migrations are the schema contract.

The first vertical slice is authentication and paths. Reusable session labels, notes, activities, timers, and statistics build on the same user boundary and versioned `/api/v1` API.

Timer synchronization uses a hybrid model. REST commands (`start`, `stop`, `cancel`, and
`configure`) mutate the server-owned timer in PostgreSQL. After a successful transaction,
the backend publishes a user-scoped full timer snapshot over the native `/ws/timers`
WebSocket. Connected clients update directly from that snapshot and do not issue a
follow-up `/timers/current` request for each event. Web clients fall back to two-second
polling when the socket is unavailable; the extension retains its polling implementation
for compatibility. Clients should also refresh from `/timers/current` on initial load,
reconnect, and mobile foreground/resume. The elapsed clock is derived locally from the
server-provided `startedAt`; timer existence and ownership remain server-authoritative.
