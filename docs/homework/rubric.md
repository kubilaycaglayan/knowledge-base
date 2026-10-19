# Course requirement mapping

Reviewed 2026-10-19 against the [current project page](https://github.com/DataTalksClub/ai-dev-tools-zoomcamp/tree/main/project)
at course revision `de41e4096d8ac08db3852dfda4ce802f9ac0c0d2`.
The earlier review received a cached draft with different criteria. This mapping
uses the fresh page; the owner also requested the API and extension-pack artifacts
from that earlier review. This is evidence mapping, not an awarded score.

| Current criterion | Evidence in this repository | Assessment / remaining work |
| --- | --- | --- |
| Problem description | [README](../../README.md), [spec](../../product-spec.md) | Described |
| Product specification | Spec, [task tracker](task-tracker.md), existing public OTOTEST acceptance checklists | Existing tracker is public; specification is retrospective; homework tracker remains local |
| Agent team | [Roles and handoffs](../agent-team.md) | Defined; one agent used in this session |
| Context management | [AGENTS.md](../../AGENTS.md) links modular documents | Present |
| Application | Vue, Spring, PostgreSQL; existing smoke runner | Fresh-clone persistent launcher gap; no new end-to-end run claimed |
| Testing | [Testing guide](../testing.md), `scripts/test-run-all.sh` | Unit/integration suites and aggregate command exist; historical evidence linked |
| Containerization | Compose and Dockerfiles | Present; documented dev launcher requires an existing volume |
| Deployment | Public URL in README; [deployment guide](../deployment.md) | Public reachability is limited evidence of behavior |
| CI/CD | `verify.yml` and verified-main watcher | Automatic deployment exists; dev/manual-prod split is absent |
| Observability | [Local observability demo](../../observability/README.md): synthetic register/create/read/archive journey; Prometheus metrics, Spring OTLP traces, structured request logs pushed to Loki with trace and span IDs; Grafana UI | Implemented for an isolated local demo; production collection/retention is not claimed |
| User-impact alerting | Prometheus `KnowledgeBaseUserJourneyFailing` rule; Alertmanager routes firing alerts to the local responder, with optional SMTP email via `ON_CALL_AGENT_EMAIL` | Local alert path implemented and verified; email delivery requires an owner-provided SMTP relay |
| On-call agent | Webhook responder checks API health, clears the demo's injected fault, retries the journey, and records recovery/escalation result | Bounded local response implemented; arbitrary repair and production access are outside this demo |

The current course requires three peer reviews. They are an external submission
step, not a repository artifact. Dates and submission workflow belong to the
course platform. Specification chronology cannot be recreated retroactively.

## Additional artifacts requested by the owner

The branch includes `openapi.yaml`, `agent-capabilities/`, `agent-hooks/`,
`mcp-server/`, `custom-agent/`, extension/permission documentation, and `security/`
and `ops/` records. Their validation is in [the run record](validation.md).
The pre-PR audit is explicitly local; no GitHub PR or external AI audit run is
fabricated. Full production telemetry, alerts, and an automated responder remain
separate engineering tasks rather than claims filled in by documentation.
