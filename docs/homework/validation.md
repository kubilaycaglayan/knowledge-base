# Homework validation — 2026-10-19

Branch: `homework/datatalksclub-submission`. Application base and unchanged local
`main`/`origin/main`: `0d4c08c6aa6dc324a2ff927109705b32deddda47`.
This record concerns the homework artifacts and bounded checks below. Historical
application-suite evidence remains in the existing OTOTEST run records.

| Check actually executed | Result |
| --- | --- |
| Docker build of this checkout's backend and isolated OpenAPI export | Passed; no production/shared test image tags used |
| `npm --prefix mcp-server run verify` | Passed: four tests, contract validation, branch/staged-path guard |
| Clean lockfile installation with `npm --prefix mcp-server ci --ignore-scripts`, followed by verification | Passed |
| OpenAPI validation | 107 operations, 79 schemas, 164 local references; operation set matches matrix; authentication checked |
| MCP tests | Real stdio client handshake/discovery/document and operation reads; rejected invalid IDs and missing operations; symlink rejection |
| Guard tests | Main/detached branch rejection, sensitive staged paths, existing-skill additions/deletions, allowed templates |
| Skill creator `quick_validate.py` for each new skill | Both valid |
| `node scripts/check-security.mjs` | 49 checks passed |
| `node scripts/check-cloudflare-waf.mjs` | 174 checks passed |
| `node scripts/check-accessibility.mjs` | 38 checks passed |
| `node scripts/check-smoke-cleanup.mjs` | 17 checks passed |
| `./scripts/check-image-prune.sh` | Passed using isolated fixture images |
| Shell syntax for exporter and hook | Passed |
| Markdown links and new workflow YAML | All 118 relative links resolve; workflow YAML parses |
| Existing local skill SHA-256 comparison | All four original `SKILL.md` files unchanged |
| Public app / existing public OTOTEST roadmap HEAD requests | Both HTTP 200; limited reachability checks |
| Three npm audits | Tooling: 0 findings; frontend: 5 high package entries; extension: 1 high package entry; [raw reports](../../security/scan-findings.md) |

Environment: Node.js `v24.19.0`, npm `11.17.0`, Python/PyYAML for skill validation,
Docker with the repository's Java 21 backend build and PostgreSQL 16 image.
The added CI workflow selects Node 22; no hosted run is claimed before publication.

The entire application suite, authenticated production flows, iOS tests, independent
agent review, and human acceptance were not run during the original artifact task.
The observability demo's backend dependency and source changes are limited to
optional tracing and request event export; frontend sources
and lockfiles are unchanged. No production or development volume was accessed by
the exporter. Existing local skill files are
ignored and were not force-added. The homework guard does not replace a content
secret scanner or server-side branch protection.

## Observability demo verification — 2026-10-19

The separate local demo was run with its fixed `knowledge-base-observability-demo`
Compose project and smoke overlay. The API used a newly created project-scoped
disposable PostgreSQL volume. Verification showed the synthetic registration and
note create/read/archive journey succeeding; Prometheus reported the journey
success metric and loaded the alert rule; Tempo returned API traces; Loki returned
structured HTTP events containing trace and span IDs; Grafana health returned
200. A controlled synthetic failure caused `KnowledgeBaseUserJourneyFailing` to
reach the responder, which cleared the injected fault and logged confirmed
end-to-end recovery. Alertmanager had no active alert after recovery.

The demo stack was left running for owner inspection at `http://127.0.0.1:3300`
(Grafana), `http://127.0.0.1:3301` (Alertmanager), and
`http://127.0.0.1:3302` (Prometheus). Remove only this isolated stack using
`./scripts/run-observability-demo.sh down`.

At the owner's direction, the later standalone Gradle test command was interrupted
before completion. The demo's Docker build had already compiled the backend and
the end-to-end demo walkthrough above was completed before the final small
configuration edits. No claim is made that the final diff passed the full test
suite. Optional SMTP delivery using `ON_CALL_AGENT_EMAIL` was added afterward at
the owner's request and was not run; no SMTP configuration was present in the
current shell or repository.
