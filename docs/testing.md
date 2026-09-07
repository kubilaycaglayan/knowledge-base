# Testing

Native authentication, path/item creation, and item-note form fields expose stable accessibility identifiers for Xcode UI tests; UI-test launches provide deterministic signed-out and authenticated fixture modes, and the source-level contract verifies the app identifiers, `KnowUITests` references, and declarative Xcode UI-test target in CI.

The backend has domain, service, and MockMvc API tests for progress transitions, timer duration, ownership, invalid/unauthorized authentication, Google ID-token login/linking boundaries, Clockify import mapping, idempotency, batch listing, and undo, malformed-request handling, authentication rate limiting, configured/unconfigured CORS preflights, request-size validation, item validation, note validation, activity filter parsing, independent owned timer path/item targets, active timer reconfiguration and edited end times, bounded search input, bounded path/item/note/activity search results and PostgreSQL trigram search indexes, bulk item relationship loading, scoped item-membership replacement, bounded database activity search and timeline page size, case-insensitive email uniqueness, duplicate timers, cancellation, completion activity generation, single-query overlap-aware UTC-range statistics covering the entire current month while keeping weekly totals narrow, clipping boundary-crossing sessions to each reporting window, current-day and rolling-week path/item breakdowns, note ownership, and scoped live path summaries that exclude explicitly different-path records through bounded repository queries. Web component tests cover session timer flows, including choosing any owned item for the selected path. The smoke path exercises the authenticated API against PostgreSQL and covers migrations, OpenAPI availability, cross-user access denial, paths, multi-path items, independent path/item timer targeting, addable/updateable item types, Clockify import with duplicate protection, automatic path creation, batch listing, and undo, progress, notes, activity search, combined date/item timeline filters, timers including active reconfiguration, manual/editable time entries, summaries with tracked-duration assertions, statistics, and optional backup restoration into a separate database.

The web has Vitest coverage for authentication success/failure, path-content filtering, timeline date presets and activity-note composition, independent timer path/item choices, and server-backed timer start/cancellation in addition to the TypeScript compiler and Vite production build. Extension core state/request helpers have Node test coverage, including canonical server timer-state decisions and text-safe option rendering, alongside script, manifest, accessibility-contract, and Caddy configuration validation. The iOS API transport and app model have deterministic response, authentication-expiry, transient-network retry/offline, refresh-error, and native timer path/item selection tests; critical native controls also have source-level accessibility-identifier contracts. CI runs these checks plus the Docker smoke test on Ubuntu and native Swift syntax, unit, and build checks on macOS. Full SwiftUI UI-test execution requires an Xcode UI-test target and a macOS runner. OpenAPI availability is verified in development/smoke configuration; the production Spring profile disables Swagger UI and the machine-readable API docs.

Local verification:

The overview uses an opt-in workspace shell and flat prompt appearance. Component
regressions verify that other routes and signed-out authentication retain their
existing shell, and that the overview restores the document title and theme color
when unmounted. Timer/API regression coverage remains unchanged.

For overview UI smoke review, use isolated fixture data or a disposable account:

1. Check 320px and 390px mobile, 1024px laptop, 1440px desktop, and 2560px wide
   layouts with empty data, populated history, an active timer, very long path/item
   names, and a failed initial request. Confirm no horizontal page overflow.
2. Tab to Skip to content, activate it, and verify main-content focus. Use the item
   selector with arrow keys, Enter, and Escape. Check visible focus, selected recent
   paths, disabled item creation, and readable labels.
3. Start and stop a timer, search knowledge, and open a time-entry edit prompt.
   Check the existing prompt keyboard shortcuts and visible form focus.
4. Visit the other routes and sign out to confirm the workspace styling is absent.
5. Run an axe WCAG 2 A/AA and 2.1 AA scan on empty, populated, and active-timer
   overview states and the open prompt. Browser fixtures verify rendering and
   interaction wiring; they do not replace the PostgreSQL/API smoke tests below.

Smoke verification exercises both configured/unconfigured API CORS preflights on the development web origin `http://localhost:5177`; full-stack mode waits for the Caddy HTTPS endpoint before exercising the public proxy. Smoke uses isolated host ports by default (`15432` for PostgreSQL and `18081` for the API; full-stack mode adds `18080`/`18443` for the public proxy and `18000` for the HTTP convenience mapping); override `DB_DEV_PORT`, `API_DEV_PORT`, `PROXY_DEV_PORT`, `PROXY_HTTP_PORT`, or `PROXY_HTTPS_PORT` when needed. Its exit trap removes only the smoke project’s containers, volumes, local images, exact temporary Buildx builder, and `mktemp` backup directory; it does not run a host-wide Docker prune.

Smoke runs require Docker Buildx and clean up their Compose project containers, Compose-managed named volumes, local service images, and uniquely named temporary Buildx builders on exit. GitHub Actions runs reuse its remote BuildKit cache; locally, set `SMOKE_BUILD_CACHE_DIR` to a caller-owned persistent directory to reuse BuildKit layers between runs. Neither cache is removed by the smoke cleanup. The script creates a unique `knowledge-base-smoke-*` project name when one is not supplied; a supplied `COMPOSE_PROJECT_NAME` must contain `smoke`. Use distinct smoke project names when running concurrent checks.

The API smoke flow also exercises optional calendar-label creation, a dated record, and a multi-day calendar range before loading the authenticated monthly reports endpoint; calendar labels are asserted separately from current-month tracked-time entries, including the report’s daily timeline and path breakdown fields.

```bash
docker run --rm -v "$PWD/backend:/app" -w /app gradle:8.13-jdk21 gradle test --no-daemon
(cd frontend && npm ci && npm test && npm run build)
cd chrome-extension && npm ci && npm test && npm run build && cd ..
JWT_SECRET='<at-least-32-characters>' POSTGRES_PASSWORD='<local-password>' ./scripts/run-smoke-tests.sh
SMOKE_FULL_STACK=1 COMPOSE_PROJECT_NAME=knowledge-base-full-smoke JWT_SECRET='<at-least-32-characters>' POSTGRES_PASSWORD='<local-password>' ./scripts/run-smoke-tests.sh
SMOKE_BACKUP_RESTORE=1 COMPOSE_PROJECT_NAME=knowledge-base-backup-smoke JWT_SECRET='<at-least-32-characters>' POSTGRES_PASSWORD='<local-password>' ./scripts/run-smoke-tests.sh
```
