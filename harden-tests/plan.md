# Test hardening plan

## Purpose

Make gaps and recurring failures visible across the Knowledge Base backend, web client, extension, and disposable deployed-shaped stack. Preserve PostgreSQL as the system of record and use the Docker-centered workflow for repeatable integration and browser runs.

## Implementation and acceptance criteria

### Durable inventory and run records

- [x] Add a root `harden-tests/` index, this plan, and a run-record directory.
- [x] Define the required E2E report fields and failure-group workflow.
- [ ] Record every desktop Chromium and emulated iPhone WebKit pass separately, including the commit, Compose project, image references, outcomes, failures, and artifact/log links.
- [ ] Maintain cumulative failure counts and revise classifications after root-cause investigation.

### Browser acceptance

- Existing real-stack suites exercise board creation/edits/pagination and delayed responses, note/card version conflicts and retry, timer WebSocket reconnect behavior, and session continuity. Existing fixture suites cover navigation, accessibility, and mobile viewport behavior.
- [x] Add selectable desktop Chromium and emulated iPhone WebKit profiles with touch emulation to the existing real-stack browser suites.
- [x] Run desktop Chromium and emulated iPhone WebKit real-stack journeys for board/card edits, pagination, note conflicts, timer sync/fallback, delayed board responses, and session restoration; keep reports separate by browser profile.
- [ ] Add global search and direct deep-link journeys to both profiles.
- [ ] Expand explicit empty and long-content, delayed-response, network-failure, and retry states across the remaining journeys. Existing coverage includes delayed board responses, timer HTTP fallback, and note retry.

### Backend integration

- Existing H2 integration coverage includes malformed and oversized input, ownership, stale note versions, and API behavior; PostgreSQL search has a dedicated opt-in integration test.
- [ ] Expand coverage for rate limits, time boundaries, empty and large result sets, and PostgreSQL behavior that H2 cannot represent. Existing tests cover stale note/card versions and concurrent board writes.
- [ ] Keep PostgreSQL tests isolated to an empty disposable database migrated by Flyway; do not point test jobs at persistent data.

### Performance

- [ ] Measure fixed-data browser journeys and API routes and record inputs, environment, and results in each run report.
- [ ] Keep the initial baseline report-only. Enable a 20% regression gate only after repeat runs establish a stable baseline; document noise and rerun policy.

### Docker lifecycle and cleanup

- Existing `scripts/test-run-all.sh` builds once and reuses one unique stack across smoke and real-stack browser suites in a run.
- [ ] For longer reuse windows, retain the uniquely named test stack only for the planned window and record its project and image IDs/tags.
- [x] Preserve project-scoped cleanup. Never use global prune commands; protect active container images, shared development images, protected volumes, and named reusable tags. Retain the newest three disposable build tags.

### iOS workflow

- [x] Retain native iOS source and both workflow job definitions, but use unconditional `if: ${{ false }}` so repository variables cannot enable them.
- [x] Remove variable-based enablement instructions. Keep historical iOS docs and source available.

## Acceptance

The full acceptance set is listed in `README.md` and the repository's testing guidance. At minimum, run the existing unit/integration suites, web build, extension tests, accessibility/security/cleanup checks, and disposable full-stack smoke. Run and record both real-browser profiles as those journeys are implemented. Store baseline measurements first without failing builds; promote the 20% gate only after repeatable observations support it.
