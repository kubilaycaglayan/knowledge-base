# HARD-05 performance run: desktop Chromium

## Run metadata

- Date (UTC): 2026-10-09
- Run A: 05:16:46–05:18:43 UTC; `hard05-20261009-a-desktop-v2`
- Run B: 05:24:04–05:26:00 UTC; `hard05-20261009-b-desktop`
- Browser harness revision: `af653b8`; app image source revision: `9fe753a29931`
- Fixture: `knowledge-base-performance-fixture-v1`, sparse, desktop-only disposable account; counts were verified before timing.
- Exact profile: Chromium 153.0.8010.12, Playwright 1.63.0, 1440×900 CSS viewport, headless Linux user agent, no touch, device scale factor 1.
- Compose project: `knowledge-base-perf-20261009-hard05`; loopback proxy `http://localhost:26381`.
- Images: `knowledge-base-api:perf-20261009050732-9fe753a29931` (`sha256:df6da4d71188a68f36e30f20ef97452ddc532de11cf8f9f02293e9cb93c38970`); `knowledge-base-web:perf-20261009050732-9fe753a29931` (`sha256:42fd68d5fbfb4d3e5ff32a09947ce4856184003adc7cbd84399ecc47f49a1192`).
- Database: PostgreSQL 16.15 (`postgres:16-alpine`, `sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea`); healthy with 63 successful Flyway migrations before fixture setup.
- Environment: Ubuntu 26.04.1, Linux 7.0.0-38-generic, x86_64; 32 logical CPUs; Docker 29.8.2; host Node 22.23.3 / npm 10.9.9; API Temurin Java 21.0.12.1. Docker API/database containers had no explicit CPU or memory limits. Host RAM 30 GiB; 17 GiB available at the post-run snapshot; Docker reported 32,728,072,192 bytes.
- Competing load: development Knowledge Base and local AI/RAG services remained active. At the 05:54 UTC post-run snapshot, load average was 4.26/4.56/3.73 across 32 CPUs and the dev API was using 38.57% of one core and 1.356 GiB of its configured 3 GiB. No other builds, tests, or benchmarks ran during timed samples. This is contextual telemetry, not a per-sample time series.
- Network/cache: loopback, no shaping, fresh browser context/cache for each sample; warm reload performs an untimed navigation then reloads in the same context. API requests include connection setup when it occurs. No browser extensions.
- Command: `API_BASE_URL=http://localhost:26381 BROWSER_ENGINE=chromium BROWSER_PROFILE=desktop PERFORMANCE_WARMUPS=3 PERFORMANCE_SAMPLES=30 node frontend/scripts/performance-browser-baseline.mjs <private-fixture.json>`; output paths are linked below. The API token came from the mode-0600 fixture and was never printed.
- Outcome: both runs exited 0; 11 journeys per run, 3 warmups and 30 measured samples per journey; 330 measured journey rows per run. Browser/page errors, timed request failures, and timeouts: 0. All raw samples and request rows were retained.
- Cleanup: the uniquely named Compose project was removed after all profiles completed with its project-scoped `down --volumes --remove-orphans` command. Shared development services and volumes were left running.

## Workload and results

Browser duration is measured from the journey start through its semantic completion using the browser's monotonic `performance.now()` clock. It includes rendering and local network wait, not server-only time. Request timing uses Playwright request start through `requestfinished`, with method, path, status, duration, bytes, and in-page Resource Timing retained. Outliers were not excluded.

| Journey / metric | Run A median (p95; min–max) ms | Run B median (p95; min–max) ms | Failures / samples A; B | Median delta |
| --- | ---: | ---: | ---: | ---: |
| Authenticated cold startup | 97.9 (109.6; 94–126) | 98.3 (105.8; 91.7–107.9) | 0/30; 0/30 | +0.4% |
| Same-context warm reload | 49.2 (57.5; 44.8–74.4) | 49.3 (55.0; 46.4–56.5) | 0/30; 0/30 | +0.2% |
| Exact search | 224.1 (235.5; 210.5–235.7) | 221.4 (233.8; 212.1–241) | 0/30; 0/30 | −1.2% |
| Near-match search | 222.5 (233.7; 216.4–237.9) | 220.0 (235.8; 210.5–236) | 0/30; 0/30 | −1.1% |
| Board first page | 145.2 (171.4; 138.7–178.4) | 145.1 (163.0; 137.5–197.3) | 0/30; 0/30 | −0.1% |
| Board next page | 55.4 (68.9; 44.3–74) | 57.2 (71.9; 43.9–74.3) | 0/30; 0/30 | +3.2% |
| Gantt range, all 48 rows | 221.2 (243.9; 184.6–252.9) | 217.3 (234.9; 180.9–235.3) | 0/30; 0/30 | −1.8% |
| Fixed report range | 229.1 (243.3; 219.8–250.2) | 228.4 (242.6; 217–254.8) | 0/30; 0/30 | −0.3% |
| Note autosave | 802.6 (816.3; 792.9–819.4) | 798.3 (804.8; 791.8–805.7) | 0/30; 0/30 | −0.5% |
| Timer start to running UI | 52.8 (60.2; 44.4–60.6) | 55.1 (59.2; 44.5–59.5) | 0/30; 0/30 | +4.4% |
| Timer stop to stopped UI | 48.3 (50.8; 43.8–51.1) | 48.7 (50.2; 43.2–50.4) | 0/30; 0/30 | +0.8% |
| Timer update on second page, action to frame | 37.3 (41.9; 27–44.3) | 34.8 (43.0; 25.9–43.6) | 0/30; 0/30 | −6.7% |
| WebSocket residual wait after HTTP ack | 0 (0; 0–0) | 0 (0; 0–0) | 0/30; 0/30 | Censored at zero |

Exact and near-match searches each returned the expected 12 note results during fixture validation. The browser search rendered its result and fuzzy-fallback signals. Board pagination returned 20 cards on each page; Gantt rendered 48 rows. Note autosave, timer start/stop, and second-page WebSocket assertions passed. In all 60 WebSocket samples the matching event was observed before the HTTP acknowledgment, so the residual-wait metric is left-censored at zero and is not a gate candidate.

## Product-quality spot check

On five settled routes (`/paths`, board, Gantt, reports, note), document width stayed within the 1440 px viewport and there were no page errors. Exact and near search each rendered 12 note results in desktop Chromium. Keyboard Enter opened global search and rendered the exact results. The desktop board and Gantt use horizontally scrollable content areas; their page roots did not overflow.

## Comparison and artifacts

Median differences between comparable batches ranged from −6.7% to +4.4% for the measured browser journeys. The larger board-page maximum in Run B and all other extrema remain in the raw samples; no outlier policy removed them. The WebSocket residual value is censored as described above.

- [Run A raw browser, request, and Resource Timing data](../local-artifacts/performance/20261009-hard05/run-a/desktop-chromium-v2.json)
- [Run B raw browser, request, and Resource Timing data](../local-artifacts/performance/20261009-hard05/run-b-desktop-chromium.json)
- [Sparse fixture and expected counts](../local-artifacts/performance/20261009-hard05/run-a/fixture.json)
- Visual screenshots: [desktop paths](../local-artifacts/performance/20261009-hard05/visual/desktop-paths.png), [desktop board](../local-artifacts/performance/20261009-hard05/visual/desktop-board.png), [desktop Gantt](../local-artifacts/performance/20261009-hard05/visual/desktop-gantt.png), [desktop reports](../local-artifacts/performance/20261009-hard05/visual/desktop-reports.png), [desktop note](../local-artifacts/performance/20261009-hard05/visual/desktop-note.png).
- [Shared report-only threshold proposal and dry-run](2026-10-09-hard05-gate-proposal.md)

## Failure groups and corrections

| Suspected root cause | Case count | Suite count | Evidence |
| --- | ---: | ---: | --- |
| None in these two desktop batches | 0 | 0 | Both reports contain 30 successful samples per journey and no browser or API request failures. |

Earlier diagnostic attempts exposed collector defects (a browser Resource Timing closure error, request-body capture behavior, and a Gantt row assertion before rendering settled). Those attempts are excluded from this baseline; the collector fixes are committed in `af653b8`. No product defect was identified.
