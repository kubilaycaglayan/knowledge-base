# E2E run: emulated iPhone WebKit timer suite

- Date (UTC): 2026-10-08
- Commit: `fb8f96a` (implementation changes were uncommitted in the working tree)
- Compose project: `knowledge-base-timer-ws-smoke-2431913-1791485514812141541` (unique; removed by runner)
- Images (tag and immutable ID): `knowledge-base-api:test-only` — `sha256:9525709d1e88a188f47b74aa2d2e48359ab9a3dd067053514f8c5404dc290fc7`; `knowledge-base-web:test-only` — `sha256:d7b39ce15ea76d10276f91cc2cfb7c1e5ea1502c0790547e4d6e4a06cb3f0174`
- Browser/profile: Playwright WebKit 26.6, emulated iPhone, 390×844, touch enabled, device scale factor 3, headless
- Environment: Linux development host, Node, Docker Compose disposable stack
- Suite outcomes: timer WebSocket API probe passed; web timer suite 2/2 passed (socket sync and HTTP fallback)
- Failed cases: None
- Artifacts/logs: terminal output from `BROWSER_ENGINE=webkit BROWSER_PROFILE=iphone ./scripts/run-timer-websocket-e2e.sh`; no logs or screenshots retained
- Fixed-data performance: not measured; no baseline established.

## Failure groups

| Suspected root cause | Case count | Suite count | Cases | Evidence / investigation |
| --- | ---: | ---: | --- | --- |
| Unclassified | 0 | 0 | None | Both timer cases and the API probe passed |

## Root-cause corrections

- None needed for this run.

## Profile and scope notes

This validates timer WebSocket synchronization and HTTP polling fallback on emulated iPhone WebKit. It does not cover reconnect after a socket drops, auth/session restoration, notes, search, or board pagination in this profile. It does not represent Chrome on a physical iPhone.
