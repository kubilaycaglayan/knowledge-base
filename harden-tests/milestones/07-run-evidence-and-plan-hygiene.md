# HARD-07: Durable run evidence and plan consistency

**Priority:** Medium  
**Status:** Planned  
**Scope:** Documentation and test-run evidence only.

Track completion in the [HARD-07 acceptance checklist](07-acceptance-checklist.md).

## Why this milestone exists

The hardening index and run template are useful, but recent reports identify
missing retained logs/artifacts, an initial non-desktop Chromium profile, and
unmeasured performance. `docs/test-hardening-plan.md` is an older completed
survey while `harden-tests/plan.md` is the active broad plan; readers can
mistake their scope and completion status.

## Tasks

- [ ] Choose one canonical active plan and make the other document explicitly
  historical or a completed phase, with a prominent link to the canonical
  inventory. Preserve useful TH-01–TH-19 results and their test references.
- [ ] Reconcile checkboxes in `harden-tests/plan.md` against current reports,
  CI workflow, and scripts. Mark a task complete only when the named evidence
  exists and satisfies its profile/database scope.
- [ ] Amend the report template to require exact profile, browser version,
  viewport, touch settings, commit, Compose project, image tag and immutable
  ID, command, pass/fail/skip counts, failed cases, and artifact links.
- [ ] Use the [local browser validation runbook](../local-browser-validation.md)
  to capture a dated machine preflight; treat its hardware and browser cache
  snapshot as time-bound evidence and refresh it for each performance baseline.
- [ ] Retain Playwright traces, screenshots, browser console/request logs,
  container logs, and test output for failed runs with a defined retention
  location and expiry. Keep generated artifacts ignored or in CI storage.
- [ ] Record separate desktop Chromium and iPhone WebKit passes; do not label a
  390×844 Chromium run as the desktop profile or as iPhone evidence.
- [ ] Reconcile cumulative failure counts against dated reports, document
  recurrence and confirmation evidence, and close or explicitly carry forward
  every unresolved group.
- [ ] Clarify which suites are in required CI versus local-only runner paths;
  identify disabled iOS jobs and opt-in PostgreSQL tests in the test map.
- [ ] Document the bounded stack reuse window, unique project/image references,
  and exact project-scoped stop command for any retained stack. Preserve the
  protected-volume and no-global-prune rules.

## Acceptance evidence

- The index has one clearly authoritative current plan, with no stale status
  presented as current.
- Every browser pass has its own complete report and links to retained evidence;
  cumulative failure totals agree with those reports.
- CI, opt-in, manual, and disabled checks are distinguishable in the inventory.
- Run records and artifacts contain no credentials, tokens, personal data, or
  protected production configuration.

## Relevant sources

- `harden-tests/README.md`, `harden-tests/plan.md`, `harden-tests/runs/`
- `docs/test-hardening-plan.md`
- `docs/testing.md`
- `.github/workflows/verify.yml`
- `scripts/test-run-all.sh`
- `harden-tests/local-browser-validation.md`
