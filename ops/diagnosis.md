# Bounded operations diagnosis — 2026-10-19

Purpose: determine which operational claims the existing repository and a safe
local check support. Application base: `0d4c08c6`. No production logs, secrets,
database contents, or user accounts were read.

| Observation / command | Actual output or evidence | Interpretation |
| --- | --- | --- |
| `curl --max-time 8 --silent --fail http://127.0.0.1:8080/v3/api-docs` | Exit 7 (connection unavailable) | No development API was listening there; do not assume the usual dev port is running |
| `bash mcp-server/export-openapi.sh` | Exit 0; produced a 107-operation document from a newly built backend and disposable PostgreSQL | Local backend startup and metadata export succeeded; this is not an authenticated user-journey test |
| Docker container/network name filters for `kb-homework-openapi` afterward | No remaining containers or networks | Exporter's disposable runtime resources were cleaned up |
| Public app HEAD request with redirects | HTTP 200 | Public reachability only; no login or persisted workflow was exercised |
| `node scripts/check-security.mjs` | `Security contract passed (49 checks)` | Static configuration controls checked |
| `node scripts/check-cloudflare-waf.mjs` | `Cloudflare WAF semantic contract checks passed (174 checks).` | Static policy behavior checked, not live Cloudflare enforcement |

Public check command:

```bash
curl -L -I --max-time 15 -sS -o /dev/null -w 'HTTP %{http_code}\n' https://knowledgebase.blaqc.space/
```

Source inspection found request logs with method/path/status/duration, Actuator
health/info exposure, Compose log rotation, backups, and a verified-main deployment
watcher. It did not find trace IDs correlating logs/metrics/traces, a telemetry
collector UI, a user-impact alert route, or an alert-triggered repair agent. Docker
health checks and a human-invoked reviewer do not establish those capabilities.

No outage is inferred from the unavailable local development port. The next
engineering tasks are the fresh-clone launcher and observable user-journey/alert
work listed in the homework tracker. Production diagnostics and restoration are
outside this bounded check; the existing runbook governs any authorized recovery.
