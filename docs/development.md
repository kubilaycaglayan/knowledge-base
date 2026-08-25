# Development

Use Java 21+, Node 22+, Docker, and PostgreSQL 16. `docker compose up --build` runs the production-shaped stack. `cd frontend && npm run build` builds the web app. The backend uses Gradle and can be run with `gradle :backend:bootRun` when Gradle is installed. Never commit `.env`, credentials, tokens, or production configuration.

The repository smoke test is `JWT_SECRET='<random value>' POSTGRES_PASSWORD='<database volume password>' ./scripts/smoke.sh`. Because PostgreSQL credentials are initialized into the named volume on first startup, keep `POSTGRES_PASSWORD` consistent for an existing volume or recreate it deliberately during local-only development.

For frontend hot reloading, start the database and API with `JWT_SECRET='<random value>' POSTGRES_PASSWORD='<database password>' docker compose up -d db api`, then run `(cd frontend && npm run dev)`. Vite listens on `0.0.0.0:5177`, prints the development URL during startup, and proxies `/api` to the loopback API port 8080. From another machine, forward the memorable development port with `ssh -L 5177:localhost:5177 user@server`, then open `http://localhost:5177`.

CI runs the backend tests, web build, extension checks, macOS native build, and the Docker smoke test on pushes and pull requests.

The Chrome extension uses the local API by default. For a deployed instance, open its options page and set the HTTPS API base URL ending in `/api/v1`; Chrome requests access only to that configured origin.
