# HARD-05 acceptance checklist: performance baselines

Use this checklist with [HARD-05](05-performance-baselines.md). Start with
report-only measurements; thresholds require repeatable evidence.

## Workload and environment

- [ ] Name each measured journey and its start/end events: startup/warmup,
  exact and near-match search, board first/next page, Gantt load, report load,
  note save, timer start/stop, and WebSocket update.
- [ ] Include API timings for corresponding expensive endpoints and state
  whether the measurement is client-observed or server-observed.
- [ ] Version deterministic fixture generation and document sparse/dense
  account sizes, card/page counts, search corpus, and index-relevant content.
- [ ] Confirm every fixture is disposable and contains no personal records or
  credentials.
- [ ] Record commit, Compose project, image tags and immutable IDs, OS,
  architecture, CPU/memory limits, Node/JDK/PostgreSQL versions, browser and
  Playwright versions, viewport/profile, network conditions, and cache state.
- [ ] Measure desktop Chromium and mobile Chrome/Chromium phone emulation as
  separate populations; do not combine mobile WebKit observations with them.
- [ ] State whether the current machine was idle or under competing load and
  record relevant resource constraints.

## Measurement method

- [ ] Define warmup count, measured sample count, median, p95, and outlier
  handling before collecting baseline values.
- [ ] Separate cold startup/cache observations from steady-state samples.
- [ ] Use stable synchronization points and bounded timeouts; do not time
  arbitrary sleeps or include fixture setup unless the metric explicitly
  measures setup.
- [ ] Record raw samples or a retained artifact sufficient to recompute the
  summary statistics.
- [ ] Collect at least two comparable same-profile runs for every proposed
  gated metric and quantify observed variance/noise sources.
- [ ] Keep comparisons within the same fixture, machine class, browser profile,
  and measurement method; label incomparable runs.

## Reporting and gates

- [ ] Append results to a dated run report using the run template and link raw
  artifacts without committing large generated output.
- [ ] Initial baseline collection is report-only and cannot fail CI.
- [ ] For any proposed 20% gate, state baseline sample set, absolute and
  relative thresholds, rationale, variance, rerun policy, and override owner.
- [ ] Demonstrate the proposed gate against repeated data before enabling it;
  include a controlled regression example if practical.
- [ ] Do not claim a gate protects a journey/profile that it does not measure.
- [ ] Remove or expire temporary accounts/data and verify artifact reports
  contain no secrets or personal content.
