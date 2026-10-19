# Agent roles and handoffs

This is a reusable team specification for the homework. A single agent may perform
the roles in sequence. This submission session used one Codex agent; independent
review and human acceptance must not be implied by a role definition.

| Role | Responsibility | Handoff |
| --- | --- | --- |
| Product owner (human) | Set scope, resolve product choices, review final branch, decide publication | Task and acceptance criteria in the tracker |
| Implementer | Read modular context, create scoped artifacts, preserve application invariants | Diff, affected task IDs, validation results, limitations |
| API reviewer | Check the OpenAPI export against the matrix, controllers, and client requirements | Operation/schema discrepancies with file references |
| Evidence reviewer | Inspect results, permissions, and rubric claims; do not modify product data | Findings with severity, evidence, and follow-up tasks |

Start with [AGENTS.md](../AGENTS.md), then load only the documents needed for the
task. Use the [task tracker](homework/task-tracker.md) for ownership and acceptance.
The implementer updates evidence after checks finish. Reviewers return findings
to the implementer; the human owner accepts the final result. If parallel agents
are explicitly requested, give each a non-overlapping task and have one agent
integrate the results. Otherwise perform these roles sequentially.

The [read-only specialist prompt](../custom-agent/evidence-reviewer.md) can be
passed to a separate agent when delegation is authorized, or used as a checklist
by the current agent. It has no background execution or deployment capability.
