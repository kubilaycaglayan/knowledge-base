# Test hardening plan

Goal: close the gaps in automated coverage that matter most for a
multi-user, internet-facing app — authentication, per-user data isolation,
input validation, and small units that currently have no tests at all.
This plan adds tests only; any defect a test exposes is fixed separately with
the failing test committed first (see the bug-fix workflow).

## Gap survey (2026-09-29)

Backend classes with no direct tests: `JwtTokenService`, `LogService` (only a
single ownership case inside `KnowIntegrationTest`), `NoteArchiveCleanup`, and
the `SecurityConfig.JwtFilter` edge cases (only "garbage token" is covered).
Unauthenticated access is checked endpoint by endpoint in a few `*ApiTest`
classes, so a newly added controller is not covered automatically. Cross-user
isolation is covered per feature but not as one matrix over every owned
resource type.

Frontend units with no tests: the `labels`, `paths`, `logs`, `calendar`,
`sessions`, and `reports` stores, and the `backdrop-close`, `dialog-focus`,
`board-priority`, and `color-palette` libs. The Chrome extension already has a
test per module.

## Checklist

Each ID names the test that covers it. Backend tests run with the Dockerized
`gradle test`; frontend tests with `npm test` (Vitest).

### Backend — authentication (`integration/SecurityHardeningIntegrationTest`)

- [ ] **TH-01** Every non-public route registered with Spring MVC answers 401
  without a token. The routes are read from `RequestMappingHandlerMapping`, so
  a new controller is covered with no test change.
  (`everyProtectedRouteRejectsAnonymousRequests`)
- [ ] **TH-02** Every public route in `SecurityConfig` stays reachable without
  a token (not 401). (`publicRoutesDoNotRequireAToken`)
- [ ] **TH-03** Rejected bearer tokens answer 401, never 500: empty token,
  garbage, wrong signing key, expired, unsigned (`alg: none`), missing
  subject, non-UUID subject, and a non-Bearer scheme.
  (`malformedTokensAreRejectedWithoutServerErrors`)
- [ ] **TH-04** A token for a user id that has no account sees no data and
  cannot create data owned by a real user. (`tokenForUnknownUserSeesNothing`)
- [ ] **TH-05** Responses are stateless and framed-deny: no `Set-Cookie`
  session, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`.
  (`responsesCarrySecurityHeadersAndNoSession`)
- [ ] **TH-06** CORS preflight is allowed for the configured origin and
  refused for any other origin. (`corsAllowsOnlyConfiguredOrigins`)

### Backend — cross-user isolation (`integration/CrossUserIsolationIntegrationTest`)

- [ ] **TH-07** For each owned resource — path, note, log, label, board, board
  card, time entry, calendar label — a second user's read, update, and delete
  are refused (404/403/400, never 2xx or 500), and the owner's copy is
  unchanged afterwards. (`intruderCannotReadChangeOrDeleteOwnedResources`)
- [ ] **TH-08** List and search endpoints never return another user's rows.
  (`listsAndSearchNeverLeakOtherUsersRows`)

### Backend — input validation (`integration/InputValidationIntegrationTest`)

- [ ] **TH-09** Malformed JSON, a wrong JSON type, a non-UUID path id, and an
  unknown enum value answer 400, never 500. (`malformedRequestsAnswerBadRequest`)
- [ ] **TH-10** Text length limits are enforced server-side (log body over
  20 000 characters). (`oversizedTextIsRejected`)

### Backend — units

- [ ] **TH-11** `LogService`: trims body; rejects blank, oversized, and
  missing timestamp; stale `version` gives 409; unknown or foreign log gives
  404; labels must be owned LOG-scoped labels; duplicate label ids collapse.
  (`service/LogServiceTest`)
- [ ] **TH-12** `JwtTokenService`: reads the subject of a valid token and
  rejects wrong-key, expired, and non-UUID-subject tokens with
  `IllegalArgumentException`. (`security/JwtTokenServiceTest`)
- [ ] **TH-13** `NoteArchiveCleanup` purges notes archived more than 30 days
  ago. (`service/NoteArchiveCleanupTest`)

### Frontend — stores and libs (Vitest)

- [ ] **TH-14** `labels` store: caches loads, dedupes concurrent scope loads,
  merges scoped results, and drops responses that arrive after `reset()`.
  (`stores/labels.test.ts`)
- [ ] **TH-15** `paths` store: dedupes concurrent loads, ignores stale loads
  after `reset()`, and invalidates cached boards on every path change.
  (`stores/paths.test.ts`)
- [ ] **TH-16** `logs`, `calendar`, `sessions`, and `reports` stores: ordering
  on upsert, removing empty calendar days, and cache set/clear.
  (`stores/logs.test.ts`, `stores/calendar.test.ts`,
  `stores/sessions.test.ts`, `stores/reports.test.ts`)
- [ ] **TH-17** `vBackdropClose` closes only for a press and click that both
  land on the backdrop. (`lib/backdrop-close.test.ts`)
- [ ] **TH-18** `vDialogFocus` focuses the first control, wraps Tab and
  Shift+Tab, and returns focus to the trigger on unmount.
  (`lib/dialog-focus.test.ts`)
- [ ] **TH-19** `byPriorityThenPosition` orders by priority then position;
  the colour palette has unique, valid hex colours.
  (`lib/board-priority.test.ts`, `lib/color-palette.test.ts`)

## Out of scope

iOS (needs macOS), Docker-stack smoke and browser suites (already cover the
deployed shape), and load testing.

## Results

Filled in when the plan is complete.
