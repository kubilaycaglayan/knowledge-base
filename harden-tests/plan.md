# Test hardening plan

## Purpose

Make gaps and recurring failures visible across the Knowledge Base backend, web client, extension, and disposable deployed-shaped stack. Preserve PostgreSQL as the system of record and use the Docker-centered workflow for repeatable integration and browser runs.

## Implementation and acceptance criteria

Detailed executable task lists and acceptance evidence are maintained in
[the hardening milestones](milestones/README.md). Keep this document as the
summary status; update both the summary and milestone status when work lands.

### Durable inventory and run records

- [x] Add a root `harden-tests/` index, this plan, and a run-record directory.
- [x] Define the required E2E report fields and failure-group workflow.
- [ ] Record every desktop Chromium and emulated iPhone WebKit pass separately, including the commit, Compose project, image references, outcomes, failures, and artifact/log links.
- [ ] Maintain cumulative failure counts and revise classifications after root-cause investigation.

See [HARD-07: Durable run evidence and plan consistency](milestones/07-run-evidence-and-plan-hygiene.md)
for completion criteria, including reconciliation of the existing run records.

### Browser acceptance

- Existing real-stack suites exercise board creation/edits/pagination and delayed responses, note/card version conflicts and retry, timer WebSocket reconnect behavior, and session continuity. Existing fixture suites cover navigation, accessibility, and mobile viewport behavior.
- [x] Add selectable desktop Chromium and emulated iPhone WebKit profiles with touch emulation to the existing real-stack browser suites.
- [x] Run desktop Chromium and emulated iPhone WebKit real-stack journeys for board/card edits, pagination, note conflicts, timer sync/fallback, delayed board responses, and session restoration; keep reports separate by browser profile.
- [x] Confirm the existing real-stack suites support mobile-size Chromium by combining `BROWSER_ENGINE=chromium` with `BROWSER_PROFILE=iphone`; report it as mobile Chromium emulation, not physical Android Chrome.
- [x] Run and record a mobile-size Chromium profile separately from desktop Chromium and iPhone WebKit, with engine, viewport, touch, scale factor, and machine details.
- [x] Complete global search and direct deep-link journeys across the route
  matrix. The HARD-01 real-stack suite passes in desktop Chromium, mobile-size
  Chromium, and iPhone WebKit; archived routes, ownership, URL states, and
  error recovery are recorded in its acceptance checklist and run reports at
  commit `1978af6`.
- [ ] Expand explicit empty and long-content, delayed-response, network-failure, and retry states across the remaining journeys. Existing coverage includes delayed board responses, timer HTTP fallback, and note retry.

See [HARD-01](milestones/01-browser-journeys.md) and
[HARD-02](milestones/02-browser-resilience.md) for route-by-route tasks,
failure-state requirements, and acceptance evidence.

### Backend integration

- Existing H2 integration coverage includes malformed and oversized input, ownership, stale note versions, and API behavior. The `backend-postgres` CI job now runs the complete integration suite against a guarded PostgreSQL 16 database and repeats the search suite against its migrated schema.
- [x] Complete HARD-03 PostgreSQL behavior that H2 cannot represent. The final run passed 443 PostgreSQL tests; the source-by-source transaction audit and rollback coverage are recorded in the [HARD-03 checklist](milestones/03-acceptance-checklist.md) and [run evidence](runs/2026-10-08-hard03-postgres.md).
- [x] Keep PostgreSQL tests isolated to an empty disposable database migrated by Flyway; do not point test jobs at persistent data.
- [x] Complete application authentication rate-limit coverage, including HTTP responses and proxy identity behavior; see [HARD-04](milestones/04-rate-limits-and-security.md).

See [HARD-03](milestones/03-postgres-and-boundaries.md) for database-sensitive
areas, deterministic time cases, scale coverage, and disposable-database gates.
See [HARD-04](milestones/04-rate-limits-and-security.md) for HTTP limiter and
Cloudflare policy verification. HARD-04 is complete: request-level auth
budgets, deterministic limiter boundaries, proxy identity behavior, semantic
WAF route contracts, and desktop/mobile-size Chromium recovery are covered.
Cloudflare live enforcement and production replica count remain unverified;
see the [acceptance checklist](milestones/04-acceptance-checklist.md) and
[separate run reports](runs/).

### Performance

- [ ] Measure fixed-data startup, search, board paging, Gantt, reports, note save, timer, and WebSocket journeys and their API requests with explicit boundaries and raw samples.
- [ ] Keep desktop Chromium, mobile-size Chromium emulation, and iPhone WebKit in separate result populations; capture current machine load and runtime/image metadata for every run.
- [ ] Keep initial baselines report-only. Consider a 20% gate only after comparable repeated batches establish variance and a documented absolute floor, refresh, rerun, and override policy.

See [HARD-05](milestones/05-performance-baselines.md) for fixture sizes,
journeys, environment fields, and gate promotion criteria.

### Docker lifecycle and cleanup

- Existing `scripts/test-run-all.sh` builds once and reuses one unique stack across smoke and real-stack browser suites in a run.
- [ ] For longer reuse windows, retain the uniquely named test stack only for the planned window and record its project and image IDs/tags.
- [x] Preserve project-scoped cleanup. Never use global prune commands; protect active container images, shared development images, protected volumes, and named reusable tags. Retain the newest three disposable build tags.

### iOS workflow

- [x] Retain native iOS source and both workflow job definitions, but use unconditional `if: ${{ false }}` so repository variables cannot enable them.
- [x] Remove variable-based enablement instructions. Keep historical iOS docs and source available.

See [HARD-06](milestones/06-ios-validation.md) for a supported automated or
manual simulator validation path. Until that work is completed, disabled
workflow jobs must not be counted as active iOS CI coverage.

## Acceptance

The full acceptance set is listed in `README.md` and the repository's testing guidance. At minimum, run the existing unit/integration suites, web build, extension tests, accessibility/security/cleanup checks, and disposable full-stack smoke. Run and record desktop Chromium, mobile-size Chromium emulation, and iPhone WebKit as distinct browser profiles for the journeys that support them. Store baseline measurements first without failing builds; promote the 20% gate only after repeatable observations support it.
