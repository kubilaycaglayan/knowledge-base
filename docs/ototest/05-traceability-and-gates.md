# OTOTEST-05 — Traceability and ongoing gates

**Priority:** High  
**Status:** Proposed  
**Dependencies:** OTOTEST-01 through OTOTEST-04

## Goal

Keep route/API/control coverage evidence synchronized with product changes and
make the required test layers visible in local guidance and CI.

## Tasks

- [ ] Choose a stable home and format for route, endpoint, feature, and
  control matrices. Keep them readable in code review and avoid generated
  output that cannot be audited.
- [ ] Add a change checklist to the contribution/testing guidance: new or
  changed route/control/API behavior updates its inventory and adds or updates
  a named test.
- [ ] Add a lightweight consistency check for stale references and unclassified
  matrix rows if it can be made deterministic without parsing fragile source
  text. Do not treat source grep alone as behavioral coverage.
- [ ] Define required CI suites by evidence layer: unit/component, backend
  integration, PostgreSQL, browser real-stack, and extension browser.
- [ ] Keep slower or environment-limited suites clearly marked as scheduled,
  opt-in, or manual; document expected runtime and setup.
- [ ] Add a coverage evidence template recording commit, command/job, browser
  profile, test names, result, and artifact links.
- [ ] Review audit/matrix freshness during release readiness and after major
  route/API changes.
- [ ] Update `docs/testing.md`, `docs/test-coverage-audit.md`, and the roadmap
  when the gap status changes.

## Task workflow and gate map

1. Keep the route/control/API/extension matrices alongside this roadmap and
   the [product test tree](product-test-tree.md); each row has a stable ID,
   behavior, source, assertion, layer, run command/workflow, status, owner and
   last-reviewed source revision.
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
