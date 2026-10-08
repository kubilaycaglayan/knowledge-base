# Local browser validation runbook

This runbook describes how to use the available Linux development machine for
repeatable Knowledge Base desktop and mobile browser checks. It records the
machine as observed on 2026-10-08; hardware load, installed tools, browser
caches, and free disk space change, so capture a fresh preflight for each
performance baseline or long validation run.

## Machine capability snapshot

Observed in the repository worktree on 2026-10-08:

| Resource | Observed value | Use and limit |
| --- | --- | --- |
| Host | Ubuntu 26.04.1 LTS, Linux x86_64, kernel `7.0.0-38-generic` | Suitable for Docker and headless browser suites; not an iOS simulator host. |
| CPU | 32 logical CPUs reported by `nproc` and Docker | Enough parallel capacity for builds, but run performance samples serially and record concurrent load. |
| Memory | 30.5 GiB available to Docker; 23 GiB available to the host at snapshot time | Host availability is transient; recapture before measurements. |
| Filesystem | `/dev/nvme0n1p4`, 738 GiB total, 476 GiB free at snapshot time | Check free space before image builds and retained artifacts. |
| Docker | Client/server 29.8.2, Linux daemon, `overlayfs` | Disposable Compose projects are available. Do not use global prune commands. |
| Node | Node 22.23.3, npm 10.9.9 | Frontend lockfile dependencies were already installed. |
| Host Java | OpenJDK 26.0.2 | Backend project guidance runs Gradle in `gradle:8.13-jdk21`; this host JDK is not the backend test runtime. |
| Playwright | `playwright@1.63.0` in `frontend/` | Browser launch is headless in the real-stack suites. |
| Browser cache | Chromium revision `1243` and WebKit revision `2359` present under `~/.cache/ms-playwright` | Both browser engines were cached. Confirm current executables before relying on this snapshot. |

This evidence establishes a headless Linux browser-test environment. It does
not establish physical Android Chrome, physical iPhone Safari/Chrome, or iOS
simulator coverage. Capture any connected-device or simulator run separately
with its OS, browser, device, and version.

## Preflight record

Run from the repository root immediately before a comparison run. Copy the
output into the local report metadata, then remove or redact usernames and
machine identifiers before storing it in a shared artifact.

```bash
date -u '+%Y-%m-%d %H:%M:%S UTC'
git rev-parse --short HEAD
git status --short
uname -a
cat /etc/os-release
nproc
free -h
df -h .
node --version
npm --version
java -version
docker version --format 'Client={{.Client.Version}} Server={{.Server.Version}}'
docker info --format 'OS={{.OSType}} CPUs={{.NCPU}} MemoryBytes={{.MemTotal}} Storage={{.Driver}}'
npm ls playwright --depth=0 --prefix frontend
find "$HOME/.cache/ms-playwright" -maxdepth 1 -mindepth 1 -type d -printf '%f\n' | sort
```

Record the real browser version in each report. The cache directory revision
is useful inventory evidence, but it is not a substitute for the browser
version reported by the launched binary.

## Supported local profile matrix

The real-stack tests choose engine and viewport independently. Run each profile
from the same commit and fixture setup, one profile at a time, so Docker builds
and CPU contention do not distort comparisons.

| Report profile | Invocation | Meaning |
| --- | --- | --- |
| `desktop-chromium` | `BROWSER_ENGINE=chromium BROWSER_PROFILE=desktop ./scripts/test-run-all.sh` | Chromium with desktop viewport. The board suite uses 1440×900; other suites may use their own documented desktop viewport. |
| `mobile-chromium` | `BROWSER_ENGINE=chromium BROWSER_PROFILE=iphone ./scripts/test-run-all.sh` | Chromium with 390×844, `isMobile`, touch input, and device scale factor 3. Report as mobile-size Chromium emulation, not physical Android Chrome. |
| `iphone-webkit` | `BROWSER_ENGINE=webkit BROWSER_PROFILE=iphone ./scripts/test-run-all.sh` | WebKit with 390×844, `isMobile`, touch input, and device scale factor 3. Report as emulated WebKit, not a physical iPhone. |

The profile variable name `iphone` controls only the mobile viewport/context in
these test files; combining it with Chromium does not install an Android
system image or change the browser binary's default user agent. Keep the
machine/browser-engine distinction in report names and notes.

For a focused board check, the same three environment combinations can be
applied to `./scripts/run-board-e2e.sh`. Use
`./scripts/run-line-history-e2e.sh` for line-history editor behavior and
`./scripts/run-timer-websocket-e2e.sh` for the proxy/WebSocket journey. Each
focused runner creates and removes its own uniquely named Compose project.
`test-run-all.sh` additionally exercises the broad Linux checks and shares a
single disposable stack across its smoke and real-stack suites for each run.

## Run procedure and evidence

1. Confirm the worktree commit and profile values; use the same commit for all
   profiles being compared.
2. Capture the preflight and note whether unrelated builds or browser sessions
   are using the host.
3. Run one profile at a time. Keep a local transcript under `/tmp` or an
   ignored artifact directory; do not enable shell tracing for commands that
   use generated credentials.
4. Record the command, UTC start/end, unique Compose project, image tags and
   immutable IDs, browser version, viewport, user agent, touch, scale factor,
   and suite pass/fail/skip counts in a separate report for each profile.
5. On failure, retain the trace, screenshot, browser console/request details,
   and relevant container logs. Review them for credentials and personal data
   before linking or sharing.
6. Confirm the runner removed only its own Compose project. Preserve active
   development resources and protected volumes; never use global prune.
7. If collecting performance data, use fixed fixtures, idle the machine,
   record the resource snapshot again, and keep cold-start and steady-state
   samples separate. Do not compare measurements across profiles as if they
   were the same workload.

Do not mark a browser profile or journey complete from a viewport screenshot
alone. Acceptance requires the named interaction assertions and retained run
evidence in [HARD-01](milestones/01-acceptance-checklist.md) and
[HARD-02](milestones/02-acceptance-checklist.md).
