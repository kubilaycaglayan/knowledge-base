# Homework operations evidence

The existing operational implementation is in [deployment](../docs/deployment.md)
and `deployment/`, including backups, preflight, health checks, and the verified-main
deployment watcher. The homework adds a [diagnosis record](diagnosis.md) and a
[reviewer runbook](runbook.md); it does not deploy a new stack to production.

The homework branch includes an isolated [observability, alerting, and on-call
demo](../observability/README.md). It uses a disposable database and local Grafana
stack; it is not deployed to production. Email requires a separately configured
SMTP relay.
See [the rubric](../docs/homework/rubric.md) for course evidence and limits.
