# Testing

The backend suite covers authentication and ownership boundaries, paths, notes, text logs, reusable labels, session timers, time-entry editing, imports, reporting, activity search, boards, and Flyway migrations. Board checks should cover default statuses, nested ownership, invalid date ranges, status archive safeguards, card archive/restore, cursor pages, and Gantt overlap filtering for single, open-ended, and inclusive ranges.

Board browser coverage has two layers: `(cd frontend && npm run test:board)` runs
`frontend/scripts/board.acceptance.test.mjs`, which uses fast isolated API
fixtures for deterministic mobile, keyboard, Gantt, archive, and pagination
feedback, including mobile/desktop Axe audits and disposable Kanban/Gantt
screenshots; `./scripts/run-board-e2e.sh` creates a uniquely named,
disposable Compose project with generated local credentials and runs
`frontend/scripts/board.real-stack.acceptance.test.mjs` against the real API,
PostgreSQL, proxy, and browser. The runner cleans only its own Compose project
and volumes.

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

Run the required checks from the repository root:

```bash
docker run --rm -v "$PWD/backend:/app" -w /app gradle:8.13-jdk21 gradle test --no-daemon --project-cache-dir "/tmp/knowledge-base-gradle-project-cache-${USER:-agent}-${PPID}"
(cd frontend && npm ci && npm run build)
(cd frontend && npm run test:tracker)
(cd frontend && npm run test:board)
node --check chrome-extension/popup.js
node --check chrome-extension/options.js
(cd chrome-extension && npm test)
node scripts/check-accessibility.mjs
node scripts/check-security.mjs
node scripts/check-smoke-cleanup.mjs
bash -n scripts/run-smoke-tests.sh deployment/backup.sh deployment/preflight.sh
sh -n deployment/backup-loop.sh deployment/neon-backup.sh
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
