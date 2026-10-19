# Homework operations evidence

The existing operational implementation is in [deployment](../docs/deployment.md)
and `deployment/`, including backups, preflight, health checks, and the verified-main
deployment watcher. The homework adds a [diagnosis record](diagnosis.md) and a
[reviewer runbook](runbook.md); it does not deploy a new stack to production.

The current course also asks for correlated observability, alerting, and an on-call
agent. Existing request logs and health checks do not establish those capabilities.
See the explicit remaining items in [the rubric](../docs/homework/rubric.md).
