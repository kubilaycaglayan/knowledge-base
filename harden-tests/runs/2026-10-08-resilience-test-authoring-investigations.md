# Resilience test-authoring investigations

These were real-stack exploratory test runs during test development. They are
failure history, not accepted browser-profile coverage; the affected runners
did not capture immutable image IDs or durable logs for these attempts.

## Timer retry case

- Date (UTC): 2026-10-08.
- Source commit at the time: `3e8674a`; the test file also had uncommitted
  iterations during these attempts, so no exact tested source revision exists.
- Profiles/outcomes: two desktop Chromium attempts and one mobile-size
  Chromium attempt, each with 2 passing timer cases and 1 failing newly added
  retry case.
- Failure signatures: missing timer editor before expanding the panel; reading
  the server draft before the successful PUT completed; and the mobile editor
  detaching between fill and blur actions.
- Disposition: confirmed test setup/synchronization failures, not product
  failures. The final test expands the editor, waits for the successful PUT,
  and dispatches input/change events in one evaluate operation. The final
  `941b7c4` desktop and mobile reports both pass 3/3.
- Artifacts: no durable screenshots/traces/logs; command outputs were observed
  during this session only. These attempts are excluded from profile coverage.

## Global search retry case

- Date (UTC): 2026-10-08.
- Source commit at the time: before `5bba75f`; the first desktop attempt
  completed the real-stack case but failed its strict text locator because
  both a visible empty state and its screen-reader announcement contained the
  same phrase.
- Disposition: confirmed test assertion ambiguity. The locator now scopes to
  `.global-search-empty`; the final desktop and mobile reports pass 1/1.
- Artifacts: no durable screenshots/traces/logs. This attempt is excluded from
  profile coverage.
