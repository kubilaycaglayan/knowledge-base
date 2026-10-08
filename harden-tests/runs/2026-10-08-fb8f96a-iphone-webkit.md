# E2E run: emulated iPhone WebKit line-history suite

- Date (UTC): 2026-10-08
- Commit: `fb8f96a` (workspace HEAD when implementation began; browser-profile support was uncommitted in the working tree)
- Compose project: `knowledge-base-lines-smoke-2423510-1791485415085421813` (unique; removed by runner)
- Images (tag and immutable ID): `knowledge-base-api:test-only` — `sha256:d840bfe6caf29bee3fbe8720d3c061d5568d9b7e3d675f2405fc692812b984aa`; `knowledge-base-web:test-only` — `sha256:516e77a0623850d167a16d827ef594a26667b1289732321b2818c7d42ad38c00`
- Browser/profile: Playwright WebKit 26.6, emulated iPhone, 390×844, touch enabled, device scale factor 3, headless
- Environment: Linux development host, Node, Playwright 1.63.0; WebKit browser and host dependencies installed with Playwright
- Suite outcomes: line-history real-stack 10 passed, 2 failed across 12 tests. The first two line-history suites and board-card suite passed; one assistive-technology test failed and the after hook reported a browser request error.
- Failed cases: quick-click caret placement with line-history gutter on; after-hook page-error check for `/api/v1/timers/current` CORS/access-control error.
- Artifacts/logs: terminal output from `BROWSER_ENGINE=webkit BROWSER_PROFILE=iphone ./scripts/run-line-history-e2e.sh`; no screenshots or service logs retained.
- Fixed-data performance: not measured; no baseline established.

## Failure groups

| Suspected root cause | Case count | Suite count | Cases | Evidence / investigation |
| --- | ---: | ---: | --- | --- |
| WebKit touch caret placement interacts with the line-history gutter | 1 | 1 | `types where a quick click lands, with the gutter on and off` | Expected `Plan`, `BuildX`; observed timestamp text prepended to the first line and `Unsaved` prepended to the second. Reproduced in this pass only; inspect pointer/caret timing and touch event behavior. |
| Timer API CORS/access-control request emitted during line-history suite | 1 | 1 | after hook: `the page threw errors` | WebKit reported `/localhost:26380/api/v1/timers/current due to access control checks.` Other line-history cases passed. No network trace retained; determine whether this is app behavior or a WebKit-specific cross-origin check. |
| Unclassified | 0 | 0 | None | No additional failed cases observed. |

## Root-cause corrections

- None yet. These failures are recorded as suspected causes pending browser trace and server-log review.

## Profile and scope notes

This covers line history and board-card line history only. It is an emulated iPhone WebKit profile, not Chrome on physical iPhone hardware. Search/deep-link, auth/session, and broad board pagination journeys were not run in this profile. The runner removed its isolated Compose project and volumes after the pass.
