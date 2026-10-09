# Test hardening milestones

This folder turns the open gaps in [the hardening plan](../plan.md) into
reviewable, independently executable work packages. The milestones add and
improve test coverage and its documentation; product implementation changes
remain separate work. If a test exposes a defect, record it and route it through
the repository's bug-fix workflow.

## Milestones

| ID | Focus | Priority | Status |
| --- | --- | --- | --- |
| [HARD-01](01-browser-journeys.md) | Real-stack search and deep-link journeys | High | Planned |
| [HARD-02](02-browser-resilience.md) | Browser failure states and unresolved flake triage | High | Planned |
| [HARD-03](03-postgres-and-boundaries.md) | PostgreSQL behavior, time boundaries, volume cases | High | Complete |
| [HARD-04](04-rate-limits-and-security.md) | HTTP rate limits and deployed security controls | High | Planned |
| [HARD-05](05-performance-baselines.md) | Fixed-data performance baselines | Medium | Planned |
| [HARD-06](06-ios-validation.md) | A usable iOS validation path | Medium | Planned |
| [HARD-07](07-run-evidence-and-plan-hygiene.md) | Durable run evidence and plan consistency | Medium | Planned |

Each milestone has a dedicated, auditable acceptance checklist:

| Checklist | Milestone |
| --- | --- |
| [HARD-01 acceptance](01-acceptance-checklist.md) | Search and direct routes |
| [HARD-02 acceptance](02-acceptance-checklist.md) | Browser resilience and triage |
| [HARD-03 acceptance](03-acceptance-checklist.md) | PostgreSQL, time, and volume |
| [HARD-04 acceptance](04-acceptance-checklist.md) | Rate limits and security |
| [HARD-05 acceptance](05-acceptance-checklist.md) | Performance baselines |
| [HARD-06 acceptance](06-acceptance-checklist.md) | iOS validation |
| [HARD-07 acceptance](07-acceptance-checklist.md) | Run evidence and plan hygiene |

Milestones are documentation of tasks and acceptance evidence, not claims that
the work has shipped. Update status and link the resulting tests and run
records as each task is completed. See [the index](../README.md) and
[the detailed current plan](../plan.md) for the inventory.
