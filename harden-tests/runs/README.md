# E2E run records and failure summary

Create one Markdown file per E2E pass, for example
`2026-10-08-<short-commit>-desktop-chromium.md`,
`2026-10-08-<short-commit>-mobile-chromium.md`, and
`2026-10-08-<short-commit>-iphone-webkit.md`. Keep logs and screenshots in the
CI artifact store or a local ignored artifact directory and link them here.
Never commit secrets or personal data. See the [local browser validation
runbook](../local-browser-validation.md) for exact engine/profile combinations
and machine preflight commands.

## HARD-05 performance reports

- [Desktop Chromium](2026-10-09-hard05-desktop-chromium.md)
- [Mobile-size Chromium](2026-10-09-hard05-mobile-chromium.md)
- [Emulated iPhone 13 WebKit](2026-10-09-hard05-iphone-webkit.md)
- [API request sampler](2026-10-09-hard05-api.md)
- [Report-only threshold proposal](2026-10-09-hard05-gate-proposal.md)
- [Environment preflight and benchmark snapshot](2026-10-09-hard05-environment-preflight.md)

## Required report template

```markdown
# E2E run: <profile>

- Date (UTC):
- Start/end time (UTC):
- Commit:
- Exact command and relevant environment overrides (redact generated secrets):
- Exit status:
- Compose project:
- Stack retained? reuse window and project-scoped cleanup command:
- Images (tag and immutable ID):
- Database engine/version and migration result (for stack-backed runs):
- Browser engine/version and profile (viewport, user agent, touch, scale factor):
- Environment (OS/version/architecture, Node, Playwright, Docker, CPU/memory/disk limits):
- Suite outcomes (passed/failed/skipped):
- Failed cases:
- Artifacts/logs:
- Fixed-data performance (fixture/profile, journey/API, warmups, samples, median, p95, min/max, failures/timeouts, baseline):
- Performance environment (machine load, CPU/memory limits, runtime versions, cache/network state):
- Performance raw data / trace artifacts:

## Failure groups

| Suspected root cause | Case count | Suite count | Cases | Evidence / investigation |
| --- | ---: | ---: | --- | --- |
| Unclassified | 0 | 0 | None | No failures |

## Root-cause corrections

- None yet.
```

Capture actual values while the run is active. If an older transcript lacks a
value, write `Not recorded` and retain it as unknown; never copy metadata from a
nearby run. Link artifacts at a location reviewers can access and record their
retention or expiry. Local `/tmp` paths are provenance notes only until the
artifact is copied to durable ignored storage or CI artifacts.

For a HARD-05 performance report, add these sections beneath the common run
metadata. Keep each desktop Chromium, mobile-size Chromium, and emulated iPhone
WebKit report separate. The phone-sized Chromium profile is responsive/touch
emulation and must not be labeled as a physical Android Chrome run.

```markdown
## Performance workload

- Fixture generator/version and profile:
- Fixture counts and expected result counts:
- Setup/verification/cleanup command and disposable project:
- Journey start and completion signals:
- API method/path and client/server timing source:
- Warm/cold cache and network shaping:
- Warmups / measured samples / outlier policy:
- Machine load and relevant resource limits:
- API timing definition: monotonic request start through response body download;
  state whether connection setup is included and do not call it server latency.
- Browser timing definition: navigation/action start through the semantic UI
  completion signal; retain trace/network data to separate request wait and
  render wait.
- Outlier policy (preserve raw values; any exclusion needs an observable cause):

| Journey/API | Fixture | Warmups | Samples | Median | p95 | Min/max | Failed/timeouts | Raw data |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | --- |

The report-only API sampler is [`frontend/scripts/performance-api-baseline.mjs`](../../frontend/scripts/performance-api-baseline.mjs).
Use a private manifest copied from
[`performance-api.manifest.example.json`](../performance-api.manifest.example.json)
and set `API_BASE_URL` to an isolated local stack. Create data with
[`seed-performance-fixture.mjs`](../../frontend/scripts/seed-performance-fixture.mjs)
using the same Compose project. Fixture output contains a disposable account
token, is written with mode `0600`, and belongs under the ignored
`harden-tests/local-artifacts/` path. Tear down only that named project using
`docker compose -p "$PERFORMANCE_COMPOSE_PROJECT" -f docker-compose.yml -f docker-compose.smoke.yml -f docker-compose.performance.yml down --volumes --remove-orphans`.
The sampler includes response
body download, does not isolate connection setup, and does not measure browser
rendering or server-only time. It is not evidence for a browser journey unless
paired with browser timing and functional assertions. Raw output should be
written under an ignored artifact directory and reviewed for secrets before
sharing.

## Baseline comparison

- Comparable run IDs and commits:
- Within-run and between-run variance:
- Proposed absolute and relative thresholds (report-only until approved):
- Rerun / baseline refresh / override policy:
```

When the same failure occurs in multiple cases or suites, count each affected case and suite under one suspected cause. Preserve an `Unclassified` row for failures without evidence. Correct the grouping here after investigation and record the evidence and correction in the detailed run report.

## Cumulative failure groups

Counts below include the initial Chromium run in [2026-10-08-fb8f96a-chromium.md](2026-10-08-fb8f96a-chromium.md), the emulated iPhone WebKit line-history, timer, and board runs, focused desktop Chromium line-history and board reruns, and the incomplete-metadata local board attempt in [2026-10-08-unclassified-board-attempt.md](2026-10-08-unclassified-board-attempt.md). The latter contributes its two unclassified signatures and one recurrence of the archive-footer hit test. These are observed failure occurrences; resolved groups remain listed so later runs can show recurrence.

| Suspected root cause | Case occurrences | Suite occurrences | Last seen | Confirmed correction |
| --- | ---: | ---: | --- | --- |
| Board setup assumes selected board remains a visible tab after overflow | 23 | 1 | 2026-10-08 | Corrected: seed fixture board via API and wait on selected route ID; focused rerun passed setup |
| Session-tracker fixture controls unavailable during keyboard/fill interactions | 9 | 1 | 2026-10-08 | Unclassified pending log/screenshot review |
| Fixed timer/shell overlaps archive footer controls | 4 | 3 | 2026-10-08 | Pending layout investigation |
| WebKit touch caret placement interacts with line-history gutter | 1 | 1 | 2026-10-08 | Pending browser trace |
| WebKit timer API CORS/access-control request | 1 | 1 | 2026-10-08 | Pending network trace and server logs |
| Detached board card locator | 2 | 2 | 2026-10-08 | Pending browser trace; signature occurred in Chromium and WebKit |
| Board menu control unavailable during phone card/view switching | 1 | 1 | 2026-10-08 | Pending responsive-state investigation |
| Unclassified | 2 | 1 | 2026-10-08 | Phone view-switch row absent and board restore selected-tab timeout in the incomplete-metadata local attempt; see report |

The cumulative table now reconciles to 43 observed failing case occurrences
across 11 failure-group suite occurrences: 40 cases from the six complete
dated reports and 3 from the partial transcript. The partial transcript is
included for failure history only and does not count as browser-profile
coverage.
