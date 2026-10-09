# HARD-05 environment preflight (not a performance run)

- Captured (UTC): 2026-10-09 01:28
- Commit: `b204090` (HARD-05 implementation on fresh `origin/main`)
- Compose project: `knowledge-base-dev` was active; no benchmark project was
  started
- Fixture revision: not applicable; no fixture was generated
- Browser profile: not applicable; no browser journey was measured
- OS / architecture: Ubuntu 26.04.1, Linux x86_64, kernel `7.0.0-38-generic`
- Host CPU: 32 logical CPUs
- Host memory: 30 GiB total, 21 GiB available
- Docker: 29.8.2 client/server, Linux, 32 CPUs, 32,728,072,192 bytes memory,
  `overlayfs`
- Node / npm: v22.23.3 / 10.9.9
- Host Java: OpenJDK 26.0.2; this is not the backend container runtime
- Playwright: 1.63.0
- Chromium: 153.0.8010.12; WebKit cache revision `2359` present, browser version
  not launched for this preflight
- Browser cache: Chromium revision `1243` and WebKit revision `2359` are cached
- Repository disk: 470 GiB free
- Load average: 0.74, 0.90, 1.03
- Competing load: the persistent local Knowledge Base development Compose
  project and other local services were running. The dev API container showed
  53.67% CPU and 1.337 GiB / 3 GiB memory in the instantaneous Docker sample.
- Network/cache: no network shaping; browser cache state is a fresh-context
  cache for any future browser run and is not a cold server/database cache.
- Result at 01:28 UTC: preflight only; no performance samples had been collected
  at that time. This snapshot alone was not a blocker and the persistent
  development stack remained untouched. The later benchmark collection is
  documented in the linked profile reports below.

## Follow-up benchmark environment

- Captured (UTC): 2026-10-09 05:54
- Benchmark project: `knowledge-base-perf-20261009-hard05`; isolated from the
  active `knowledge-base-dev` project.
- Host: Ubuntu 26.04.1, Linux 7.0.0-38-generic, x86_64; 32 logical CPUs;
  Docker 29.8.2 with 32 CPUs and 32,728,072,192 bytes available to the daemon.
- Resource snapshot: 30 GiB host RAM, 17 GiB available, 470 GiB disk free;
  load average 4.26 / 4.56 / 3.73. The active dev API used 38.57% of one core
  and 1.356 GiB / 3 GiB; Docker API and database benchmark containers had no
  explicit CPU or memory limits. Linux CPU governor observed as `powersave`.
- Runtime: Node 22.23.3 / npm 10.9.9; Playwright 1.63.0; API Temurin Java
  21.0.12.1; PostgreSQL 16.15; Chromium 153.0.8010.12; WebKit 26.6.
- Network/cache: loopback without shaping; browser contexts were fresh per
  sample and warm reloads were separately measured. No explicit CPU or network
  throttling was configured. No other builds, tests, or benchmarks overlapped
  timed samples. Persistent Knowledge Base and AI/RAG services remained active.
- Limits: this is a post-run snapshot, not a per-sample resource time series.
  Browser and API reports preserve their own sample times, statuses, and raw
  timings; none attributes a slow observation to a component from end-to-end
  duration alone.
- Results: [desktop Chromium](2026-10-09-hard05-desktop-chromium.md),
  [mobile-size Chromium](2026-10-09-hard05-mobile-chromium.md),
  [iPhone WebKit](2026-10-09-hard05-iphone-webkit.md), and
  [API requests](2026-10-09-hard05-api.md). The desktop and mobile Chromium
  profiles and iPhone WebKit each have two comparable, independent-fixture
  batches with 3 warmups and 30 measured samples per journey. Initial results
  remain report-only.
