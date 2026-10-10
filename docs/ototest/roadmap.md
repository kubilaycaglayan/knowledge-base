# #ototest — test coverage roadmap

**Codename:** `#ototest`  
**Status:** In progress
**Owner:** Knowledge Base maintainers  
**Source review:** [Test coverage audit](../test-coverage-audit.md)

**Product map:** [Navigable route and feature test tree](product-test-tree.md)

## Objective

Create reviewable evidence that each supported Knowledge Base web journey,
interactive control, registered web route, public API operation, and Chrome
extension integration is covered at the appropriate test level. Keep a
maintained map from user-visible behavior and API operation to test names and
execution gates.

The target is traceable behavioral coverage, not a claim that every line of
code is exercised. A control or route is covered only when its expected
behavior is asserted. Shared helpers and purely decorative controls can link
to shared tests or be marked as non-interactive with a reason.

## Current state

- Backend API/domain, web unit/view/store, extension module, and deployed-shaped
  tests already cover substantial behavior.
- Successful behavior is not mapped from every API method to its tests.
- There is no complete visible-control inventory linked to assertions.
- Real-stack browser journeys cover selected flows, not all major feature
  areas. Extension tests do not currently provide a documented installed
  Chrome journey.
- `/development` is temporary label-picker tooling. It remains directly
  addressable but is excluded from the authenticated product navbar and
  supported route coverage; the navbar test asserts its absence.
- iOS is out of scope for `#ototest` while the app is not in use. No iOS test
  flows or milestones are included.
- See [the audit](../test-coverage-audit.md) and
  [the existing hardening program](../../harden-tests/README.md) for supporting
  inventory and constraints.

## Milestones

| ID | Focus | Priority | Depends on | Status |
| --- | --- | --- | --- | --- |
| OTOTEST-01 | Build the route, API, feature, and control inventories | High | — | Complete |
| OTOTEST-02 | Close backend API behavior-map gaps | High | 01 | Complete |
| OTOTEST-03 | Map and complete web route and control behavior coverage | High | 01 | In progress |
| OTOTEST-04 | Add missing real-stack journeys and extension browser coverage | High | 01–03 | Proposed |
| OTOTEST-05 | Enforce traceability and keep coverage current | High | 01–04 | Proposed |

Each milestone has its own task and acceptance document:

- [OTOTEST-01 — Coverage inventories](01-coverage-inventories.md)
- [OTOTEST-02 — Backend API behavior](02-backend-api-coverage.md)
  - [OTOTEST-02 acceptance checklist](02-acceptance-checklist.md)
- [OTOTEST-03 — Web routes and controls](03-web-routes-and-controls.md)
- [OTOTEST-04 — Real-stack and extension journeys](04-real-stack-and-extension.md)
- [OTOTEST-05 — Traceability and ongoing gates](05-traceability-and-gates.md)
- [Milestone index](README.md)
- [Product test tree: routes → page regions → actions → edge/security cases](product-test-tree.md)

## Delivery sequence

1. **Baseline (OTOTEST-01):** reconcile the product tree with route
   registration, view/component templates, controllers, extension manifest,
   tests and CI. Publish route, control, endpoint, extension and feature rows;
   classify each as covered, gap, manual, unsupported, or decision-needed.
2. **Close isolated behavior gaps (OTOTEST-02/03):** rank by data-loss,
   security/ownership, timer invariant, and user journey risk. Add unit tests
   for local rules, integration tests for API/persistence/security, and
   browser tests for actual navigation/controls. Update evidence rows in the
   same change; do not write E2E for a rule already exhaustively tested at a
   lower layer unless cross-layer behavior is the risk.
3. **Cross-layer acceptance (OTOTEST-04):** select one representative
   create→reload→edit→archive/restore journey per uncovered product domain,
   plus extension installation/integration. Seed only isolated disposable
   data, assert both UI outcomes and persisted API state, and scope cleanup to
   the test project/account.
4. **Release gate (OTOTEST-05):** run the fast unit/component suite, backend
   integration, guarded PostgreSQL suite, selected real-stack browser suite,
   and extension browser suite. Label unavailable/manual platform evidence;
   record commit, exact command/job, result and artifacts. Fix failures or
   link a tracked decision before completion.
5. **Regression and maintenance:** every discovered defect gets a failing
   assertion in the narrowest responsible layer before or with its fix;
   related broader integration/E2E suites run afterward. Every route/API/
   control change updates its matrix row in the same review.

## Cross-cutting requirements

- Preserve user ownership boundaries and test them with separate disposable
  accounts where a real service is involved.
- Use isolated local or CI data only. Never use production credentials/data or
  destructive shared database cleanup.
- Treat mocked/fixture evidence, service/API integration evidence, browser
  evidence, and platform evidence as distinct layers; do not imply one proves
  another.
- Include success, validation/error, empty/loading, and recovery states when
  the behavior has those states.
- Keep assertions mandatory: a missing control or route must fail the test,
  not be skipped by a conditional locator guard.
- Avoid duplicating HARD-01 through HARD-07. Link to existing tests and
  acceptance records where they already satisfy a criterion; implement only
  the uncovered requirement.
- Do not enable an expensive or platform-specific CI gate until its runtime,
  isolation, and artifact handling are understood and its results are stable.

## Completion criteria

- Every registered web route is listed and has a test reference or an explicit
  documented exclusion.
- Every backend controller operation and alias has a linked behavioral test
  covering its normal contract and applicable validation/ownership behavior.
- Every user-facing interactive control is inventoried and mapped to a
  meaningful assertion, a shared test, or a documented exclusion.
- Web and Chrome extension surfaces have clear unit, integration, and
  end-to-end evidence boundaries. Browser-only behavior is covered in a
  browser where feasible.
- iOS test flows are explicitly outside this roadmap while the app is inactive.
- `/development` is temporary tooling and excluded from supported route
  completeness; the authenticated navigation must not link it.
- CI runs the agreed required test layers, while platform-limited or manual
  evidence is visibly labeled and has an owner/runbook.
- Test and behavior changes update the relevant inventory in the same change.

## Status policy

Statuses describe evidence, not intent: `Proposed`, `In progress`, `Blocked`,
`Complete`, or `Closed by decision`. A milestone is `Complete` only when its
acceptance checks pass and the linked test/run evidence is recorded. A closed
decision must state the affected product scope and the remaining coverage gap;
it is not equivalent to coverage completion.
