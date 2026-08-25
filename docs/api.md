# API

The API is rooted at `/api/v1`. Public endpoints are `POST /auth/register` and `POST /auth/login`, returning a bearer JWT. Clients send `Authorization: Bearer <token>`.

Interactive OpenAPI documentation is available at `/swagger-ui.html`; the machine-readable contract is at `/v3/api-docs`.

Authenticated endpoints currently include:

- `GET/POST /paths`, `GET/PUT/DELETE /paths/{id}`; delete archives rather than removing history.
- Archived paths remain readable for history but cannot receive new item memberships or time entries; editing an item may retain an existing archived-path membership.
- `GET /paths/{id}/summary` returns associated item IDs, their current progress, accumulated tracked seconds (including a running timer), and recent path activity; the web client supports filtering the associated items.
- `GET/POST /items`, `PUT /items/{id}`, and `POST/GET /items/{id}/progress`.
- `GET/POST /notes`, `PUT /notes/{id}`, and `GET /activities`; notes accept exactly one optional `pathId`, `itemId`, or `activityId` target.
- `GET /timers/current`, `POST /timers`, `POST /timers/stop`, `POST /timers/cancel`, and `POST /time-entries`. Cancellation removes an active timer without recording time.
- `GET /time-entries` lists owned history and `PUT /time-entries/{id}` edits completed entries.
- `GET /statistics` for tracked seconds, current-day path/item aggregates, completion counts, and recent progress changes.
- `GET /search?q=...` searches owned paths, items, note title/content, and recent activity.
- `GET /activities` accepts optional `from`, `to`, `pathId`, `itemId`, and `type` filters.

All resource lookups are scoped by the authenticated user. A user can have at most one running timer, enforced by both a service check and a PostgreSQL partial unique index.

Unauthenticated or invalid bearer requests receive HTTP 401; authenticated users attempting to reference another user’s resources receive a resource-not-found response rather than cross-user data.
