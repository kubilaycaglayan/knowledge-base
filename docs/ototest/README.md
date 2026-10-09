# #ototest milestone index

This index breaks the [test coverage roadmap](roadmap.md) into
reviewable work packages. Update a milestone's status here, in the roadmap,
and in its own document together. Link evidence by test name, command, CI job,
or run record.

| ID | Focus | Priority | Status |
| --- | --- | --- | --- |
| [OTOTEST-01](01-coverage-inventories.md) | Route, API, feature, and control inventories | High | Proposed |
| [OTOTEST-02](02-backend-api-coverage.md) | Backend API behavioral test mapping | High | Proposed |
| [OTOTEST-03](03-web-routes-and-controls.md) | Web routes and interactive controls | High | Proposed |
| [OTOTEST-04](04-real-stack-and-extension.md) | Real-stack journeys and Chrome extension integration | High | Proposed |
| [OTOTEST-05](05-traceability-and-gates.md) | Ongoing traceability and CI gates | High | Proposed |

The source-backed [product test tree](product-test-tree.md) is the navigation
and feature outline for building the detailed route, control, and endpoint
matrices. It includes shared shell behavior, drag/date interactions, edge
cases, ownership/security, extension entrypoints, and required evidence layers.

## Working rules

- Inventory first. Do not infer “covered” from a nearby test file name; link a
  behavior to an assertion that exercises it.
- Reuse existing tests and acceptance records when their assertions meet the
  criterion. Avoid parallel checklists for the same behavior.
- A feature should have the lightest appropriate unit/component/API tests and
  an end-to-end test where cross-layer interaction or browser behavior matters.
- Keep any unsupported or retired surface explicitly labeled rather than
  silently treating it as tested.
- Follow the repository's safe disposable-data and cleanup rules in
  [`AGENTS.md`](../../AGENTS.md).

## Milestone documents

- [OTOTEST-01 — Coverage inventories](01-coverage-inventories.md)
- [OTOTEST-02 — Backend API behavior](02-backend-api-coverage.md)
- [OTOTEST-03 — Web routes and controls](03-web-routes-and-controls.md)
- [OTOTEST-04 — Real-stack and extension journeys](04-real-stack-and-extension.md)
- [OTOTEST-05 — Traceability and ongoing gates](05-traceability-and-gates.md)

## Milestone acceptance checklists

- [OTOTEST-01 inventory acceptance](01-acceptance-checklist.md)
  covers route, API, feature, and control inventory traceability.
- [OTOTEST-02 backend API behavior acceptance](02-acceptance-checklist.md)
  covers endpoint contracts, state effects, ownership, validation, and
  evidence traceability.
- [OTOTEST-03 web routes and controls acceptance](03-acceptance-checklist.md)
  covers supported web routes and user-visible controls in desktop and mobile
  Chrome.

## Out of scope

The iOS app is not currently in use. `#ototest` includes no iOS testing flows,
milestones, or CI work. Revisit this scope only if iOS becomes an active,
supported client again.

`/development` is temporary label-picker tooling and remains directly
addressable, but it is excluded from the supported product route matrix and
authenticated navigation.
