# Knowledge Base repository guidance

The application name is **Knowledge Base**. Use `Knowledge Base` as the product name and `knowledge-base` / `KnowledgeBase` as new code, Compose, deployment, and documentation identifiers. Do not introduce `Know`, `know`, or `try-know-be` as new names. Existing legacy Java packages, iOS target paths, database names, Docker volume names, and historical data identifiers must be treated as compatibility-sensitive and changed only through an explicit migration.

Knowledge Base is a production-shaped monorepo for a personal knowledge and activity tracker. Keep PostgreSQL as the system of record and keep domain rules in the Spring service/domain layer so Vue, SwiftUI, and the Manifest V3 extension remain thin API clients.

## Repository map

- `backend/`: Java 21 Spring Boot modular monolith, JPA repositories, Flyway migrations, and service tests.
- `frontend/`: Vue 3 + TypeScript + Vite web client.
- `ios/`: native SwiftUI package using the shared `/api/v1` API.
- `chrome-extension/`: explicit timer-only Manifest V3 client.
- `deployment/`, `docker-compose.yml`: Ubuntu deployment, Caddy HTTPS, backup, and persistent PostgreSQL configuration.
- `scripts/smoke.sh`: deployed-shaped end-to-end verification.

## Required checks

Run the relevant checks before handing off changes:

```bash
docker run --rm -v "$PWD/backend:/app" -w /app gradle:8.13-jdk21 gradle test --no-daemon --project-cache-dir "/tmp/knowledge-base-gradle-project-cache-${USER:-agent}-${PPID}"
(cd frontend && npm ci && npm run build)
node --check chrome-extension/popup.js
node --check chrome-extension/options.js
node scripts/check-accessibility.mjs
node scripts/check-security.mjs
node scripts/check-cleanup.mjs
bash -n scripts/smoke.sh deployment/backup.sh deployment/preflight.sh
JWT_SECRET='<at-least-32-characters>' POSTGRES_PASSWORD='<local-password>' ./scripts/smoke.sh
SMOKE_FULL_STACK=1 COMPOSE_PROJECT_NAME=knowledge-base-full-smoke JWT_SECRET='<at-least-32-characters>' POSTGRES_PASSWORD='<local-password>' ./scripts/smoke.sh
```

On macOS, open `ios/Package.swift` for host-side Swift validation; for the iOS app and UI tests, run `brew install xcodegen`, then `(cd ios && xcodegen generate --spec project.yml)` and the generated `ios/Know.xcodeproj` build/test scheme used by CI. SwiftUI and UI-test verification cannot be performed in the Linux development environment.

## Safety and design rules

- Never commit `.env`, passwords, tokens, private keys, production configuration, or personal data.
- The production PostgreSQL volume is a protected external volume. Never remove, reset, prune, or recreate it, and never run production cleanup with `--volumes`; use a verified backup/restore migration if replacement is ever explicitly required.
- Add schema changes as new Flyway migrations; do not enable Hibernate schema mutation.
- Scope every read and write by the authenticated user and preserve ownership checks for referenced paths, items, notes, and activities.
- Keep timer state server-owned. Preserve the one-running-timer invariant and do not calculate historical duration only in a client.
- Use `apply_patch` for source edits and avoid destructive repository commands.
- When running Gradle outside the Dockerized development app, use a unique per-agent `--project-cache-dir` (for example, `/tmp/knowledge-base-gradle-project-cache-${USER:-agent}-${PPID}`) so it cannot contend with the human development container; this isolates Gradle metadata only, not source or build outputs.
- Update API documentation, tests, smoke coverage, and the roadmap when a product behavior changes.
