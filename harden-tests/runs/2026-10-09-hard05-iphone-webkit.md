# HARD-05 performance run: emulated iPhone 13 WebKit

## Run metadata

- Date (UTC): 2026-10-09
- Run A: 05:48:16–05:51:23 UTC; `hard05-20261009-webkit-a`
- Run B: 05:51:26–05:54:35 UTC; `hard05-20261009-webkit-b`
- Browser harness revision: `e605d11`; app image source revision: `9fe753a29931`
- Fixture: `knowledge-base-performance-fixture-v1`, sparse, independent WebKit-only disposable account; counts were verified before timing.
- Exact profile: Playwright WebKit 26.6, Playwright 1.63.0, iPhone 13 device user agent, 390×844 viewport and screen, touch enabled, device scale factor 3.
- Compose project: `knowledge-base-perf-20261009-hard05`; loopback proxy `http://localhost:26381`.
- Images: `knowledge-base-api:perf-20261009050732-9fe753a29931` (`sha256:df6da4d71188a68f36e30f20ef97452ddc532de11cf8f9f02293e9cb93c38970`); `knowledge-base-web:perf-20261009050732-9fe753a29931` (`sha256:42fd68d5fbfb4d3e5ff32a09947ce4856184003adc7cbd84399ecc47f49a1192`).
- Database: PostgreSQL 16.15; disposable database healthy and Flyway migrations completed before fixture setup.
- Environment: Ubuntu 26.04.1, Linux 7.0.0-38-generic, x86_64; 32 logical CPUs; Docker 29.8.2; host Node 22.23.3 / npm 10.9.9; API Temurin Java 21.0.12.1. Docker API/database containers had no explicit CPU or memory limits. Host RAM 30 GiB; 17 GiB available at the 05:54 UTC post-run snapshot; Docker reported 32,728,072,192 bytes.
- Competing load: development Knowledge Base and local AI/RAG services remained active. At the 05:54 UTC post-run snapshot, load average was 4.26/4.56/3.73 across 32 CPUs and the dev API was using 38.57% of one core and 1.356 GiB of its configured 3 GiB. No other builds, tests, or benchmarks ran during timed samples. This is contextual telemetry, not a per-sample time series.
- Network/cache: loopback, no shaping, fresh browser context/cache for each sample; warm reload performs an untimed navigation then reloads in the same context. API requests include connection setup when it occurs. No browser extensions.
- Command: `API_BASE_URL=http://localhost:26381 BROWSER_ENGINE=webkit BROWSER_PROFILE=iphone PERFORMANCE_WARMUPS=3 PERFORMANCE_SAMPLES=30 node frontend/scripts/performance-browser-baseline.mjs <private-webkit-fixture.json>`; output paths are linked below. The API token came from the mode-0600 fixture and was never printed.
- Outcome: both runs exited 0; 11 journeys per run, 3 warmups and 30 measured samples per journey; 330 measured journey rows per run. Timed browser errors, request failures, and timeouts: 0. Run B recorded one untimed `GET /api/v1/timers/draft` canceled when its setup navigation reloaded; the timed sample completed successfully. No console or page errors occurred.
- WebKit response-body access is best effort: Playwright reported its protocol-level “missing content of resource” error for 223 Run A and 248 Run B responses after `requestfinished`. These are collector body-read limitations, not failed HTTP requests. Request duration/status still come from completed Playwright requests, response bytes use the body or `Content-Length` fallback, and browser Resource Timing is retained. No response-size field was unknown in these two reports.
- Cleanup: the uniquely named Compose project was removed after all profiles completed with its project-scoped `down --volumes --remove-orphans` command. Shared development services and volumes were left running.

## Workload and results

Browser duration is measured from the journey start through its semantic completion using the browser's monotonic `performance.now()` clock. It includes rendering and local network wait, not server-only time. Request timing uses Playwright request start through `requestfinished`, with method, path, status, duration, bytes, and in-page Resource Timing retained. Outliers were not excluded.

| Journey / metric | Run A median (p95; min–max) ms | Run B median (p95; min–max) ms | Failures / samples A; B | Median delta |
| --- | ---: | ---: | ---: | ---: |
| Authenticated cold startup | 152 (162; 143–181) | 154 (169; 149–172) | 0/30; 0/30 | +1.3% |
| Same-context warm reload | 88 (100; 81–108) | 89 (111; 79–114) | 0/30; 0/30 | +1.1% |
| Exact search | 280 (296; 270–307) | 286 (312; 268–321) | 0/30; 0/30 | +2.1% |
| Near-match search | 291 (309; 270–311) | 290 (314; 272–323) | 0/30; 0/30 | −0.3% |
| Board first page | 228 (237; 216–238) | 232 (263; 220–281) | 0/30; 0/30 | +1.8% |
| Board next page | 80 (93; 63–97) | 81 (115; 61–149) | 0/30; 0/30 | +1.3% |
| Gantt range, all 48 rows | 300 (319; 266–328) | 304 (329; 278–343) | 0/30; 0/30 | +1.3% |
| Fixed report range | 408 (435; 388–439) | 419 (447; 400–454) | 0/30; 0/30 | +2.7% |
| Note autosave | 809 (823; 803–824) | 809 (820; 798–821) | 0/30; 0/30 | 0.0% |
| Timer start to running UI | 80 (93; 72–129) | 81 (96; 73–106) | 0/30; 0/30 | +1.3% |
| Timer stop to stopped UI | 44 (59; 38–61) | 47 (58; 37–59) | 0/30; 0/30 | +6.8% |
| Timer update on second page, action to frame | 55 (76; 39–78) | 54 (75; 40–81) | 0/30; 0/30 | −1.8% |
| WebSocket residual wait after HTTP ack | 0 (0; 0–5.678) | 0 (4.829; 0–7.825) | 0/30; 0/30 | Censored at zero |

Exact and near-match searches each returned 12 note results during fixture validation. Browser search rendered its result and fuzzy-fallback signals. Board pagination returned 20 cards on each page; Gantt rendered 48 rows. Note autosave, timer start/stop, and second-page WebSocket assertions passed. The matching WebSocket event arrived before HTTP acknowledgment in 29/30 Run A samples and 28/30 Run B samples; the remaining observed residual waits are retained. This residual metric is not a gate candidate because most observations are left-censored at zero.

## Comparison and artifacts

Median differences between comparable batches ranged from −1.8% to +6.8%. The board next-page p95 and maximum were higher in Run B, and all raw outliers remain. The one setup cancellation and response-body capture limitations are reported above; neither affected a timed journey.

- [Run A raw browser, request, and Resource Timing data](../local-artifacts/performance/20261009-hard05/run-webkit-a.json)
- [Run B raw browser, request, and Resource Timing data](../local-artifacts/performance/20261009-hard05/run-webkit-b.json)
- [Independent sparse fixture and expected counts](../local-artifacts/performance/20261009-hard05/webkit-fixture/fixture.json)
- [WebKit device-profile smoke report](../local-artifacts/performance/20261009-hard05/iphone-webkit-device-smoke.json)
- [Shared report-only threshold proposal and dry-run](2026-10-09-hard05-gate-proposal.md)

## Failure groups and corrections

| Suspected root cause | Case count | Suite count | Evidence |
| --- | ---: | ---: | --- |
| Canceled untimed setup request during warm-reload setup | 1 | 1 | Run B's `/api/v1/timers/draft` was canceled by the deliberate reload; no measured sample or browser assertion failed. |
| Timed WebKit journey failures | 0 | 0 | Both reports contain 30 successful samples per journey and no timed API failures. |

Earlier WebKit diagnostics used a desktop Safari user agent and an assertion before Gantt rendering finished. The final profile uses Playwright's iPhone 13 device user agent, waits for all expected Gantt rows, and is the only WebKit population used for comparison.
