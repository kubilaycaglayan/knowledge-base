# API

The API is rooted at `/api/v1`. Public endpoints are `POST /auth/register`, `POST /auth/login`, and `POST /auth/google`, returning a bearer JWT. Google login accepts a Google Identity Services ID token; the API verifies its signature, audience, issuer, and verified email before linking or creating the account. Clients send `Authorization: Bearer <token>`.

Interactive OpenAPI documentation is available at `/swagger-ui.html`; the machine-readable contract is at `/v3/api-docs`.

Authenticated endpoints currently include:

- `GET/POST /paths`, `GET/PUT/DELETE /paths/{id}`; delete archives rather than removing history.
- Archived paths remain readable for history but cannot receive new item memberships or time entries; editing an item may retain an existing archived-path membership.
- `GET /paths/{id}/summary` returns associated item IDs, their current progress, accumulated tracked seconds (including a running timer), and recent path activity; the web client supports filtering the associated items.
- `GET/POST /items`, `PUT /items/{id}`, and `POST/GET /items/{id}/progress`.
- `GET/POST /notes`, `PUT /notes/{id}`, and `GET /activities`; notes accept exactly one optional `pathId`, `itemId`, or `activityId` target.
- `GET /timers/current`, `POST /timers`, `PUT /timers/{id}`, `POST /timers/stop`, `POST /timers/cancel`, and `POST /time-entries`. `PUT /timers/{id}` edits the start time, path, item, and description of the owned running timer. Cancellation removes an active timer without recording time.
- `GET /time-entries` lists owned history and `PUT /time-entries/{id}` edits completed entries.
- `GET /statistics` for tracked seconds, current-day path/item aggregates, completion counts, and recent progress changes.
- `GET /search?q=...` searches owned paths, items, note title/content, and recent activity.
- `GET /activities` accepts optional `from`, `to`, `pathId`, `itemId`, and `type` filters.
- `POST /imports/clockify` accepts a Clockify export’s `timeentries` array, maps `projectName` values to owned paths (creating missing paths), stores completed entries as `IMPORT`, and skips already imported `_id` values.

All resource lookups are scoped by the authenticated user. A user can have at most one running timer, enforced by both a service check and a PostgreSQL partial unique index.

Unauthenticated or invalid bearer requests receive HTTP 401; authenticated users attempting to reference another user’s resources receive a resource-not-found response rather than cross-user data.
