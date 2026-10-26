# Knowledge Base — homework product specification

This concise specification describes the existing application at base revision
`0d4c08c6aa6dc324a2ff927109705b32deddda47`. It was reconstructed for the
DataTalksClub submission after development; it is not evidence of a specification
written before implementation.

## Problem and users

People learning or working on several topics need one place to connect what they
learned with the time they spent. Knowledge Base lets an individual organize
paths, capture notes, track sessions, and review their history without combining
separate note and timer exports manually. Accounts have private, separate data.

## Submission scope and acceptance criteria

| ID | User workflow | Acceptance criteria | Existing evidence |
| --- | --- | --- | --- |
| SPEC-01 | Sign in and keep records private | A user can register and sign in; unauthenticated protected requests fail; another user's records cannot be read or changed. | [API matrix](docs/ototest/01-api-matrix.md), `CrossUserIsolationIntegrationTest` |
| SPEC-02 | Organize learning | Create and rename a path, assign owned labels, and archive it; saved changes remain after reload. | [Path checklist](docs/ototest/03-acceptance-checklist.md), `PathManagementServiceTest` |
| SPEC-03 | Preserve knowledge | Create and edit a rich-text note, find it by search, and archive/restore it; cross-user references are rejected. | [Notes coverage](docs/ototest/04-real-stack-and-extension.md), `NoteUpdateTagOwnershipIntegrationTest` |
| SPEC-04 | Track work | Start and stop a session; there is at most one running timer per user; elapsed history is stored on the server and survives client refresh. | [Architecture](docs/architecture.md), `TimerConfigureIntegrationTest`, `TimerCurrentIntegrationTest` |
| SPEC-05 | Review activity | Search owned records and view reports over a date range; filters constrain results to the current account. | [Search checklist](docs/global-search-acceptance-checklist.md), `ReportServiceTest` |
| SPEC-06 | Plan work | Create board cards, move them between statuses, and assign dates; Kanban and Gantt represent the same saved cards. | [Board criteria](docs/board-acceptance-criteria.md), `BoardCardMoveIntegrationTest` |

These are acceptance criteria, not a claim that every branch of every workflow has
been verified in this homework session. The linked inventories name assertions
and retain their gaps. Logs, calendar records, imports, exports, and the browser
extension are existing supporting features. The native iOS client is historical;
its CI jobs are disabled and are not part of this submission's validation.

## Architecture and constraints

Vue 3/TypeScript calls the versioned Spring Boot/Java 21 API through a shared
client. PostgreSQL is the system of record; Flyway owns schema changes. The service
layer enforces ownership, timer rules, and referenced-record validation. Docker
Compose packages the application; GitHub Actions verifies changes, and a host
watcher deploys a verified `main` revision through Caddy and Cloudflare Tunnel.
See [architecture](docs/architecture.md), [domain model](docs/domain-model.md),
[API contract](openapi.yaml), and [deployment](docs/deployment.md).

The homework adds submission documentation and developer tooling. It does not
change these product behaviors. No production credentials or personal records are
needed to review it. Keep all homework changes on `homework/datatalksclub-submission`.

## Work tracking

[Homework tasks](docs/homework/task-tracker.md) records acceptance criteria,
implementation evidence, and remaining work. Existing product work is tracked in
the [roadmap](docs/roadmap.md) and [OTOTEST checklists](docs/ototest/README.md).
The new tracker becomes publicly accessible only when this branch is published;
publication has not been performed as part of this task.
