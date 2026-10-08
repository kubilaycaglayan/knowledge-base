# Knowledge Base test hardening

This directory is the working index for test coverage, planned gaps, and durable real-stack E2E run records. Start with the [current plan](plan.md) and its [milestone task files](milestones/README.md), then read the latest run report and cumulative failure-group summary before changing a flaky test.

## Test map

| Area | Entry point | What it covers |
| --- | --- | --- |
| Backend | Dockerized `gradle test` in `scripts/test-run-all.sh` | Spring services, API integration, H2 behavior, and PostgreSQL-only search when configured |
| Web | `npm test`, `npm run build` in `frontend/` | Vue components, stores, API client, and view behavior |
| Browser acceptance | `npm run test:board`, `test:nav`, `test:tracker` | Browser workflows against deterministic fixtures |
| Real-stack browser | `scripts/test-run-all.sh` | Board/card, timer WebSocket, and note/card line-history journeys against disposable PostgreSQL/API/proxy/web containers |
| Extension | `npm test` in `chrome-extension/` | Manifest V3 client and timer behavior |
| Contracts | `node scripts/check-accessibility.mjs`, `check-security.mjs`, `check-smoke-cleanup.mjs`, `./scripts/check-image-prune.sh` | Accessibility, security, and scoped cleanup invariants |
| Deployment smoke | `scripts/run-smoke-tests.sh` | Deployed-shaped HTTP/HTTPS, database, timer, and backup/restore checks |

The open work is split into seven milestones: real-stack search/deep links,
browser failure-state coverage and flake triage, PostgreSQL/time/volume behavior,
HTTP and edge rate-limit verification, performance baselines, an active iOS
validation path, and run-evidence/plan hygiene. The milestone files define
tasks and acceptance evidence; they do not indicate that implementation has
already been completed. Existing global-search API and fixture coverage is
tracked in `docs/global-search-acceptance-checklist.md`; HARD-01 adds the
missing cross-profile real-stack evidence.

The current real-stack browser suites accept `BROWSER_ENGINE=chromium|webkit` and `BROWSER_PROFILE=desktop|iphone` (desktop Chromium is the default). For an emulated iPhone WebKit run, install the browser and its host dependencies with `(cd frontend && npx playwright install --with-deps webkit)`, then run `BROWSER_ENGINE=webkit BROWSER_PROFILE=iphone ./scripts/test-run-all.sh`. The profile uses a 390×844 viewport, touch input, and a device scale factor of 3. Mobile Chrome/Chromium emulation is a separate planned profile and is not currently selectable in these runners. An iPhone-sized viewport is not equivalent to a physical iPhone browser; it does not represent Chrome on Android or iPhone. Record the exact profile used in each report.

## Docker workflow

Use `./scripts/test-run-all.sh` for the full Linux suite; `--quick` omits the disposable Docker stack. The runner gives its Compose project a unique `knowledge-base-full-smoke-*` name and reuses the built test images and running stack for smoke plus browser suites during that invocation. A focused real-stack runner such as `scripts/run-board-e2e.sh` also creates a unique project. Keep a stack alive only for a planned, bounded reuse window, record its project name in the run record, and stop it with that project's Compose command when the window ends.

Cleanup must stay scoped to the generated test project and explicitly test-owned resources. Never run global image, volume, or system prune commands. Do not remove images used by containers, shared development images, named reusable test tags, or protected persistent volumes. Remove only unreferenced test-owned images; retain the newest three disposable build tags. The cleanup contract is checked by `scripts/check-smoke-cleanup.mjs` and `scripts/check-image-prune.sh`.

## Failure triage

Before changing a failing assertion, inspect [runs/README.md](runs/README.md) and the latest detailed report. Group cases by suspected shared cause (for example, auth/session setup, network timing, shared fixture state, or browser engine behavior), count affected cases and suites, and investigate the largest group first. Keep a separate `Unclassified` group until evidence supports a cause. After investigation, update the report with the confirmed cause or correct the earlier classification. Do not hide missing controls behind conditional locator-count assertions.

Each desktop Chromium and emulated iPhone WebKit pass gets its own report under [`runs/`](runs/). Include dates, commit, unique Compose project, image refs, browser/profile, outcomes, failed cases, grouped counts, and links to retained logs/artifacts. Do not place credentials, tokens, or personal data in reports or artifacts.
