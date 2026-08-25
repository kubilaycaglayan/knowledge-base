# Know repository guidance

Know is a production-shaped monorepo for a personal knowledge and activity tracker. Keep PostgreSQL as the system of record and keep domain rules in the Spring service/domain layer so Vue, SwiftUI, and the Manifest V3 extension remain thin API clients.

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
docker run --rm -v "$PWD/backend:/app" -w /app gradle:8.13-jdk21 gradle test --no-daemon
(cd frontend && npm ci && npm run build)
node --check chrome-extension/popup.js
node --check chrome-extension/options.js
bash -n scripts/smoke.sh deployment/backup.sh
JWT_SECRET='<at-least-32-characters>' POSTGRES_PASSWORD='<local-password>' ./scripts/smoke.sh
```

On macOS, open `ios/Package.swift` in Xcode or run the macOS CI build. SwiftUI and UI-test verification cannot be performed in the Linux development environment.

## Safety and design rules

- Never commit `.env`, passwords, tokens, private keys, production configuration, or personal data.
- Add schema changes as new Flyway migrations; do not enable Hibernate schema mutation.
- Scope every read and write by the authenticated user and preserve ownership checks for referenced paths, items, notes, and activities.
- Keep timer state server-owned. Preserve the one-running-timer invariant and do not calculate historical duration only in a client.
- Use `apply_patch` for source edits and avoid destructive repository commands.
- Update API documentation, tests, smoke coverage, and the roadmap when a product behavior changes.
