# AI-assisted development evidence

## What this record establishes

The owner reports developing Knowledge Base with AI assistance over more than a
month. Repository evidence includes a Codex-authored source inventory in
[the API matrix](ototest/01-api-matrix.md), task acceptance checklists, and
[recorded verification runs](ototest/runs/2026-10-10-ototest-05-local-gates.md).
Those records document their own revisions and limitations. This file does not
reconstruct missing conversations or claim that another tool or agent was used.

For this homework, one Codex agent inspected the implementation and documents,
created the submission files, and ran the checks listed in the
[validation record](homework/validation.md). No parallel subagents were invoked.
The owner will review the resulting branch; that review is pending.

## Task and context

The owner's task, paraphrased: create a concise retrospective specification,
expand agent guidance, export the API contract using the existing matrix, add a
small extension pack and security/operations evidence, and keep everything on a
dedicated homework branch without changing or losing existing skills.

Context was loaded from `AGENTS.md`, the architecture/domain/API documents,
OTOTEST inventories, CI and deployment scripts, and the actual Spring controllers.
The existing code and tests are the authority for implemented behavior; prose is
not used to invent missing behavior. Source documents are linked instead of copied
wholesale into every prompt.

## Repeatable process

1. Read the assigned tracker row, its acceptance criteria, and relevant source.
2. Make a bounded change on the homework branch. Preserve existing local skills.
3. Run checks that exercise the new artifact and record outputs and failures.
4. Review the diff against the criteria; distinguish historical evidence from
   checks executed now. Keep unsupported claims open in the tracker.
5. Present the branch to the owner for review. Publishing, merging, and deployment
   are separate actions; the homework is not intended for `main`.

The [team process](agent-team.md) defines reusable roles for future work; it is
not a claim that these roles were executed concurrently. The
[extension pack](agent-extension-pack.md) supplies reusable review skills, a
workflow, a specialist prompt, a read-only MCP server, and an opt-in guardrail.

## Review examples

- Contract review: compare method/path coverage with the API matrix, then inspect
  request/response schemas and authentication in controllers. Generated documents
  alone do not prove ownership checks.
- Evidence review: verify each claimed result against a real command output or
  linked historical run. Never mark a proposed scan or manual test as passed.
- Manual review still required: the owner checks scope, wording, and submission
  readiness, including publication and the course's peer-review process.
