# HARD-05 deterministic fixture generator

`frontend/scripts/seed-performance-fixture.mjs` is fixture generator revision
`knowledge-base-performance-fixture-v1`. It uses a fresh disposable account in
an isolated local PostgreSQL Compose project and emits a private fixture file
under ignored `harden-tests/local-artifacts/`. The generator's content and
dates are deterministic; account email and IDs are unique per run.

| Profile | Paths | Notes | Sessions | Custom boards | Statuses / custom board | Cards / custom board | Labels | Search terms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| sparse | 3 | 12 | 20 | 1 | 4 | 48 | 4 | 2 |
| dense | 12 | 120 | 200 | 2 | 5 | 120 | 12 | 2 |

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
`POSTGRES_PASSWORD` values for the disposable stack, unique tags such as
`knowledge-base-api:perf-20261009010000-<commit12>` and
`knowledge-base-web:perf-20261009010000-<commit12>`, and
an unassigned `PROXY_HTTP_PORT`. Start only its `db`, `api`, `web`, and `proxy`
services using all three Compose files:

```bash
export PERFORMANCE_COMPOSE_PROJECT=knowledge-base-perf-20261009-01
export PERFORMANCE_IMAGE_TAG="perf-$(date -u +%Y%m%d%H%M%S)-$(git rev-parse --short=12 HEAD)"
export PERFORMANCE_API_IMAGE="knowledge-base-api:$PERFORMANCE_IMAGE_TAG"
export PERFORMANCE_WEB_IMAGE="knowledge-base-web:$PERFORMANCE_IMAGE_TAG"
export POSTGRES_PASSWORD="$(openssl rand -hex 24)"
export JWT_SECRET="$(openssl rand -hex 32)"
export PROXY_HTTP_PORT=26381  # Choose an unassigned local port for each run.
docker compose -p "$PERFORMANCE_COMPOSE_PROJECT" \
  -f docker-compose.yml -f docker-compose.smoke.yml -f docker-compose.performance.yml \
  up -d --build db api web proxy
```

The project-scoped image retention script recognizes the timestamped
`perf-<UTC timestamp>-<12-hex commit>` tags and keeps the newest three per
application image repository. It never force-removes images used by running
containers. Do not use global image prune commands.

Record immutable image IDs with `docker image inspect --format '{{.Id}}'` for
the two unique application tags before collecting any samples. Finish building
before preflight/timing; do not build during measurement. Then run the fixture
generator:

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

Use the browser runner separately for browser-observed journeys and API request
timings collected during those journeys:

```bash
API_BASE_URL=http://localhost:<isolated-proxy-port> \
BROWSER_ENGINE=chromium BROWSER_PROFILE=desktop \
PERFORMANCE_WARMUPS=3 PERFORMANCE_SAMPLES=30 \
PERFORMANCE_RUN_ID=<run-id>-desktop \
PERFORMANCE_OUTPUT=harden-tests/local-artifacts/performance/<run-id>/desktop-browser.json \
node frontend/scripts/performance-browser-baseline.mjs harden-tests/local-artifacts/performance/<run-id>/fixture.json
```

Run again serially with `BROWSER_ENGINE=chromium BROWSER_PROFILE=iphone` for
mobile-size Chromium, and separately with `BROWSER_ENGINE=webkit BROWSER_PROFILE=iphone`
for the WebKit comparison group. The browser runner
measures cold startup and same-context warm reload, exact/fuzzy search,
first/next board pages, Gantt, reports, note autosave, timer start/stop, and
second-page WebSocket receipt. It records
the note editor's observed autosave behavior because it has no explicit Save
button. Failures retain a trace and screenshot beside the JSON report; inspect
these artifacts for credentials before sharing. The reports distinguish
setup requests from timed requests, retain browser Resource Timing entries and
request duration/status/bytes, and record the WebSocket path and received frame
types for the second-page delivery sample.

Use independent fixture/run IDs for desktop and mobile-size Chromium, and do
not run timed samples concurrently. Both generated files must remain private;
never commit them. Once all profile runs and artifacts are complete, remove
only that disposable project with the matching project-scoped command:

```bash
docker compose -p "$PERFORMANCE_COMPOSE_PROJECT" \
  -f docker-compose.yml -f docker-compose.smoke.yml -f docker-compose.performance.yml \
  down --volumes --remove-orphans
```

On a failed run, capture relevant project-scoped logs before teardown with
`docker compose -p "$PERFORMANCE_COMPOSE_PROJECT" -f docker-compose.yml -f docker-compose.smoke.yml -f docker-compose.performance.yml logs --no-color db api web proxy` and store the scrubbed output under the ignored run artifact directory. Never use global cleanup or target a protected persistent volume.

The fixture generator verifies setup counts, search results, and pagination.
The browser runner captures UI timing and functional outcomes for each listed
journey. This instrumentation does not establish a baseline until it has been
run on a suitable machine and the reports are reviewed.
