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
- Result: **not suitable for timed baseline collection**. No performance
  samples were collected; the active development stack must not be stopped or
  altered for this task. Re-run the preflight when the machine is idle.

This record is a time-bound preflight only. It does not satisfy a performance
baseline, identify a stable machine class, or establish browser journey timing.
