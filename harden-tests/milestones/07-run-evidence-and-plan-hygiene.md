# HARD-07: Durable run evidence and plan consistency

**Priority:** Medium  
**Status:** In progress
**Scope:** Documentation and test-run evidence only.

Track completion in the [HARD-07 acceptance checklist](07-acceptance-checklist.md).

## Why this milestone exists

The hardening index and run template are useful, but recent reports identify
missing retained logs/artifacts, an initial non-desktop Chromium profile, and
unmeasured performance. `docs/test-hardening-plan.md` is an older completed
survey while `harden-tests/plan.md` is the active broad plan; readers can
mistake their scope and completion status.

## Tasks

- [x] Use `harden-tests/plan.md` as the canonical active plan. The root index
  links it, and `docs/test-hardening-plan.md` labels TH-01–TH-19 as the
  completed historical first phase and links to the current plan. Preserve the
  historic test references.
- [x] Reconcile checkboxes in `harden-tests/plan.md` against current reports,
  CI workflow, and scripts. The two still-open browser journey gaps remain
  unchecked; the completed run-record and stack-policy rows now cite evidence.
- [x] Amend the report template to require UTC start/end, exact command and
  exit status, exact profile/browser/viewport/touch details, commit, Compose
  project and cleanup result, image tag and immutable ID, database/migration
  result, suite pass/fail/skip counts, failed cases, and artifact access/expiry.
- [x] Use the [local browser validation runbook](../local-browser-validation.md)
  to capture dated machine preflights. HARD-05's preflight is tied to its
  baselines; HARD-07's 2026-10-09 snapshot is time-bound and is not performance
  data.
- [x] Retain Playwright traces, screenshots, browser console/request logs,
  container logs, and test output for failed timer and line-history CI runs.
  CI artifacts are retained for 14 days; local artifacts remain ignored.
- [x] Keep desktop Chromium, mobile-size Chromium, and emulated iPhone WebKit
  passes in separate reports; do not label a 390×844 Chromium run as desktop
  or physical-device evidence.
- [x] Reconcile counted cumulative failure totals against dated reports,
  document recurrence and evidence, and preserve unclassified or uncountable
  historical observations without inferring missing counts.
- [x] Clarify required CI, local-only, opt-in, platform-limited, disabled,
  closed-by-decision, and not-yet-implemented paths in the test map.
- [x] Document the four-hour maximum reuse window, unique project/image
  references, and exact project-scoped stop commands. Preserve protected-volume
  and no-global-prune rules.

## Acceptance evidence

- The index has one clearly authoritative current plan, with no stale status
  presented as current.
- Each profile pass has a separate report. Historical missing metadata and
  local-only artifacts remain explicitly qualified; new reports use the
  complete template and counted failure totals agree with the dated reports.
- Historical reports preserve unknown metadata instead of inferring it from
  adjacent runs, and new reports do not repeat those gaps.
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
