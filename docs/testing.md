# Testing

The backend suite covers authentication and ownership boundaries, paths, notes, text logs, reusable labels, session timers, time-entry editing, imports, reporting, activity search, boards, and Flyway migrations. Board checks should cover default statuses, nested ownership, invalid date ranges, status archive safeguards, card archive/restore, cursor pages, and Gantt overlap filtering for single, open-ended, and inclusive ranges.

Run the required checks from the repository root:

```bash
docker run --rm -v "$PWD/backend:/app" -w /app gradle:8.13-jdk21 gradle test --no-daemon --project-cache-dir "/tmp/knowledge-base-gradle-project-cache-${USER:-agent}-${PPID}"
(cd frontend && npm ci && npm run build)
(cd frontend && npm run test:tracker)
node --check chrome-extension/popup.js
node --check chrome-extension/options.js
(cd chrome-extension && npm test)
node scripts/check-accessibility.mjs
node scripts/check-security.mjs
node scripts/check-smoke-cleanup.mjs
bash -n scripts/run-smoke-tests.sh deployment/backup.sh deployment/preflight.sh
sh -n deployment/backup-loop.sh deployment/neon-backup.sh
JWT_SECRET='<at-least-32-characters>' POSTGRES_PASSWORD='<local-password>' ./scripts/run-smoke-tests.sh
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
