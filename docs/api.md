# API

The API is rooted at `/api/v1`. Public endpoints are `POST /auth/register`, `POST /auth/login`, and `POST /auth/google`, returning a bearer JWT. Google login accepts a Google Identity Services ID token; the API verifies its signature, audience, issuer, and verified email before linking or creating the account. Clients send `Authorization: Bearer <token>`.

Interactive OpenAPI documentation is available at `/swagger-ui.html`; the machine-readable contract is at `/v3/api-docs`.

Authenticated endpoints currently include:

- `GET/POST /paths`, `GET/PUT/DELETE /paths/{id}`; delete is a soft delete that records `deleted_at`, removes the path from normal API results, and preserves its historical database references.
- Archived paths remain readable for history but cannot receive new item memberships or time entries; editing an item may retain an existing archived-path membership.
- `GET /paths/{id}/summary` returns associated item IDs, their current progress, accumulated tracked seconds (including a running timer), and recent path activity; the web client supports filtering the associated items and merges completed timer start/stop events into one activity with its duration, description, and item.
- `GET/POST /items`, `PUT /items/{id}`, and `POST/GET /items/{id}/progress`. Items include an optional `source` string for a link or origin note.
- `GET/POST /notes`, `PUT /notes/{id}`, and `GET /activities`; notes accept exactly one optional `pathId`, `itemId`, or `activityId` target.
- `GET /timers/current`, `POST /timers`, `PUT /timers/{id}`, `POST /timers/stop`, `POST /timers/cancel`, and `POST /time-entries`. Paths and items are independent timer targets: any owned item can be selected with any owned active path, whether or not the item has a `path_item` membership. `PUT /timers/{id}` edits the start time, path, item, and description of the owned running timer; an optional end time stops it at that time and records the resulting duration. Cancellation removes an active timer without recording time.
- `GET /time-entries` lists owned history, `PUT /time-entries/{id}` edits completed entries, and `DELETE /time-entries/{id}` soft-deletes a completed session while preserving its database history.
- `GET /statistics` for tracked seconds, current-day and rolling-week path/item aggregates, completion counts, and recent progress changes.
- `GET /reports?period=WEEK|MONTH|YEAR&anchor=YYYY-MM-DD` for a day-by-day report with total time and path/item categories for the selected period. Weeks use Monday through Sunday in UTC; the anchor date may be any date in the requested period.
- `GET /search?q=...` searches owned paths, items, note title/content, and recent activity.
- `GET /activities` accepts optional `from`, `to`, `pathId`, `itemId`, and `type` filters.
- `POST /imports/clockify` accepts a Clockify export’s `timeentries` array, maps `projectName` values to owned paths (creating missing paths), stores completed entries as `IMPORT`, records an import batch, and skips already imported `_id` values. `GET /imports/clockify/batches` lists recent owned batches, including legacy imported entries backfilled during migration, and `DELETE /imports/clockify/batches/{id}` undoes the imported time entries and activity records for that batch.

All resource lookups are scoped by the authenticated user. A user can have at most one running timer, enforced by both a service check and a PostgreSQL partial unique index.

Unauthenticated or invalid bearer requests receive HTTP 401; authenticated users attempting to reference another user’s resources receive a resource-not-found response rather than cross-user data.
