# Development

Development defaults are proxy `3000`, API `8080`, and PostgreSQL `15432`. Production uses separate API `18082` and PostgreSQL `15433` host ports so both stacks can run simultaneously.

Development PostgreSQL uses the protected external Docker volume `knowledge-base-dev_know-db`. The development startup script refuses to start if that volume is missing, and Compose will not create or remove it automatically. Never use `docker compose down -v` against the development project; restore the volume from a deliberate backup if it is ever lost.

Use Java 21+, Node 22+, Docker, and PostgreSQL 16. `./scripts/start-development.sh` runs the isolated local hot-reload project `knowledge-base-dev` at `http://localhost:3000`; both frontend and backend source are mounted for automatic reloads. Its database and API host ports default to 15432 and 8080 so it can run alongside the production project. `./scripts/deploy-production-web.sh` is the normal Knowledge Base web/API production deployment command; it uses the Cloudflare Tunnel overlay, performs preflight and a cached image build, updates services in place, and preserves the protected external database volume. `./scripts/deploy-production-web-no-cache.sh` is reserved for deliberate no-cache production rebuilds. `cd frontend && npm run build` builds the web app. The backend uses Gradle and can be run with `gradle :backend:bootRun` when Gradle is installed. Never commit `.env`, credentials, tokens, or production configuration.

For IntelliJ IDEA backend development, open the repository root (the directory containing `settings.gradle`), choose the Gradle wrapper as the Gradle distribution, and use the bundled JetBrains Runtime or another Java 21 JDK for Gradle and the project SDK. IntelliJ should import the existing Gradle project and its `backend` module; run the existing application entry point or the Gradle `:backend:bootRun` task. The backend still needs PostgreSQL and its required environment variables, so the simplest setup is to start the development database with `JWT_SECRET='<random value>' POSTGRES_PASSWORD='<database password>' docker compose --project-name knowledge-base-dev -f docker-compose.yml -f docker-compose.dev.yml up -d db`, then set `DATABASE_URL=jdbc:postgresql://localhost:15432/know`, `DATABASE_USERNAME=know`, `DATABASE_PASSWORD=<database password>`, and `JWT_SECRET=<same random value>` in the IntelliJ run configuration. Importing the root project is safe while VS Code is open on the same directory because both editors share the source tree but keep their own project metadata.

The repository smoke test is `JWT_SECRET='<random value>' POSTGRES_PASSWORD='<database volume password>' ./scripts/run-smoke-tests.sh`. Because PostgreSQL credentials are initialized into the named volume on first startup, keep `POSTGRES_PASSWORD` consistent for an existing volume or recreate it deliberately during local-only development.

For frontend hot reloading through the same local URL as the app proxy, run `./scripts/start-development.sh`. It starts the API, runs Vite inside the `web` service, and routes `http://localhost:3000` through Caddy to the Vite server so browser changes reload there. For standalone frontend work, start the development database and API with `docker compose --env-file .env.development --project-name knowledge-base-dev -f docker-compose.yml -f docker-compose.dev.yml up -d db api`, then run `(cd frontend && npm run dev)`. Vite listens on `0.0.0.0:5177`, prints the development URL during startup, and proxies `/api` to the loopback API port 8080. From another machine, forward the chosen development port with `ssh -L 3000:localhost:3000 user@server` for the proxied stack or `ssh -L 5177:localhost:5177 user@server` for standalone Vite.

Compose does not automatically load `.env.development`; use `./scripts/start-development.sh` or pass `--env-file .env.development` to a direct Compose command so the extension CORS origin is passed to the API.

CI runs the backend tests, web build, extension checks, macOS native build, and the Docker smoke test on pushes and pull requests.

Production extension builds require an explicit HTTPS API, lock requests to that API, disable debug logging, and omit wildcard host permissions. Development builds retain localhost defaults and are not publishable. Configure the exact published extension origin (`chrome-extension://<extension-id>`) in production `CORS_ORIGINS` and the exact `chrome.identity.getRedirectURL()` value in Google OAuth.

### Google sign-in in local extension development

Google must allow the callback belonging to the unpacked development extension. The callback is based on the extension ID, not the API URL or frontend origin:

```text
https://<development-extension-id>.chromiumapp.org/
```

Load `.output/chrome-mv3-dev` in Chrome, open `chrome://extensions`, copy the extension ID, and add that exact callback under the OAuth client used by `GOOGLE_CLIENT_ID` in Google Cloud Console. The trailing slash matters. If the directory is moved or recreated, Chrome may assign a different unpacked ID, requiring the new callback to be registered.

By default, local unpacked builds do not set a manifest key, so Chrome derives the development ID from the unpacked directory. Keep the synced directory at the same path to preserve the existing ID. You may set `CHROME_EXTENSION_KEY` in `.env.development` if you intentionally want a key-derived ID. It must be the base64-encoded DER public key used as the Chrome manifest `key`:

```bash
CHROME_EXTENSION_KEY="$(openssl genrsa 2048 2>/dev/null | openssl rsa -pubout -outform DER 2>/dev/null | base64 | tr -d '\\n')"
```

Then rebuild the development bundle, reload it in Chrome, and register the resulting `https://<stable-extension-id>.chromiumapp.org/` callback once. Never commit a private signing key or `.env.development`.

The Chrome extension uses WXT for development. The intended topology is Chrome on macOS, with the extension source, WXT dev server, API, and database on the Ubuntu server. On macOS, create SSH tunnels with `ssh -N -L 8080:127.0.0.1:8080 -L 43127:127.0.0.1:43127 <ubuntu-user>@<ubuntu-server>`; port 8080 forwards the API and port 43127 forwards WXT's HMR server. The development script automatically adds `chrome-extension://${CHROME_EXTENSION_ID}` to CORS when `CHROME_EXTENSION_ID` is exported on Ubuntu, installs extension dependencies when needed, and starts WXT detached in the background on port 43127. Run `source ~/.profile && ./scripts/start-development.sh` on Ubuntu, then continuously sync `.output/chrome-mv3-dev` to macOS and load that synced directory as an unpacked extension in Mac Chrome. WXT logs to `chrome-extension/.wxt-dev.log` and its PID is stored in `chrome-extension/.wxt-dev.pid`; WXT provides HMR for popup/options UI changes and reloads the extension for background changes. For a deployed instance, open its options page and set the HTTPS API base URL ending in `/api/v1`; Chrome requests access only to that configured origin. The extension also grants Clockify access and injects a fixed overlay only on `https://app.clockify.me/reports/detailed*`. A page-world bridge watches fetch/XHR responses matching `/report/workspaces/*/async/reports/detailed/*`, then the isolated overlay sends the returned `timeentries` payload to the extension service worker, which imports it through Know’s authenticated Clockify endpoint. Responses already seen in the current tab are not imported again.
