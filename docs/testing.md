# Testing

The backend suite covers authentication and ownership boundaries, paths, notes, text logs, reusable labels, session timers, time-entry editing, imports, reporting, activity search, and Flyway migrations. The item system is deliberately absent: sessions use owned label IDs.

Run the required checks from the repository root:

```bash
docker run --rm -v "$PWD/backend:/app" -w /app gradle:8.13-jdk21 gradle test --no-daemon --project-cache-dir "/tmp/knowledge-base-gradle-project-cache-${USER:-agent}-${PPID}"
(cd frontend && npm ci && npm run build)
node --check chrome-extension/popup.js
node --check chrome-extension/options.js
(cd chrome-extension && npm test)
node scripts/check-accessibility.mjs
node scripts/check-security.mjs
node scripts/check-smoke-cleanup.mjs
bash -n scripts/run-smoke-tests.sh deployment/backup.sh deployment/preflight.sh
JWT_SECRET='<at-least-32-characters>' POSTGRES_PASSWORD='<local-password>' ./scripts/run-smoke-tests.sh
```

On macOS, generate the iOS Xcode project from `ios/project.yml` and run the generated scheme for native SwiftUI and UI-test validation.
