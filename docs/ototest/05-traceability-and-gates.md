# OTOTEST-05 — Traceability and ongoing gates

**Priority:** High  
**Status:** In progress
**Dependencies:** OTOTEST-01 through OTOTEST-04

## Goal

Keep route/API/control coverage evidence synchronized with product changes and
make the required test layers visible in local guidance and CI.

## Tasks

- [x] Choose a stable home and format for route, endpoint, feature, and
  control matrices. Keep them readable in code review and avoid generated
  output that cannot be audited. The source-backed Markdown inventories in
  `docs/ototest/01-*.md` are the reviewable source of truth.
- [x] Add a change checklist to the contribution/testing guidance: new or
  changed route/control/API behavior updates its inventory and adds or updates
  a named test. See [`docs/testing.md`](../testing.md) and the repository
  [pull request template](../../.github/pull_request_template.md).
- [x] Extend the consistency check to flag unclassified rows, ownerless
  matrices, duplicate route
  and API row identities, stale local Markdown links, status drift, and API
  evidence references that no longer resolve to Java test methods. It also
  resolves named component/browser references in the route/control matrices to
  declarations in their corresponding frontend test files; this is a name
  check, not an assertion-quality review. Covered API mutations whose request
  DTOs contain another record’s ID must state the ownership outcome; persisted
  and ownership claims must cite an integration evidence layer. Covered API
  reads addressed by record IDs must state owned, missing, and foreign-ID
  outcomes. Route, API, detailed control,
  extension/feature, and cross-client journey rows each have one recognized
  evidence status; CI rejects missing, combined, or unknown status values and
  malformed detailed control table rows.
  Control-matrix IDs are cross-references shared with the feature checklist,
  so those references are checked for presence/classification but are not
  treated as unique row definitions.
- [x] Compare the live OpenAPI method/path set and registered frontend route
  patterns against their matrices during the deployed-shaped smoke run. The
  parser regressions cover missing/extra entries and intentionally excluded
  retired routes; see `scripts/check-ototest-source-drift.mjs`.
- [x] Reconcile generated Manifest V3 permissions and host permissions with
  the extension matrix, including the affected behavior when access is
  absent or denied. See `scripts/check-ototest-extension-permissions.mjs` and
  its regression tests.
- [x] Define required CI suites by evidence layer: unit/component, backend
  integration, PostgreSQL, browser real-stack, and extension browser.
- [x] Keep slower or environment-limited suites clearly marked as scheduled,
  opt-in, or manual; document expected runtime and setup.
- [x] Add a coverage evidence template recording commit, command/job, browser
  profile, test names, result, and artifact links.
- [x] Reconcile current route, API, control, and extension source against the
  inventories and assign all remaining gaps to Knowledge Base maintainers.
  Counts, source revisions, and changed-view review are recorded in the
  [local gate evidence](runs/2026-10-10-ototest-05-local-gates.md); unresolved
  behavior gaps remain explicitly classified and owned.
- [x] Execute the local release gate set and record passing run evidence in
  [`runs/2026-10-10-ototest-05-local-gates.md`](runs/2026-10-10-ototest-05-local-gates.md).
  Hosted `verify` also passes for the pushed branch; the run is linked in the
  evidence record.
- [x] Review audit/matrix freshness after the OTOTEST-04 route/view/test
  changes; repeat this review during later release readiness and major API
  changes.
- [x] Update `docs/testing.md`, `docs/test-coverage-audit.md`, and the roadmap
  when the gap status changes; the OTOTEST-04 coverage changes are reconciled
  in this milestone update.

## Task workflow and gate map

1. Keep the route/control/API/extension matrices alongside this roadmap and
   the [product test tree](product-test-tree.md). Use route paths and
   method/path pairs as route/API keys, checklist IDs for detailed controls,
   and capability/domain labels for feature rows. Each row states behavior,
   source, assertion, layer, run command/workflow, classification, and review
   context; matrix-level owner/revision metadata applies to its rows.
2. Add a PR checklist requiring a named test and matrix update for changed
   route registration, controller mapping/contract, visible action, gesture,
   permission, or security boundary.
3. Run consistency validation for missing status, stale links, duplicate IDs,
   and rows with no evidence classification. A static source inventory may
   flag drift, but only behavioral assertions establish coverage.
4. Record gate ownership and commands: frontend Vitest/component; backend
   Gradle unit/API integration; guarded disposable PostgreSQL/migration;
   deployed-shaped browser E2E; built-extension Chromium E2E; repository
   accessibility/security/smoke-cleanup checks. Distinguish required PR,
   scheduled, opt-in, and manual gates with runtime/setup.
5. For each release or milestone review, collect run URL/artifact, commit,
   browser/viewport, test names, result and known limitations. Keep the
   account, JWT, trace and test data out of checked-in evidence.
6. When a defect is found, add the narrow failing regression assertion, fix,
   then run the owning layer and relevant integration/E2E regression suite;
   update the linked row and run record.

## Acceptance

- Each new/changed route, endpoint, and supported user action has an owner for
  keeping its evidence current.
- CI and local guidance name the exact suites that establish each coverage
  layer.
- Automated checks validate inventory integrity where possible, without
  producing false confidence from file-name matching.
- Manual checks have explicit owners and evidence procedures.
- Completion status for each milestone links to passing test/run evidence and
  updates the roadmap, milestone index, and audit consistently.
- No supported route, endpoint, control family or extension permission is
  unclassified; a deliberate exclusion states scope, rationale, owner and
  review trigger. `/development` is excluded consistently and absent from the
  navbar.
- Required gates have exact runnable commands and named CI jobs; manual or
  platform-limited checks have an owner and reproducible evidence procedure.
- Test gate policy preserves isolation: disposable DB/Compose project and
  data, no production credentials, scoped cleanup, and secret-free artifacts.
- The completion review reconciles matrices against source again and links
  passing evidence; unresolved product gaps have a named owner and decision.

## Completion review

At completion, compare the matrices with current source again. Any remaining
uncovered product behavior must have a recorded owner and documented scope
decision; do not close the roadmap based only on all milestone documents being
checked off.
