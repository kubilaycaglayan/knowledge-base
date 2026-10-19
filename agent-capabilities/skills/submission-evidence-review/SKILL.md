---
name: submission-evidence-review
description: Review Knowledge Base coursework evidence and rubric claims against source files and recorded test results before handing a homework branch to its owner.
---

# Review submission evidence

Read `docs/homework/rubric.md`, the assigned row in
`docs/homework/task-tracker.md`, and `docs/homework/validation.md`. Follow the
linked artifact rather than treating a checked box as proof.

For each claim, identify its source revision, command or procedure, observed
result, and limitation. Existing OTOTEST runs are historical evidence; a new run
needs its own result. A public tracker requires an actually published URL.
Deployment scripts do not prove a deployed version; HTTP 200 does not prove an
authenticated workflow. Agent role definitions do not prove parallel execution.

Check `security/ai-data-policy.md` and `docs/permissions.md` before proposing an
external tool. Use sanitized source and disposable fixtures only. Report missing
evidence as an open task; do not invent logs, prompts, reviews, scanner output, or
past activity. Finish with findings ordered by their effect on the submission,
including file references and which checks were actually run.
