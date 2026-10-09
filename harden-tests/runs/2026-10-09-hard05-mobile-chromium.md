# HARD-05 performance run: mobile-size Chromium

## Run metadata

- Date (UTC): 2026-10-09
- Run A: 05:44:17–05:46:14 UTC; `hard05-20261009-mobile-a`
- Run B: 05:46:17–05:48:13 UTC; `hard05-20261009-mobile-b`
- Browser harness revision: `e605d11`; app image source revision: `9fe753a29931`
- Fixture: `knowledge-base-performance-fixture-v1`, sparse, independent mobile-only disposable account; counts were verified before timing.
- Exact profile: Chromium 153.0.8010.12, Playwright 1.63.0, 390×844 CSS viewport, touch enabled, device scale factor 3. This is responsive/touch emulation in Chromium, not a physical iPhone or Android device. The browser uses its Linux Chromium user agent.
- Compose project: `knowledge-base-perf-20261009-hard05`; loopback proxy `http://localhost:26381`.
- Images: `knowledge-base-api:perf-20261009050732-9fe753a29931` (`sha256:df6da4d71188a68f36e30f20ef97452ddc532de11cf8f9f02293e9cb93c38970`); `knowledge-base-web:perf-20261009050732-9fe753a29931` (`sha256:42fd68d5fbfb4d3e5ff32a09947ce4856184003adc7cbd84399ecc47f49a1192`).
- Database: PostgreSQL 16.15; disposable database healthy and Flyway migrations completed before fixture setup.
- Environment: Ubuntu 26.04.1, Linux 7.0.0-38-generic, x86_64; 32 logical CPUs; Docker 29.8.2; host Node 22.23.3 / npm 10.9.9; API Temurin Java 21.0.12.1. Docker API/database containers had no explicit CPU or memory limits. Host RAM 30 GiB; 17 GiB available at the 05:54 UTC post-run snapshot; Docker reported 32,728,072,192 bytes.
- Competing load: development Knowledge Base and local AI/RAG services remained active. At the 05:54 UTC post-run snapshot, load average was 4.26/4.56/3.73 across 32 CPUs and the dev API was using 38.57% of one core and 1.356 GiB of its configured 3 GiB. No other builds, tests, or benchmarks ran during timed samples. This is contextual telemetry, not a per-sample time series.
- Network/cache: loopback, no shaping, fresh browser context/cache for each sample; warm reload performs an untimed navigation then reloads in the same context. API requests include connection setup when it occurs. No browser extensions.
- Command: `API_BASE_URL=http://localhost:26381 BROWSER_ENGINE=chromium BROWSER_PROFILE=iphone PERFORMANCE_WARMUPS=3 PERFORMANCE_SAMPLES=30 node frontend/scripts/performance-browser-baseline.mjs <private-mobile-fixture.json>`; output paths are linked below. The API token came from the mode-0600 fixture and was never printed.
- Outcome: both runs exited 0; 11 journeys per run, 3 warmups and 30 measured samples per journey; 330 measured journey rows per run. Browser/page errors, timed request failures, and timeouts: 0. All raw samples and request rows were retained.
- Cleanup: the uniquely named Compose project was removed after all profiles completed with its project-scoped `down --volumes --remove-orphans` command. Shared development services and volumes were left running.

## Workload and results

Browser duration is measured from the journey start through its semantic completion using the browser's monotonic `performance.now()` clock. It includes rendering and local network wait, not server-only time. Request timing uses Playwright request start through `requestfinished`, with method, path, status, duration, bytes, and in-page Resource Timing retained. Outliers were not excluded.

| Journey / metric | Run A median (p95; min–max) ms | Run B median (p95; min–max) ms | Failures / samples A; B | Median delta |
| --- | ---: | ---: | ---: | ---: |
| Authenticated cold startup | 98.7 (117.8; 94.1–122.7) | 96.9 (109.8; 89.6–115.4) | 0/30; 0/30 | −1.8% |
| Same-context warm reload | 49.8 (55.3; 46.9–56.1) | 50.5 (56.4; 47.1–76.3) | 0/30; 0/30 | +1.4% |
| Exact search | 224.8 (230.3; 212.7–233.2) | 222.2 (242.8; 213.4–267.9) | 0/30; 0/30 | −1.2% |
| Near-match search | 224.3 (238.9; 213.8–239.8) | 224.8 (233.9; 215.5–235.3) | 0/30; 0/30 | +0.2% |
| Board first page | 150.1 (161.3; 138.4–161.5) | 142.8 (148.6; 136.4–150.7) | 0/30; 0/30 | −4.9% |
| Board next page | 55.0 (61.1; 43.8–76.5) | 56.5 (62.6; 44.5–64.5) | 0/30; 0/30 | +2.7% |
| Gantt range, all 48 rows | 216.4 (234.4; 173.8–235.1) | 216.1 (282.6; 175.1–294.6) | 0/30; 0/30 | −0.1% |
| Fixed report range | 231.5 (346.5; 214.1–357.1) | 222.5 (251.6; 212.1–257.6) | 0/30; 0/30 | −3.9% |
| Note autosave | 798.7 (805.0; 790.8–806.7) | 798.7 (805.2; 794.5–810.5) | 0/30; 0/30 | 0.0% |
| Timer start to running UI | 53.0 (58.7; 42.5–59.0) | 49.7 (59.0; 42.2–59.3) | 0/30; 0/30 | −6.2% |
| Timer stop to stopped UI | 49.5 (51.8; 46.9–51.9) | 49.3 (51.5; 47.3–52.2) | 0/30; 0/30 | −0.4% |
| Timer update on second page, action to frame | 32.3 (45.4; 26.6–48.0) | 36.3 (42.3; 25.6–44.9) | 0/30; 0/30 | +12.4% |
| WebSocket residual wait after HTTP ack | 0 (0; 0–0) | 0 (0; 0–0) | 0/30; 0/30 | Censored at zero |

Exact and near-match searches each returned the expected 12 note results during fixture validation. Browser search rendered results and the fuzzy-fallback notice. Board pagination returned 20 cards on each page; Gantt rendered 48 rows. Note autosave, timer start/stop, and second-page WebSocket assertions passed. In all 60 WebSocket samples the matching event arrived before the HTTP acknowledgment, so residual wait is left-censored at zero and is not a gate candidate.

## Comparison and artifacts

Median differences between comparable batches ranged from −6.2% to +12.4%. Run A's report-range p95 and Run B's Gantt p95 are elevated relative to their paired batches; their raw values are retained without assigning an unverified cause or excluding samples.

- [Run A raw browser, request, and Resource Timing data](../local-artifacts/performance/20261009-hard05/run-mobile-a.json)
- [Run B raw browser, request, and Resource Timing data](../local-artifacts/performance/20261009-hard05/run-mobile-b.json)
- [Independent sparse fixture and expected counts](../local-artifacts/performance/20261009-hard05/mobile-fixture/fixture.json)
- [Desktop and mobile visual screenshots](../local-artifacts/performance/20261009-hard05/visual/)
- [Shared report-only threshold proposal and dry-run](2026-10-09-hard05-gate-proposal.md)

## Failure groups and corrections

| Suspected root cause | Case count | Suite count | Evidence |
| --- | ---: | ---: | --- |
| None in these two mobile Chromium batches | 0 | 0 | Both reports contain 30 successful samples per journey and no browser or API request failures. |

Earlier diagnostic attempts exposed collector defects (a browser Resource Timing closure error, request-body capture behavior, and a Gantt row assertion before rendering settled). Those attempts are excluded from this baseline; the collector fixes are committed in `af653b8`. No product defect was identified.
