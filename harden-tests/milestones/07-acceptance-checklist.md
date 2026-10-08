# HARD-07 acceptance checklist: run evidence and plan hygiene

Use this checklist with [HARD-07](07-run-evidence-and-plan-hygiene.md). A
checkbox is complete only when the report or repository artifact exists.

## Canonical plan and status

- [x] Verify `harden-tests/plan.md` is the active plan, discoverable from
  [`harden-tests/README.md`](../README.md); verify
  [`docs/test-hardening-plan.md`](../../docs/test-hardening-plan.md) labels
  TH-01–TH-19 as the completed historical first phase and links the active
  plan.
- [x] Audit current dated reports and cumulative failure totals. Six complete
  profile/suite reports plus one explicitly partial transcript exist; they
  record 43 observed failing case occurrences across 11 failure-group suite
  occurrences. This reconciles the current cumulative table, but does not make
  the missing raw `/tmp` logs or metadata recoverable.
- [x] Verify current evidence limitations: run reports generally omit exact
  start/end time, exit code, full machine/runtime detail, and durable raw
  artifacts; the initial Chromium run is not the desktop profile, and no
  mobile-size Chromium pass is recorded. The partial board transcript remains
  unclassified and cannot establish profile coverage.
- [ ] Name one current plan in the hardening index and label historical plans
  with their completed scope/date and a prominent link to the active plan.
- [ ] Reconcile every active-plan checkbox with source, scripts, CI, and run
  reports; mark complete only when evidence meets its stated environment and
  profile scope.
- [ ] Distinguish required CI, opt-in local, manual, platform-limited, disabled,
  and not-yet-implemented coverage in the test map.
- [ ] Keep each milestone status synchronized between summary plan, milestone
  index, milestone document, and acceptance checklist.
- [ ] Link tests, command, report, and known limitations for every completed
  milestone; retain incomplete items as unchecked.

### Initial run-record audit

The table records what each current artifact establishes. “Missing” means the
report must retain the value as unknown; do not infer it from a later run or
from the test names.

| Run record | What it establishes | Known gaps to preserve or resolve with a new run |
| --- | --- | --- |
| [`2026-10-08-fb8f96a-chromium.md`](../runs/2026-10-08-fb8f96a-chromium.md) | Initial broad real-stack/fixture outcomes and 33 failures in board and tracker suites. | Board viewport was 390×844 without touch, so not desktop or mobile-Chromium acceptance; no exact browser UA/machine versions, full raw logs are not retained, no performance data. |
| [`2026-10-08-fb8f96a-desktop-chromium-board.md`](../runs/2026-10-08-fb8f96a-desktop-chromium-board.md) | Desktop 1440×900 board pass results; archive-footer hit-test failure reproduced. | Commit had uncommitted changes; exact command exit status and complete environment details absent; log is local `/tmp`, not durable shared evidence. |
| [`2026-10-08-fb8f96a-desktop-chromium-lines.md`](../runs/2026-10-08-fb8f96a-desktop-chromium-lines.md) | Desktop Chromium line-history 11/11 functional results. | Phone-specific cases ran inside this desktop-named suite; touch is off; no raw traces/logs retained and no performance data. |
| [`2026-10-08-fb8f96a-iphone-webkit.md`](../runs/2026-10-08-fb8f96a-iphone-webkit.md) | Emulated phone WebKit line-history outcomes and two failure signatures. | No screenshot, browser trace, service logs, or complete machine details; terminal output only. |
| [`2026-10-08-fb8f96a-iphone-webkit-timer.md`](../runs/2026-10-08-fb8f96a-iphone-webkit-timer.md) | Emulated phone WebKit timer/socket and fallback outcomes. | No logs or screenshots retained; no auth/session restore or reconnection coverage in this pass. |
| [`2026-10-08-fb8f96a-iphone-webkit-board.md`](../runs/2026-10-08-fb8f96a-iphone-webkit-board.md) | Emulated phone WebKit board outcomes and four failure occurrences. | Raw log is machine-local; no trace/network evidence, complete environment details, or physical device result. |
| [`2026-10-08-unclassified-board-attempt.md`](../runs/2026-10-08-unclassified-board-attempt.md) | Preserves three observed board failure signatures and unique Compose project. | Commit, engine/profile, OS/runtime, image IDs, exact wrapper command, time, and shared artifacts unknown; never treat as profile pass/fail evidence. |

New passes should capture missing evidence at run time. Historical gaps cannot
be repaired by copying values from a different commit, profile, or stack.

## Per-run report completeness

- [ ] Record date/time UTC, commit, exact command, exit status, and pass/fail/
  skip counts for every suite.
- [ ] Record unique Compose project, image tags and immutable IDs, and database
  type/version and migration result for stack-backed runs.
- [ ] Record browser name/version, profile, viewport, scale factor, touch
  setting, OS, Node, Playwright, and relevant machine constraints.
- [ ] Attach a dated local machine preflight for comparison/performance runs;
  re-capture CPU, memory, Docker, disk, runtime, and browser inventory rather
  than copying a historical snapshot as current evidence.
- [ ] Keep desktop Chromium, mobile Chrome/Chromium emulation, and iPhone
  WebKit reports separate; do not infer physical-device support from emulation.
- [ ] List failed/skipped cases and classify every observed failure as
  confirmed, suspected, or unclassified with supporting evidence.
- [ ] Include artifact/log links, retention location/expiry, and performance
  sample details when measurements were collected.
- [ ] Reconcile cumulative case and suite counts with dated run reports and
  retain an `Unclassified` row when needed.
- [ ] State whether a stack was retained; if so, record the exact project-scoped
  stop/cleanup command and bounded reuse window.

## Artifact safety and cleanup

- [ ] Retain traces, screenshots, console/network logs, container logs, and
  command output for failed runs in ignored storage or CI artifacts.
- [ ] Verify artifact access and expiry are documented and links resolve for
  reviewers.
- [ ] Scan reports/artifacts for credentials, cookies, tokens, private config,
  personal data, and protected production details before committing or sharing.
- [ ] Verify test cleanup is scoped to its unique project; no global prune or
  protected-volume deletion is part of the documented workflow.
- [ ] Preserve evidence of cleanup and avoid committing bulky generated
  artifacts when durable CI storage is available.

## Coverage source classification

| Coverage path | Current classification to publish | Evidence source / boundary |
| --- | --- | --- |
| Backend, frontend, extension, security/accessibility/cleanup checks | Required CI jobs on push and pull request, with the exact job commands recorded. | [`.github/workflows/verify.yml`](../../.github/workflows/verify.yml); distinguish the broad local `test-run-all.sh` bundle from CI job composition. |
| Deployed-shaped smoke | Required CI smoke job; full stack and backup/restore are enabled there by environment. | Workflow `smoke` job and `scripts/run-smoke-tests.sh`; local invocations may set different flags. |
| Timer WebSocket and line-history real-stack browser checks | Required CI real-stack jobs on their configured Chromium paths; not proof of desktop/mobile profile matrix completion. | Workflow `timer-websocket-e2e` and `line-history-e2e`; retain their exact invocation and profile metadata. |
| Board, nav, tracker and selectable browser profiles | Local runner paths unless separately added to CI; profile support does not prove profile was run. | `scripts/test-run-all.sh`, `frontend/package.json`, and dated browser reports. |
| PostgreSQL search | Opt-in test requiring explicit disposable PostgreSQL configuration; ordinary H2 test results do not imply it ran. | `docs/testing.md` and HARD-03 checklist. |
| iOS unit/UI validation | Platform-limited to macOS/Xcode; both historical workflow jobs are hard-disabled with `if: ${{ false }}`. | `.github/workflows/verify.yml`; Linux `check-ios-note-document.sh` is Foundation-only and its CI job is also disabled. |
| Cloudflare live enforcement | Not established by repository tests; Terraform/static markers are configuration evidence only. | HARD-04 checklist; require authorized isolated staging evidence for live behavior. |
