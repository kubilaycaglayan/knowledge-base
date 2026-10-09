# E2E run: desktop Chromium authentication rate limit

- Date (UTC): 2026-10-09
- Start/end time (UTC): 01:02:38–01:02:56
- Commit at run start: `ffe0d32`; final CORS checks in the proxy probe were
  modified in the worktree and committed afterward as `3554782`.
- Exact command and relevant environment overrides:
  - `bash /tmp/run-hard04-isolated-proxy.sh` started an isolated local stack
    from the checked-out backend source and current frontend build. See the
    [HARD-04 run summary](2026-10-09-hard04-rate-limits.md) for setup notes.
  - `AUTH_RATE_LIMIT_JWT_SECRET=<ephemeral test secret> node scripts/check-auth-rate-limit-proxy.mjs http://localhost:26291`
  - `AUTH_RATE_LIMIT_E2E_BASE_URL=http://localhost:26291 BROWSER_ENGINE=chromium BROWSER_PROFILE=desktop npm run test:auth:rate-limit:e2e --prefix frontend`
- Exit status: 0
- Compose project: None; unique Docker network `knowledge-base-hard04-3231115-1791507758`.
- Stack retained? No. The runner removed its containers/network; the temporary
  Gradle dependency-cache copy was removed with
  `docker volume rm knowledge-base-hard04-gradle-deps`.
- Images (tag and immutable ID):
  - `gradle:8.13-jdk21` — `sha256:67b8c4bfd2b064e58a7307e2da1fc3881bc03ecc7a57cf61d8b570a02ebfaea2`
  - `postgres:16-alpine` — `sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea`
  - `nginx:alpine` — `sha256:df221db836e1754089190208cee7eeda94f233197056426eda74a43ab1abeac2`
  - `caddy:2-alpine` — `sha256:d8542f48d34a9cf4e4c11a478865229840e87e4c96ea3f439101f31a5d35f75f`
- Database engine/version and migration result: PostgreSQL 16.15 on a temporary
  in-memory filesystem; Flyway completed through version 67 successfully.
- Browser engine/version and profile: Chromium 153.0.8010.12, desktop, headless,
  1440×900 CSS viewport, no touch emulation, scale factor 1.
- Environment: Linux x86_64, kernel `7.0.0-38-generic`; Node 22.23.3;
  Playwright 1.63.0; Docker server 29.8.2; Gradle 8.13 / Java 21.0.7.
- Suite outcomes: 1 passed, 0 failed, 0 skipped. The browser assertion covered
  the same HTTP 429 response for a known and an unknown email, the accessible
  alert, retry action, editable email, and successful retry request reaching
  the normal 401 authentication response.
- Shared proxy preflight: 10 application requests were accepted and the 11th
  was blocked despite changing `X-Forwarded-For`; a different email retained an
  independent budget. The exact 429 body and absent `Retry-After` were checked.
  Unauthenticated, malformed-token, expired-token, spoofed identity-header,
  allowed `PUT` and rejected `TRACE` CORS preflights, untrusted-origin
  rejection, and Caddy security-header checks also passed through
  `Caddyfile.cloudflare`.
- Failed cases: None in the final source-current run.
- Artifacts/logs: This report records the result. The disposable stack was
  removed; successful-run screenshots and raw logs were not retained. Test
  accounts used `.invalid` addresses in the temporary database, which was
  destroyed at cleanup.
- Fixed-data performance: Not measured.

## Run notes

An earlier attempt used a stale frontend image and failed before the current
auth screen rendered. The final run served a fresh build from this checkout and
passed. The normal Docker image build path also encountered Maven Central HTTP
429 responses; the isolated run used a temporary copy of the local dependency
cache and compiled the current backend source. No Cloudflare account or
production endpoint was used, so live edge enforcement remains unverified.
