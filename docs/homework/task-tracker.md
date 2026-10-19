# Homework task tracker

Owner: Knowledge Base project owner. Implementer: Codex, single-agent session.
Branch: `homework/datatalksclub-submission`; base `0d4c08c6`.
This repository-backed tracker records acceptance criteria and agent work.
The owner authorized publication of this branch and a review PR; merge and
deployment remain separate. Existing product work has
acceptance checklists and agent inventory attribution in `docs/ototest/`.
The existing [public OTOTEST roadmap](https://github.com/kubilaycaglayan/knowledge-base/blob/main/docs/ototest/roadmap.md)
links task checklists and evidence; its URL returned HTTP 200 in this session.
This is a repository-backed tracker, not a claim that GitHub Issues was used.

| Task | Acceptance criteria | Evidence / status |
| --- | --- | --- |
| HW-01 Specification | Concise implemented workflows, source links, and retrospective provenance | [product-spec.md](../../product-spec.md); prepared by Codex, owner review pending |
| HW-02 Context and team | Preserve existing guidance/skills; define roles and modular context | [AGENTS.md](../../AGENTS.md), [team](../agent-team.md), [workflow](../ai-workflow.md) |
| HW-03 API snapshot | Export real schemas; reconcile every matrix operation; validate references/auth | [contract](../api-contract.md), [validation](validation.md) |
| HW-04 Extension pack | Two useful skills, workflow, specialist, runnable read-only MCP, guardrail, permissions | [extension guide](../agent-extension-pack.md), protocol and guard tests |
| HW-05 Security evidence | Retain actual scan output, report findings and limitations, document AI/data policy | [findings](../../security/scan-findings.md), [audit](../../security/pr-audit.md) |
| HW-06 Operations evidence | Record bounded diagnosis and existing deployment/test capabilities | [diagnosis](../../ops/diagnosis.md), [runbook](../../ops/runbook.md) |
| HW-07 Owner review/publication | Owner reviews diff; publish the branch only on instruction; public tracker link works | [PR #162](https://github.com/kubilaycaglayan/knowledge-base/pull/162) open; review pending |
| HW-08 Fresh-clone setup | One command starts an isolated persistent reviewer app without a pre-existing dev volume | Open; smoke verification exists, persistent launcher not added |
| HW-09 Observability | One user journey has correlated signals in a collector UI with sensitive-data exclusions | Implemented and runtime verified in [the isolated demo](../../observability/README.md): metrics, traces, Loki request events, and trace IDs |
| HW-10 Alert and responder | Demonstrate a user-impact alert waking an agent, bounded recovery, and verification | Implemented and runtime verified: injected synthetic failure triggered Alertmanager, responder cleared it, and end-to-end journey recovery passed |
| HW-11 Deployment/rollback evidence | Demonstrate rollback and, for the highest CI/CD tier, dev automation plus manual production | Open; existing auto-production watcher is documented |
| HW-12 Peer review | Complete the course's external peer-review process | Pending with the owner |

## Agent activity record

- 2026-10-19: Codex read the repository and course page, discovered the updated
  rubric, and created this branch from freshly fetched `main`.
- 2026-10-19: Codex used existing architecture, domain/API documentation, source,
  and test inventories to draft HW-01–HW-06 artifacts. API metadata was generated
  from an isolated backend rather than fabricated from endpoint names.
- 2026-10-19: Codex added an isolated Grafana LGTM demo, synthetic note journey,
  user-impact alert rule, and bounded local on-call responder for HW-09/HW-10.
  No production/dev database or external notification service is configured.
- Command results, scan findings, artifact checks, and remaining limitations are
  recorded in [validation](validation.md). These entries are current-session
  evidence, not invented historical task activity.
