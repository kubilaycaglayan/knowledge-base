# Testing

The backend suite covers authentication and ownership boundaries, paths, notes, text logs, reusable labels, session timers, time-entry editing, imports, reporting, activity search, boards, and Flyway migrations. Board checks should cover default statuses, nested ownership, invalid date ranges, status archive safeguards, card archive/restore, cursor pages, and Gantt overlap filtering for single, open-ended, and inclusive ranges.

Three backend integration suites guard the API as a whole (see
[the test hardening plan](test-hardening-plan.md)):
`SecurityHardeningIntegrationTest` reads every route from Spring MVC and
expects 401 without a token, so new controllers are covered automatically
(only list a route in its `PUBLIC_ROUTES` when `SecurityConfig` deliberately
permits it); `CrossUserIsolationIntegrationTest` checks that a second user can
neither read, change, delete, nor reference another user's paths, notes, logs,
labels, boards, cards, time entries, or calendar data; and
`InputValidationIntegrationTest` checks that malformed or oversized input
answers 400 rather than 500.

Global search is covered by `SearchIntegrationTest` (every record type,
ownership, matching through paths and labels, ranking, paging, archived and
deleted records, near-miss spellings, LIKE wildcards, and validation). The
integration suites run on H2, which registers `com.know.service.Trigrams` as
`word_similarity` in place of pg_trgm. `SearchPostgresIntegrationTest` runs
the same suite against real PostgreSQL migrated by Flyway, so the pg_trgm
operators and trigram indexes are exercised too; it runs only when
`KB_TEST_POSTGRES_URL` names an empty, disposable database:

```bash
docker run -d --rm --name kb-search-pg -e POSTGRES_PASSWORD=pw postgres:16-alpine
docker exec kb-search-pg sh -c 'until pg_isready -q; do sleep 1; done; createdb -U postgres kbtest'
docker run --rm --network container:kb-search-pg \
  -e KB_TEST_POSTGRES_URL=jdbc:postgresql://localhost:5432/kbtest -e KB_TEST_POSTGRES_PASSWORD=pw \
  -v "$PWD/backend:/app" -w /app gradle:8.13-jdk21 \
  gradle test --no-daemon --tests '*SearchPostgres*' --project-cache-dir "/tmp/knowledge-base-gradle-project-cache-${USER:-agent}-${PPID}"
docker stop kb-search-pg
```

Board browser coverage has two layers: `(cd frontend && npm run test:board)` runs
`frontend/scripts/board.acceptance.test.mjs`, which uses fast isolated API
fixtures for deterministic mobile, keyboard, Gantt, archive, and pagination
feedback, including mobile/desktop Axe audits and disposable Kanban/Gantt
screenshots; `./scripts/run-board-e2e.sh` creates a uniquely named,
disposable Compose project with generated local credentials and runs
`frontend/scripts/board.real-stack.acceptance.test.mjs` against the real API,
PostgreSQL, proxy, and browser. The runner cleans only its own Compose project
and volumes.

`./scripts/run-line-history-e2e.sh` runs
`frontend/scripts/line-history.real-stack.acceptance.test.mjs` the same way,
in its own disposable Compose project. It types into note and board card
bodies with the Line history gutter on and checks:
- typed lines read "Unsaved" until the autosave lands, then show the server's
  times, and those times survive a reload;
- untouched lines keep their times;
- a note save replayed over another window's edit, and a card conflict
  followed by Retry, both end with the server's times;
- keyboard toggling;
- the gutter never overlaps line text and the page never scrolls sideways, at
  desktop and phone widths and in the dark theme;
- an Axe audit of the editor;
- untouched lines keep their times through a save built by the Chrome
  extension's own `markdownNoteDocument`, and through a save built by a port
  of the iOS `NoteDocument` conversion;
- the editor's accessibility tree leaves the gutter out, and its live region
  announces the caret line's time;
- typing 50 ms after a click lands where the click put the caret, with the
  gutter on and off. Playwright can press keys inside the click's own frame,
  before the browser reports the new caret, so the other tests wait one frame
  after clicking.
Set `LINE_HISTORY_E2E_SCREENSHOTS=<dir>` to keep screenshots.

`./scripts/run-line-history-orca.sh` runs the Orca 46 screen reader against
line history, using its own disposable Compose project and a disposable Orca
container (`scripts/orca/`). The container provides Xvfb, the AT-SPI bus and
a headed Chromium. The script clicks into a note, moves down a line and types
a new one, then checks Orca's speech log:
- Orca says "Line 1, edited …", "Line 2, edited …", "Line 3, not saved yet",
  and, after the autosave, "Line 3, edited …";
- Orca never reads the gutter stamps aloud.

The `ios` CI job runs on `macos-latest`:
- it generates `ios/Know.xcodeproj` with XcodeGen and builds the app for an
  iPhone simulator, ad-hoc signed so the keychain test works;
- it runs every `KnowTests` case, plus the notes UI tests, including
  `testNotesLineHistoryListsEachLineWithItsEditTime`;
- it uploads the `.xcresult`, with screenshots, as an artifact.

`./scripts/check-ios-note-document.sh` compiles the iOS app's `NoteDocument`
and `NoteLineHistory` in the official Swift image and runs their XCTest cases
from `ios/KnowTests/NotesTests.swift` on Linux. SwiftUI cannot build here, but
this Foundation-only code decides what an iOS save does to a note and which
edit time each line shows.

`(cd frontend && npm run test:nav)` runs
`frontend/scripts/nav-shell.acceptance.test.mjs` against mocked API fixtures. It
checks that the nav bar has the same position, width, and 10px bottom margin on
every page (including the board Gantt view) at phone and desktop widths, and
that the logo returns home through the router, reusing cached sessions, paths,
and labels instead of reloading the page.

Both board browser layers drive the board the way a person does — clicking a
board tab or a column name to rename it inline, and reaching archived boards,
statuses, and cards through the `/board/archive` page linked from the board
footer. Assertions must not be wrapped in `if (await locator.count())` guards,
because a guard turns a missing control into a silently passing test.

Disposable test stacks bind uncommon, unassigned host ports so they never
contend with the development stack (proxy `3000`, API `8080`, PostgreSQL
`15432`) or with each other: the smoke runner uses `26080`/`26443` (plus
`26000`, `26081`, and `26432`), and the board E2E runner uses `26180`. Override
them with `PROXY_HTTP_PORT`, `PROXY_HTTPS_PORT`, or `BOARD_E2E_PROXY_PORT` when
a port is already taken.

The board store suite covers stale board-list/content/Gantt/page responses,
stale moves and edits, optimistic rollback, invalid destinations, timeout
preservation, Gantt reconciliation, page retry, request-timeout mapping, and
optimistic `updatedAt` conflict recovery for concurrent card edits.
The disposable full-stack smoke runner creates a temporary host-networked
BuildKit builder so Gradle and npm dependency resolution works in the isolated
builder, then removes that builder and only its smoke-scoped Compose resources.
The real-stack browser suite also delays a board page response while switching
boards to verify stale content cannot replace the selected board. Run the focused contract
checks with:

```bash
(cd frontend && npm test -- --run --no-file-parallelism src/stores/boards.test.ts src/lib/api.test.ts)
(cd frontend && npm run test:board)
```

To run every Linux test and check in one go, with live output, per-step times, and a summary table, run `./scripts/test-run-all.sh`, or `./scripts/test-run-all.sh --quick` to skip the disposable Docker stacks. Repeat runs reuse caches (the test images are built once per run with Docker's normal builder and shared by the smoke and browser stages, a `knowledge-base-test-gradle` Docker volume holds Gradle's caches, and `npm ci` is skipped while `package-lock.json` and the Node.js version are unchanged); CI always builds and installs clean. `SMOKE_SKIP_BUILD=1 ./scripts/run-smoke-tests.sh` reuses already-built `knowledge-base-api:test-only` / `knowledge-base-web:test-only` images. `SMOKE_KEEP_STACK=1` leaves the smoke stack running (after dropping its temporary databases) for the caller to test further and remove; `test-run-all.sh` runs the real-stack browser suites against it. Every step runs even after a failure so the summary shows the full picture (the exit code is non-zero if any step failed); add `--fail-fast` to stop at the first failing step.

Run the required checks from the repository root:

```bash
docker run --rm -v "$PWD/backend:/app" -w /app gradle:8.13-jdk21 gradle test --no-daemon --project-cache-dir "/tmp/knowledge-base-gradle-project-cache-${USER:-agent}-${PPID}"
(cd frontend && npm ci && npm run build)
(cd frontend && npm run test:tracker)
(cd frontend && npm run test:board)
(cd frontend && npm run test:nav)
node --check chrome-extension/popup.js
node --check chrome-extension/options.js
(cd chrome-extension && npm test)
node scripts/check-accessibility.mjs
node scripts/check-security.mjs
node scripts/check-smoke-cleanup.mjs
bash -n scripts/run-smoke-tests.sh deployment/backup.sh deployment/preflight.sh
sh -n deployment/backup-loop.sh deployment/backup-db-refresh.sh
JWT_SECRET='<at-least-32-characters>' POSTGRES_PASSWORD='<local-password>' ./scripts/run-smoke-tests.sh
SMOKE_FULL_STACK=1 COMPOSE_PROJECT_NAME=knowledge-base-full-smoke \
  JWT_SECRET='<at-least-32-characters>' POSTGRES_PASSWORD='<local-password>' \
  ./scripts/run-smoke-tests.sh
```

On macOS, generate the iOS Xcode project from `ios/project.yml` and run the generated scheme for native SwiftUI and UI-test validation.

Agents may create disposable local test accounts for authenticated verification
and may navigate/interact with the local web app, Chrome extension, and iOS
simulator. When visual parity matters, take representative screenshots from
the web app, extension, and mobile app in relevant themes and responsive sizes.
Keep accounts and data isolated to local development; do not use production or
personal credentials, and do not commit credentials, tokens, or screenshots
containing secrets or personal data.

For the Milestone 2 authentication reference, run from `frontend/`:

```bash
NODE_OPTIONS=--no-experimental-webstorage npm test -- src/views/AuthView.test.ts src/stores/auth.test.ts src/lib/api.test.ts src/App.test.ts
npx playwright install chromium
node scripts/check-auth-ui.mjs
```

The Node option avoids Node 26's native storage shadowing jsdom storage. The
browser script uses isolated rejected-auth fixtures and blocks Google traffic;
it checks both form modes/themes, responsive layout, axe accessibility,
keyboard submission, and draft retention, and prints its temporary screenshot
directory. It does not replace live Google, iOS simulator, or physical-device
checks. See [the state matrix](ios-auth-state-matrix.md) for current evidence
and remaining gates.
