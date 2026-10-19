# DataTalksClub submission review

Branch: `homework/datatalksclub-submission`

Application base: `0d4c08c6aa6dc324a2ff927109705b32deddda47`
Prepared: 2026-10-19

This is a concise retrospective submission package for an existing application.
The owner requested these changes remain on a homework branch, outside `main`.
No PR, remote push, merge, or production deployment is included.

## Review order

1. [Product specification](../../product-spec.md): a bounded set of user workflows.
2. [AI workflow](../ai-workflow.md) and [agent team](../agent-team.md): context,
   responsibilities, and evidence of actual activity.
3. [OpenAPI](../../openapi.yaml) and [contract provenance](../api-contract.md).
4. [Extension pack](../agent-extension-pack.md): two skills, workflow, specialist,
   read-only MCP server, and optional commit guard.
5. [Security findings](../../security/scan-findings.md), [local pre-PR audit](../../security/pr-audit.md),
   and [operations diagnosis](../../ops/diagnosis.md).
6. [Validation](validation.md), [tracker](task-tracker.md), and [rubric](rubric.md)
   for completed work and remaining course requirements.

Existing local skills are preserved. No application source, database migration,
deployment behavior, or existing CI job is changed by this package. Dependency
installation for the homework tools is confined to `mcp-server/`.

```bash
npm --prefix mcp-server ci --ignore-scripts
npm --prefix mcp-server run verify
git diff main...HEAD --stat
git status --short
```

The final two commands show committed homework changes and any uncommitted work.
For the complete committed diff, use `git diff main...HEAD`. See the
[operations runbook](../../ops/runbook.md) for application tests and setup limits.
