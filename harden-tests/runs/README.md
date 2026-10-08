# E2E run records and failure summary

Create one Markdown file per E2E pass, for example
`2026-10-08-<short-commit>-desktop-chromium.md`,
`2026-10-08-<short-commit>-mobile-chromium.md`, and
`2026-10-08-<short-commit>-iphone-webkit.md`. Keep logs and screenshots in the
CI artifact store or a local ignored artifact directory and link them here.
Never commit secrets or personal data. See the [local browser validation
runbook](../local-browser-validation.md) for exact engine/profile combinations
and machine preflight commands.

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

| Journey/API | Fixture | Warmups | Samples | Median | p95 | Min/max | Failed/timeouts | Raw data |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | --- |

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

The historical table above reconciled to 43 observed failing case
occurrences across 11 failure-group suite occurrences: 40 cases from the six
complete dated reports and 3 from the partial transcript. The partial
transcript is included for failure history only and does not count as
browser-profile coverage.

## HARD-02 investigation update (2026-10-08)

The focused real-stack board suite was run on commit `63cf4f3` against separate
disposable PostgreSQL stacks in desktop Chromium and mobile-size Chromium. The
reports below record the observed results. Neither run retained a trace,
screenshot, browser console/request log, or server log; the failure summaries
are the only durable evidence. These fresh observations can disposition those
signatures for these runs, but cannot reconstruct the historical failures'
missing DOM/network evidence.

| Historical signature | Investigation disposition | Evidence and limit |
| --- | --- | --- |
| Board setup assumes a visible selected tab after overflow | Not reproduced | The original 23 setup failures stopped after the earlier API-seeding correction. Both HARD-02 board runs completed setup. Historical run artifacts remain unavailable. |
| Session-tracker controls unavailable during keyboard/fill | Insufficient evidence | No tracker rerun or original screenshot/DOM trace was available during this investigation. |
| Archive footer covered by fixed shell/timer | Reproduced | Current desktop run found `null covered by shell dashboard-shell`; current mobile run found the floating timer intercepted archive navigation and covered the footer hit target. Two new suite occurrences, three new case occurrences. Root cause is still suspected at the shared fixed tracker/footer interaction. |
| WebKit touch caret placement and line-history gutter | Insufficient evidence | No current WebKit rerun and no historical trace/screenshot. |
| WebKit timer current-request access-control failure | Insufficient evidence | No current WebKit rerun and no historical request or server log. |
| Detached Gantt card locator | Reproduced | The mobile-size Chromium run reproduced `Element is not attached to the DOM` during scroll. Desktop did not reproduce it. Timing versus rerender cause remains suspected pending trace. |
| More boards unavailable during phone view switching | Reproduced | The mobile-size Chromium run timed out waiting for `button.board-tab-more`; no DOM snapshot was retained, so responsive state cause remains suspected. |
| Three failures in incomplete-metadata board transcript | Insufficient evidence | Original phone view-switch and board-restore causes remain unclassifiable; the archive-footer recurrence is separately evidenced above. The transcript remains excluded from profile results. |

The first HARD-02 pair added five failing case occurrences across two suite
occurrences. Follow-up runs enabled screenshot, trace, command output, exact
image/database metadata, and project-scoped container-log capture. The latest
same-commit pair is [desktop](2026-10-08-6d29b9b-desktop-chromium-board-resilience.md)
and [mobile-size Chromium](2026-10-08-6d29b9b-mobile-chromium-board-resilience.md).
The c415565 pair and 457eff2 desktop run added six observed failures after the
d2cda77 reports; the final 6d29b9b pair added five more. The cumulative table
has 63 case occurrences across 27 failure-group suite occurrences: 60 cases
from 15 complete dated reports and 3 from the partial transcript. The partial
transcript remains history-only. “Suite occurrences” counts one suite per
failure group in that suite, so one run can contribute to multiple groups.

| Suspected root cause | Case occurrences | Suite occurrences | Last seen | Confirmed correction |
| --- | ---: | ---: | --- | --- |
| Board setup assumes selected board remains a visible tab after overflow | 23 | 1 | 2026-10-08 | Corrected in earlier run; no setup failure in current board runs. |
| Session-tracker fixture controls unavailable during keyboard/fill interactions | 9 | 1 | 2026-10-08 | Insufficient evidence; historical artifacts unavailable. |
| Fixed timer/shell overlaps archive footer controls | 17 | 12 | 2026-10-08 | Reproduced in desktop and mobile Chromium; latest screenshots/traces and scoped stack logs retained locally; product cause not confirmed. |
| WebKit touch caret placement interacts with line-history gutter | 1 | 1 | 2026-10-08 | Insufficient evidence; trace unavailable. |
| WebKit timer API CORS/access-control request | 1 | 1 | 2026-10-08 | Insufficient evidence; network/server logs unavailable. |
| Detached board card locator | 5 | 5 | 2026-10-08 | Reproduced in three mobile Chromium runs; latest trace retained locally; timing versus rerender remains suspected. |
| Board menu control unavailable during phone card/view switching | 5 | 5 | 2026-10-08 | Reproduced in four mobile Chromium runs; latest screenshot/trace retained locally; responsive state cause suspected. |
| Unclassified | 2 | 1 | 2026-10-08 | The incomplete-metadata attempt retains two unresolved signatures. |

The detached Gantt locator remains classified as a suspected synchronization
or rerender issue because it recurred in the c415565 and 6d29b9b mobile runs
after not reproducing in the d2cda77 follow-up. The latest trace is retained
locally.

The earlier `Unclassified` count is preserved because the local transcript does
not support a root-cause assignment. Reproduced and insufficient-evidence
signatures remain listed so the cumulative table does not erase prior failures.
