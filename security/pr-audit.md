# Local pre-PR audit — 2026-10-19

Reviewer: Codex self-review in the implementation session. No PR was opened and
no independent agent or external PR-audit service was run. This file is the actual
local branch audit output, not evidence of a hosted PR review.

Scope: changes from base `0d4c08c6` on `homework/datatalksclub-submission`, including
new files that do not appear in an unstaged `git diff` until added to the index.

## Findings

| ID | Priority | Observation | Disposition |
| --- | --- | --- | --- |
| REVIEW-01 | High | Fresh course requirements differ from the cached initial rubric | Corrected mapping; observability/alert/responder gaps stay explicit |
| REVIEW-02 | High | Existing frontend and extension lockfiles have high-severity audit findings | Retained as scan evidence; application dependencies unchanged |
| REVIEW-03 | Medium | Current development launcher needs an existing protected volume | Documented in runbook and HW-08; do not claim a proven fresh-clone one-command app |
| REVIEW-04 | Medium | A generated contract is retrospective and cannot prove original contract-first development | Provenance stated; generated schemas and operation/auth validation provided |
| REVIEW-05 | Medium | Existing development/roadmap prose still mentions enabled iOS CI in some historical passages | Submission guide states both iOS jobs are disabled; historical product docs not rewritten |
| REVIEW-06 | Low | New homework tracker is local | Existing public roadmap linked; owner publication remains pending |

## Checks and boundaries

- Two read-only MCP tools; IDs/routes cannot become arbitrary filesystem paths.
- Protocol tests and symlink/traversal rejection pass; guard tests cover disallowed
  branches and staged skill deletion.
- OpenAPI operation set matches the matrix; schemas and references validate.
- Existing local skill hashes match the pre-task snapshot.
- Application source, migrations, deployment scripts, and existing CI workflows
  are unchanged. The new homework workflow runs artifact checks only on homework
  branches; it has no deployment step and has not run on GitHub yet.
- Human approval, independent review, publication, full application rerun, and
  production behavior verification are not claimed.

See [validation](../docs/homework/validation.md) for the actual command record.
