# Testing

The backend has domain, service, and MockMvc API tests for progress transitions, timer duration, ownership, invalid/unauthorized authentication, malformed-request handling, authentication rate limiting, request-size validation, item validation, timer source/target boundaries, bounded search input, bulk item relationship loading, scoped item-membership replacement, bounded database activity search, case-insensitive email uniqueness, duplicate timers, cancellation, completion activity generation, single-query UTC-range statistics, note ownership, and scoped live path summaries. The smoke path exercises the authenticated API against PostgreSQL and covers migrations, OpenAPI availability, cross-user access denial, paths, multi-path items, tags, bulk item listing, progress, notes, activity search, combined date/item timeline filters, timers, manual/editable time entries, summaries with tracked-duration assertions, statistics, and optional backup restoration into a separate database.

The web has Vitest coverage for authentication success/failure, path-content filtering, timeline date presets, and server-backed timer start/cancellation in addition to the TypeScript compiler and Vite production build. Extension core state/request helpers have Node test coverage, including canonical server timer-state decisions and text-safe option rendering, alongside script, manifest, accessibility-contract, and Caddy configuration validation. The iOS API transport and app model have deterministic response, authentication-expiry, transient-network retry/offline, and refresh-error tests; critical native controls also have source-level accessibility-identifier contracts. CI runs these checks plus the Docker smoke test on Ubuntu and native Swift syntax, unit, and build checks on macOS. Full SwiftUI UI-test execution requires an Xcode UI-test target and a macOS runner.

Local verification:

```bash
docker run --rm -v "$PWD/backend:/app" -w /app gradle:8.13-jdk21 gradle test --no-daemon
(cd frontend && npm ci && npm test && npm run build)
node --test chrome-extension/core.test.js
JWT_SECRET='<at-least-32-characters>' POSTGRES_PASSWORD='<local-password>' ./scripts/smoke.sh
SMOKE_FULL_STACK=1 COMPOSE_PROJECT_NAME=know-full-smoke JWT_SECRET='<at-least-32-characters>' POSTGRES_PASSWORD='<local-password>' ./scripts/smoke.sh
SMOKE_BACKUP_RESTORE=1 COMPOSE_PROJECT_NAME=know-backup-smoke JWT_SECRET='<at-least-32-characters>' POSTGRES_PASSWORD='<local-password>' ./scripts/smoke.sh
```
