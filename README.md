# Know

Know is a personal knowledge, learning-history, and activity tracker. The repository contains one canonical Spring Boot API, a Vue web client, a native SwiftUI client, and a focused Manifest V3 timer extension.

## Local development

1. Copy `.env.example` to `.env` and set a long random secret for signing. Set `GOOGLE_CLIENT_ID` as well if Google sign-in is required for the web client.
2. Run `./scripts/run.sh` for the local hot-reload stack at `http://localhost:3000`. Both frontend changes and backend changes are picked up automatically.
3. For a production-shaped local stack, run `docker compose up --build`.
4. Load `chrome-extension/` as an unpacked extension in Chrome. Sign in in the popup; for a deployed API, configure its HTTPS `/api/v1` URL in the extension options page.

Run the shared backend smoke test with `./scripts/smoke.sh` after setting the required environment variables. It starts the API and database, exercises authentication, paths, items, tags, progress, notes, timers, search, timeline filtering, and statistics, then stops the stack.

The API applies Flyway migrations and validates the JPA schema; Hibernate never mutates production schema. PostgreSQL is private to the compose network. Configure your domain for Caddy's automatic HTTPS. The current usable slice includes account auth, paths, tagged multi-path items, progress history, notes, activity timeline, timers, searchable history, and statistics.

## Environment variables

The repository includes `.env.example` as a public template. Copy it to an untracked `.env` for local or deployed runs, then provide values for your environment. Do not commit `.env`, `secrets`, passwords, signing material, production hostnames that should stay private, or user data.

Environment variable keys and private configuration reminders are maintained in the local untracked `secrets` file and `.env.example`. Those files are intentionally kept out of version control or provided as sanitized templates to prevent exposing private configuration and keys publicly.

## Current foundation

Registration/login issue JWTs, and authenticated users can create, list, update, and archive their own paths. Ownership is enforced in repository queries and service validation. All clients share the versioned API boundary.

See [docs/architecture.md](docs/architecture.md), [docs/development.md](docs/development.md), and [docs/deployment.md](docs/deployment.md).
Testing details are in [docs/testing.md](docs/testing.md), and repository-specific contributor guidance is in [AGENTS.md](AGENTS.md).
