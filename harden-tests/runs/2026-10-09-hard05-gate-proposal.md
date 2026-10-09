# HARD-05 threshold proposal (report-only)

## Comparison set

This proposal uses the two comparable sparse-fixture runs in each browser profile:

- Desktop Chromium: `hard05-20261009-a-desktop-v2` and `hard05-20261009-b-desktop`, browser harness commit `af653b8`.
- Mobile-size Chromium: `hard05-20261009-mobile-a` and `hard05-20261009-mobile-b`, browser harness commit `e605d11`.
- Emulated iPhone 13 WebKit: `hard05-20261009-webkit-a` and `hard05-20261009-webkit-b`, browser harness commit `e605d11`.
- All use app image source commit `9fe753a29931`, the same immutable app image IDs, `knowledge-base-performance-fixture-v1` sparse counts, and the same machine class. Desktop, mobile-size Chromium, and WebKit remain separate populations.

The profile reports contain the per-run sample counts, median, p95, min/max, failures, and raw artifact links: [desktop Chromium](2026-10-09-hard05-desktop-chromium.md), [mobile-size Chromium](2026-10-09-hard05-mobile-chromium.md), and [iPhone WebKit](2026-10-09-hard05-iphone-webkit.md). Each batch has 3 warmups and 30 measured samples for every journey. Browser median differences across the compared batches ranged from −6.7% to +12.4%; p95 tails varied more, including mobile report-range and Gantt results and WebKit board-next-page. All raw values remain available and no outliers were removed.

## Candidate browser rule

This rule is a proposal only; it is not wired into CI and cannot fail a build today.

- Statistic: median of 30 browser-observed samples for one journey and one exact browser profile.
- Baseline median: arithmetic mean of the two reported run medians for the same profile, journey, sparse fixture revision, and app image.
- Candidate limit: `baseline median + max(20% of baseline median, 100 ms)`.
- Minimum material slowdown: 100 ms. The floor reduces noise for short actions; the 20% relative band scales longer actions.
- p95: report and monitor only. Current repeated p95 values show wider tail variation, so p95 is not a proposed failure statistic.
- Excluded metrics: API-only sampler values (their two batches differed by 9.2%–36.6%), and the WebSocket residual-wait metric where most samples were already delivered before the HTTP acknowledgment. The action-to-frame browser journey remains eligible.
- Compatibility: compare only the exact profile, fixture revision/counts, browser engine/version class, viewport/device settings, app image source, and method. Never compare profile groups to one another.
- Incomplete samples: a missing journey, fewer than 30 measured samples, a timeout, a request failure, or a failed functional assertion makes that comparison invalid and must be reported as an invalid measurement; it cannot pass as a faster result.

## Dry-run demonstration

For desktop Chromium exact search, the two medians are 224.1 ms and 221.4 ms, so the candidate baseline is 222.75 ms. The limit is 322.75 ms (`222.75 + max(44.55, 100)`). Both observed medians pass. Adding a controlled 101 ms slowdown to every sample in a copy of Run A yields a 325.1 ms median, which crosses the candidate limit. This is an arithmetic dry run of the rule, not a CI implementation or a measured application regression.

Proposed failure text if a gate is separately approved:

```text
HARD-05 regression: chromium-desktop/search-exact median 325.1 ms exceeds 322.8 ms (baseline 222.8 ms; +102.4 ms; sparse-v1; 30/30 valid samples).
```

The 100 ms material floor and profile compatibility checks are part of that message and comparison contract.

## Rerun, refresh, and override

- If a complete batch crosses the candidate limit, capture its raw output and environment, then run one additional 3-warmup/30-sample batch with the same fixture, image, browser profile, and machine class. Keep both results. Treat the change as confirmed only if the rerun also crosses; otherwise mark it inconclusive and investigate variance.
- Refresh a baseline only in a reviewed change that includes the new raw artifact, per-profile report, fixture/image/browser metadata, variance comparison, and reason for refresh. Preserve the old report and run IDs for history; never update baselines automatically from a failing run.
- A future CI implementation must emit the message above, reject incompatible or incomplete measurements, and include a controlled regression fixture before it can be enabled.
- Override owner: a Knowledge Base repository maintainer through reviewed repository change. No override or gate is active under HARD-05.

## Decision

The initial baseline collection remains report-only. Browser median repeatability supports this candidate rule for later review, but the observed p95 spread, API batch variation, censored WebSocket residual, and absence of an implemented controlled-regression gate are reasons to keep it out of CI for now.
