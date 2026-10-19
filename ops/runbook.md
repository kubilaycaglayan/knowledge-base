# Reviewer runbook

## Submission artifacts

With Node.js 22 or newer, run from the repository root:

```bash
npm --prefix mcp-server ci --ignore-scripts
npm --prefix mcp-server run verify
node scripts/check-security.mjs
node scripts/check-cloudflare-waf.mjs
```

This checks the extension pack and contract without accessing a database.
Run the entire existing Linux application suite separately with
`./scripts/test-run-all.sh`; see [testing](../docs/testing.md) for prerequisites,
cost, and disposable-stack behavior. Do not present an artifact-only check as a
fresh application test run.

## Application and deployment

Follow [local development](../docs/development.md) and
[deployment](../docs/deployment.md). The ordinary development launcher expects an
existing protected development volume, so it is not a fresh-clone bootstrap.
For a disposable review, the smoke runner creates and tears down its own stack:

```bash
JWT_SECRET="$(openssl rand -hex 32)" POSTGRES_PASSWORD="$(openssl rand -hex 16)" \
  SMOKE_FULL_STACK=1 ./scripts/run-smoke-tests.sh
```

This is verification, not a persistent demo environment. Never apply its cleanup
to a production or development volume. A persistent first-time reviewer launcher
remains a follow-up in the tracker.

## Diagnosis and recovery boundaries

Start with sanitized health status and the deployed commit, then correlate failing
workflow evidence with request logs. The request logger currently has method,
path, status, and duration; it has no shared trace ID. Backups and image retention
exist, but a documented, demonstrated application rollback path remains an evidence
gap. Do not restore data or deploy an old image merely to demonstrate homework.
Production recovery requires the owner's explicit scope and the verified
backup/restore procedure in the deployment guide.
