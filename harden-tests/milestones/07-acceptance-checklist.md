# HARD-07 acceptance checklist: run evidence and plan hygiene

Use this checklist with [HARD-07](07-run-evidence-and-plan-hygiene.md). A
checkbox is complete only when the report or repository artifact exists.

## Canonical plan and status

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
