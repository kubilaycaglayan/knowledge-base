# Local observability and on-call demo

This is an isolated homework demo. It runs the Knowledge Base API against a
dedicated disposable PostgreSQL volume, never the persistent dev or production
database. It adds OpenTelemetry traces, Prometheus user-journey metrics,
structured HTTP access events in Loki, Grafana, an alert rule, Alertmanager, and
a bounded webhook responder.

## Run it

```bash
./scripts/run-observability-demo.sh up
```

Open Grafana at `http://127.0.0.1:3300` (`admin` / `admin`). The synthetic
journey registers a random disposable account, creates a note, reads it, and
archives it every 15 seconds. The password and token stay in memory, and the
account uses the reserved `.invalid` domain. Each iteration's note is archived.
No note content, credentials, or tokens are logged.
Prometheus is also available at `http://127.0.0.1:3302`; Alertmanager is at
`http://127.0.0.1:3301`. The synthetic journey's metrics and demo control are
available locally at `http://127.0.0.1:3303`.

Explore telemetry with these data sources already configured by the LGTM image:

- **Prometheus:** `knowledge_base_journey_success`,
  `knowledge_base_journey_duration_seconds`, and
  `knowledge_base_journey_failures_total`.
- **Tempo:** traces from the Spring API, sampled at 100% for this local demo.
- **Loki:** query `{service_name="knowledge-base-api"}` for structured request
  events. Each event includes `trace_id` and `span_id` for correlation with
  Tempo. The event excludes headers, bodies, credentials, and note content.

Prometheus raises `KnowledgeBaseUserJourneyFailing` after the last full journey
has failed for 15 seconds. Alertmanager posts it to the on-call responder. The
responder checks API health, clears only the synthetic fault, reruns the user
journey, and reports whether that end-to-end check confirms recovery. It has no
Docker socket, shell access, or access to user database volumes. Optional SMTP
email requires an owner-configured relay.
If the service itself remains down, it records escalation for a human operator.

To see alert delivery and response, inject a controlled failure into the
synthetic journey:

```bash
./scripts/run-observability-demo.sh simulate-failure
```

Prometheus should alert after roughly 20 seconds. The responder clears the
demo-only fault and verifies recovery by rerunning the note journey.

To email the on-call summary, set `ON_CALL_AGENT_EMAIL`, `SMTP_HOST`, and
`SMTP_FROM` in the environment before starting the demo. Authenticated relays
also need `SMTP_USERNAME` and `SMTP_PASSWORD`; use `SMTP_PORT` to select the
relay port, `SMTP_USE_SSL=true` for implicit TLS, or `SMTP_STARTTLS=false` only
for a trusted local relay. Email contains the alert name, health result, bounded
action, and recovery outcome. Repeated Alertmanager notifications for the same
incident are deduplicated while the responder is running. Keep relay credentials
in a secret manager or protected environment, never in repository files.

Stop and remove the isolated stack and its disposable database with:

```bash
./scripts/run-observability-demo.sh down
```

Other useful commands are `./scripts/run-observability-demo.sh status` and
`./scripts/run-observability-demo.sh logs oncall-agent`. Ports can be changed
with `OBSERVABILITY_GRAFANA_PORT`, `OBSERVABILITY_PROMETHEUS_PORT`,
`OBSERVABILITY_ALERTS_PORT`, and `OBSERVABILITY_PROBE_PORT`.

This demonstrates local telemetry collection, alert delivery, and automated
triage/retry. It does not claim external paging, production alert thresholds,
or an agent capable of repairing arbitrary application faults. Those require
an owner-selected notification target and separately approved remediation
permissions. Without SMTP settings, the responder reports
`not_sent_missing_smtp_host_or_from` (or `not_configured`) in its event log.
