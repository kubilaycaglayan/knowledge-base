# E2E run: mobile-size Chromium authentication rate limit

- Date (UTC): 2026-10-09
- Start/end time (UTC): 01:02:38–01:02:56 (same isolated stack as the desktop
  Chromium pass)
- Commit at run start: `ffe0d32`; final CORS checks in the proxy probe were
  modified in the worktree and committed afterward as `3554782`.
- Exact command and relevant environment overrides:
  - `bash /tmp/run-hard04-isolated-proxy.sh` started an isolated local stack
    from the checked-out backend source and current frontend build. See the
    [HARD-04 run summary](2026-10-09-hard04-rate-limits.md) for setup notes.
  - `AUTH_RATE_LIMIT_E2E_BASE_URL=http://localhost:26291 BROWSER_ENGINE=chromium BROWSER_PROFILE=iphone npm run test:auth:rate-limit:e2e --prefix frontend`
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
- Browser engine/version and profile: Chromium 153.0.8010.12, mobile-size
  emulation, headless, 390×844 CSS viewport, touch enabled, device scale factor 3.
- Environment: Linux x86_64, kernel `7.0.0-38-generic`; Node 22.23.3;
  Playwright 1.63.0; Docker server 29.8.2; Gradle 8.13 / Java 21.0.7.
- Suite outcomes: 1 passed, 0 failed, 0 skipped. The browser assertion covered
  the same HTTP 429 response for a known and an unknown email, the accessible
  alert, retry action, editable email, and retry request reaching the normal
  401 authentication response.
- Shared proxy preflight: The desktop report records the one-time Caddy/Tomcat
  security and limiter probe run against this same isolated stack.
- Failed cases: None in the final source-current run.
- Artifacts/logs: This report records the result. The disposable stack was
  removed; successful-run screenshots and raw logs were not retained. Test
  accounts used `.invalid` addresses in the temporary database, which was
  destroyed at cleanup.
- Screenshot follow-up: The mobile-size state was recaptured and visually
  inspected during the isolated 01:07:08–01:07:24 UTC follow-up. The local
  screenshot is `harden-tests/local-artifacts/hard04-2026-10-09/mobile.png`;
  both credential fields were blank in the capture.
- Fixed-data performance: Not measured.

## Run notes

This is responsive/touch emulation using desktop Chromium, not physical Android
Chrome. The application/API project was local and isolated; no Cloudflare
account or production endpoint was used, so live edge enforcement remains
unverified.
