# HARD-07 environment preflight (not a test or performance run)

- Captured (UTC): 2026-10-09 11:59:35
- Repository commit: `6c7e90ec408e8c1a641d7ad5e3ee18ce2beb6c60`; tracked worktree was clean. An unrelated,
  untracked screenshot directory existed at
  `frontend/harden-tests/local-artifacts/`; it is excluded from this report.
- Host: Ubuntu 26.04.1 LTS, Linux `7.0.0-38-generic`, x86_64.
- CPU and memory: 32 logical CPUs; 30 GiB total RAM, 19 GiB available; 8 GiB
  swap, 7.4 GiB available.
- Disk: 738 GiB filesystem, 468 GiB free.
- Docker: 29.8.2 client/server, Linux, 32 CPUs, 32,728,072,192 bytes available
  to the daemon, `overlayfs`.
- Runtimes: Node v22.23.3, npm 10.9.9, host OpenJDK 26.0.2 (not the backend
  test runtime), Playwright 1.63.0.
- Launched browsers: Chromium 153.0.8010.12 and WebKit 26.6. Cached revisions:
  Chromium 1243 and WebKit 2359.
- Load: load average 2.27 / 1.22 / 1.08. The persistent local Knowledge Base
  development stack and auxiliary services were active. The development API
  used 40.81% CPU and 1.366 GiB of its 3 GiB limit in one instantaneous sample.
- Network/cache: no shaping was configured. This preflight launched each
  browser to read its version only; no application journey or benchmark ran.
- Result: environment snapshot only. The active development stack was left
  untouched. Do not use this snapshot as a benchmark result or assume its load,
  resource availability, or browser cache state applies to a later run.
- Capture commands: the machine/runtime commands from the
  [local browser runbook](../local-browser-validation.md), plus `uptime`,
  `docker ps`, `docker stats --no-stream`, and a short Node command that
  launched Chromium and WebKit only to read each browser's version.

The earlier [HARD-05 performance preflight](2026-10-09-hard05-environment-preflight.md)
is the environment record tied to the completed HARD-05 samples. Capture a
fresh preflight for each future baseline, as described in the
[local browser runbook](../local-browser-validation.md).
