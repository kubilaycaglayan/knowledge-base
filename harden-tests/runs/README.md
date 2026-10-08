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
- Commit:
- Compose project:
- Images (tag and immutable ID):
- Browser engine/version and profile (viewport, user agent, touch, scale factor):
- Environment (OS, Node, Playwright):
- Suite outcomes (passed/failed/skipped):
- Failed cases:
- Artifacts/logs:
- Fixed-data performance (journey/API, sample count, median, p95, baseline):

## Failure groups

| Suspected root cause | Case count | Suite count | Cases | Evidence / investigation |
| --- | ---: | ---: | --- | --- |
| Unclassified | 0 | 0 | None | No failures |

## Root-cause corrections

- None yet.
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
