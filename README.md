# Knowledge Base

[Under construction]

Knowledge Base is a personal knowledge, learning-history, and activity tracker. The repository contains one canonical Spring Boot API, a Vue web client, a native SwiftUI client, and a focused Manifest V3 timer extension.

## Local development

1. Copy `.env.example` to `.env` and set a long random secret for signing. Set `GOOGLE_CLIENT_ID` to the Google OAuth client ID used by the web app and extension when Google sign-in is required.
2. Run `./scripts/development.sh` for the local hot-reload stack at `http://localhost:3000`. Both frontend changes and backend changes are picked up automatically.
3. For a clean production-shaped rebuild, run `./scripts/rebuild.sh`. It preserves the database volume.
4. For Chrome extension development from a separate user machine, run `source ~/.profile && ./scripts/development.sh` on Ubuntu; it starts the API, WXT, and other development services. From the user machine, create an SSH tunnel with `ssh -N -L 8080:127.0.0.1:8080 -L 43127:127.0.0.1:43127 <ubuntu-user>@<ubuntu-server>` and continuously sync `.output/chrome-mv3-dev` to the user machine. Load that synced directory as an unpacked extension in Chrome. WXT provides HMR for extension pages and reloads the extension when background code changes. Sign in in the popup; the tunnel makes the existing `http://localhost:8080/api/v1` default reach the Ubuntu API.

Run the shared backend smoke test with `./scripts/smoke.sh` after setting the required environment variables. It starts the API and database, exercises authentication, paths, items, tags, progress, notes, timers, search, timeline filtering, and statistics, then stops the stack.

Google sign-in setup requires a Google OAuth client configured for the published extension. Add the extension redirect URI returned by `chrome.identity.getRedirectURL()` (the `https://<extension-id>.chromiumapp.org/` form) to that client, set the same client ID as `GOOGLE_CLIENT_ID`, and add the exact production extension origin (`chrome-extension://<extension-id>`) to `CORS_ORIGINS`. The extension uses Chrome's native identity flow and stores only the Knowledge Base JWT returned by the API.

The API applies Flyway migrations and validates the JPA schema; Hibernate never mutates production schema. PostgreSQL is private to the Compose network. Production uses Cloudflare Tunnel for public HTTPS and routes the tunnel to the private Caddy origin. The current usable slice includes account auth, paths, tagged multi-path items, progress history, notes, activity timeline, timers, searchable history, and statistics.

## Environment variables

The repository includes `.env.example` as a public template. Copy it to an untracked `.env` for local or deployed runs, then provide values for your environment. Do not commit `.env`, `secrets`, passwords, signing material, production hostnames that should stay private, or user data.

Environment variable keys and private configuration reminders are maintained in the local untracked `secrets` file and `.env.example`. Those files are intentionally kept out of version control or provided as sanitized templates to prevent exposing private configuration and keys publicly.

## Current foundation

Registration/login issue JWTs, and authenticated users can create, list, update, and archive their own paths. Ownership is enforced in repository queries and service validation. All clients share the versioned API boundary.

See [docs/architecture.md](docs/architecture.md), [docs/development.md](docs/development.md), and [docs/deployment.md](docs/deployment.md).
Testing details are in [docs/testing.md](docs/testing.md), and repository-specific contributor guidance is in [AGENTS.md](AGENTS.md).
