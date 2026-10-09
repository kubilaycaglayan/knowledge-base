# HARD-05 deterministic fixture generator

`frontend/scripts/seed-performance-fixture.mjs` is fixture generator revision
`knowledge-base-performance-fixture-v1`. It uses a fresh disposable account in
an isolated local PostgreSQL Compose project and emits a private fixture file
under ignored `harden-tests/local-artifacts/`. The generator's content and
dates are deterministic; account email and IDs are unique per run.

| Profile | Paths | Notes | Sessions | Custom boards | Statuses / custom board | Cards / custom board | Labels |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| sparse | 3 | 12 | 20 | 1 | 4 | 48 | 4 |
| dense | 12 | 120 | 200 | 2 | 5 | 120 | 12 |

Each path also creates its normal path board and default status set. Custom
boards put more than one 20-card UI page in their first status. Card dates span
60 deterministic days from 2026-01-01; sessions start at 09:00 UTC on
successive days from 2026-01-01 and last 30 minutes. Reports use the fixed
2026-01-01 through 2026-12-31 range. Generated names and descriptions include
profile and zero-padded indices; note text is fixed per index and includes the
exact term `PerfExactAnchor`. The fixture contains two search terms:
`PerfExactAnchor` and the near-match `PerfExactAnchro`. The generator asserts
the exact note result count, fuzzy fallback, seeded resource counts, and first
and second 20-card pages before writing its private output file.
The output records min/max text lengths per content type and the fixed search
term lengths so a report can verify generated text dimensions.

Run setup and measurement serially on an idle machine. Use fresh unique
`PERFORMANCE_COMPOSE_PROJECT` values that contain `perf`; do not reuse the
persistent development project. Set local `JWT_SECRET` and
`POSTGRES_PASSWORD` values for the disposable stack, start only its `db`,
`api`, `web`, and `proxy` services with `docker-compose.smoke.yml`, then run:

```bash
API_BASE_URL=http://localhost:<isolated-proxy-port> \
PERFORMANCE_COMPOSE_PROJECT=<unique-perf-project> \
PERFORMANCE_FIXTURE_PROFILE=sparse \
PERFORMANCE_FIXTURE_OUTPUT=harden-tests/local-artifacts/performance/<run-id>/fixture.json \
node frontend/scripts/seed-performance-fixture.mjs
```

The fixture file contains an access token and must remain private. The script
also writes a profile-specific `api-manifest.json` beside it, with concrete
board/status IDs and read-only workloads. Supply the token without printing it
and collect API samples with:

```bash
API_BASE_URL=http://localhost:<isolated-proxy-port> \
API_TOKEN="$(node -e 'process.stdout.write(JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")).token)' harden-tests/local-artifacts/performance/<run-id>/fixture.json)" \
PERFORMANCE_PROFILE=desktop-chromium \
PERFORMANCE_OUTPUT=harden-tests/local-artifacts/performance/<run-id>/api-samples.json \
node frontend/scripts/performance-api-baseline.mjs harden-tests/local-artifacts/performance/<run-id>/api-manifest.json
```

Use independent fixture/run IDs for desktop and mobile-size Chromium, and do
not run timed samples concurrently. Both generated files must remain private;
never commit them. Once all profile runs and artifacts are complete, remove
only that disposable
project with the exact project-scoped Compose `down --volumes --remove-orphans`
command documented in the run template. Never use global cleanup or target a
protected persistent volume.

The generator currently verifies setup counts, search results, and pagination.
It does not create a browser trace, time UI rendering, or measure timer
start/stop and WebSocket delivery; those remain separate browser workload
requirements in the HARD-05 checklist.
