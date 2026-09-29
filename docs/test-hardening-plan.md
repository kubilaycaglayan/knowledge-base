# Test hardening plan

Goal: close the gaps in automated coverage that matter most for a
multi-user, internet-facing app — authentication, per-user data isolation,
input validation, and small units that currently have no tests at all.
This plan adds tests only; any defect a test exposes is fixed separately with
the failing test committed first (see the bug-fix workflow).

## Gap survey (2026-09-29)

Backend classes with no direct tests: `JwtTokenService`, `LogService` (only a
single ownership case inside `KnowIntegrationTest`), and
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

- [x] **TH-01** Every non-public route registered with Spring MVC answers 401
  without a token. The routes are read from `RequestMappingHandlerMapping`, so
  a new controller is covered with no test change.
  (`everyProtectedRouteRejectsAnonymousRequests`)
- [x] **TH-02** Every public route in `SecurityConfig` stays reachable without
  a token (not 401). (`publicRoutesDoNotRequireAToken`)
- [x] **TH-03** Rejected bearer tokens answer 401, never 500: empty token,
  garbage, wrong signing key, expired, unsigned (`alg: none`), missing
  subject, non-UUID subject, and a non-Bearer scheme.
  (`malformedTokensAreRejectedWithoutServerErrors`)
- [x] **TH-04** A token for a user id that has no account sees no data and
  cannot create data owned by a real user. (`tokenForUnknownUserSeesNothing`)
- [x] **TH-05** Responses are stateless and framed-deny: no `Set-Cookie`
  session, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`.
  (`responsesCarrySecurityHeadersAndNoSession`)
- [x] **TH-06** CORS preflight is allowed for the configured origin and
  refused for any other origin. (`corsAllowsOnlyConfiguredOrigins`)

### Backend — cross-user isolation (`integration/CrossUserIsolationIntegrationTest`)

- [x] **TH-07** For each owned resource — path, note, log, label, board, board
  card, time entry, calendar label — a second user's read, update, and delete
  are refused (404/403/400, never 2xx or 500), and the owner's copy is
  unchanged afterwards. (`intruderCannotReadChangeOrDeleteOwnedResources`)
- [x] **TH-08** List and search endpoints never return another user's rows.
  (`listsAndSearchNeverLeakOtherUsersRows`)

### Backend — input validation (`integration/InputValidationIntegrationTest`)

- [x] **TH-09** Malformed JSON, a wrong JSON type, a non-UUID path id, and an
  unknown enum value answer 400, never 500. (`malformedRequestsAnswerBadRequest`)
- [x] **TH-10** Text length limits are enforced server-side (log body over
  20 000 characters). (`oversizedTextIsRejected`)

### Backend — units

- [x] **TH-11** `LogService`: trims body; rejects blank, oversized, and
  missing timestamp; stale `version` gives 409; unknown or foreign log gives
  404; labels must be owned LOG-scoped labels; duplicate label ids collapse.
  (`service/LogServiceTest`)
- [x] **TH-12** `JwtTokenService`: reads the subject of a valid token and
  rejects wrong-key, expired, and non-UUID-subject tokens with
  `IllegalArgumentException`. (`security/JwtTokenServiceTest`)
- [x] **TH-13** Archived notes are kept indefinitely: no scheduled job deletes a
  note archived long ago, and it can still be restored.
  (`integration/NoteArchiveRetentionIntegrationTest`)

### Frontend — stores and libs (Vitest)

- [x] **TH-14** `labels` store: caches loads, dedupes concurrent scope loads,
  merges scoped results, and drops responses that arrive after `reset()`.
  (`stores/labels.test.ts`)
- [x] **TH-15** `paths` store: dedupes concurrent loads, ignores stale loads
  after `reset()`, and invalidates cached boards on every path change.
  (`stores/paths.test.ts`)
- [x] **TH-16** `logs`, `calendar`, `sessions`, and `reports` stores: ordering
  on upsert, removing empty calendar days, and cache set/clear.
  (`stores/logs.test.ts`, `stores/calendar.test.ts`,
  `stores/sessions.test.ts`, `stores/reports.test.ts`)
- [x] **TH-17** `vBackdropClose` closes only for a press and click that both
  land on the backdrop. (`lib/backdrop-close.test.ts`)
- [x] **TH-18** `vDialogFocus` focuses the first control, wraps Tab and
  Shift+Tab, and returns focus to the trigger on unmount.
  (`lib/dialog-focus.test.ts`)
- [x] **TH-19** `byPriorityThenPosition` orders by priority then position;
  the colour palette has unique, valid hex colours.
  (`lib/board-priority.test.ts`, `lib/color-palette.test.ts`)

## Out of scope

iOS (needs macOS), Docker-stack smoke and browser suites (already cover the
deployed shape), and load testing.

## Results

Completed 2026-09-29. New tests: 3 backend integration classes
(`SecurityHardeningIntegrationTest`, `CrossUserIsolationIntegrationTest`,
`InputValidationIntegrationTest`, sharing a small JDK-client `ApiClient`),
3 backend unit classes, and 10 Vitest files (23 tests).

Defects found and fixed (failing test committed first, then the fix):

- A correctly signed token with no subject made every protected endpoint
  answer 500, and one with a non-UUID subject answered 400. `JwtFilter` now
  authenticates only a UUID subject, so both answer 401 (TH-03).
- `JwtTokenService.userId` threw `NullPointerException` for a token without a
  subject instead of its documented `IllegalArgumentException` (TH-12). The
  timer WebSocket caught it anyway, so there was no user-visible effect.

No gaps were found in cross-user isolation (TH-07, TH-08): every tested read,
change, delete, and foreign-id reference by a second user was refused, and
the owner's data stayed unchanged.

TH-13 was first covered by a `NoteArchiveCleanup` unit test; a separate
change that keeps archived notes indefinitely replaces that job and owns
TH-13 from then on.

Every protected route is now checked for 401 automatically (TH-01), so a new
controller is covered without editing that test; add a route to
`PUBLIC_ROUTES` only when it is deliberately public in `SecurityConfig`.
