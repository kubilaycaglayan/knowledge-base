# HARD-04 verification run summary

- Date (UTC): 2026-10-09
- Browser stack run: 01:02:38–01:02:56 UTC
- Source commit at browser-run start: `ffe0d32e5fe128dfc5054cb96e76dff91a17e332`.
  The worktree contained final proxy CORS assertions later committed as
  `3554782`; backend and frontend application code was committed.
- Exact browser-stack orchestration command: `bash /tmp/run-hard04-isolated-proxy.sh`.
  This temporary local harness booted the current backend with Gradle, served
  the current frontend build, and used a unique disposable PostgreSQL/Caddy
  stack. Its per-profile commands and results are recorded in the [desktop
  Chromium report](2026-10-09-ffe0d32-desktop-chromium-auth-rate-limit.md) and
  [mobile-size Chromium report](2026-10-09-ffe0d32-mobile-chromium-auth-rate-limit.md).
- Stack exit status: 0. It used no Compose project; the unique network and all
  test containers were removed. The PostgreSQL data directory was tmpfs.
- Cloudflare state: no authorized staging account or deployed policy version
  was available. Live Cloudflare enforcement remains unverified; production
  endpoints and credentials were not used.

## Test outcomes

| Check | Command | Outcome |
| --- | --- | --- |
| Limiter and controller tests | `docker run --rm -v "$PWD/backend:/app" -w /app -e GRADLE_USER_HOME=/gradle-home -v knowledge-base-test-gradle:/gradle-home gradle:8.13-jdk21 gradle test --no-daemon --project-cache-dir "/gradle-home/project-cache-hard04-${USER:-agent}-${PPID}" --tests com.know.security.AuthAttemptLimiterTest --tests com.know.api.AuthControllerApiTest` | 23 tests passed. |
| Auth view component tests | `(cd frontend && npm run test -- --run src/views/AuthView.test.ts)` | 10 tests passed. |
| Frontend build | `(cd frontend && npm run build)` | Passed. Vite reported an existing chunk-size warning for bundles above 500 kB. |
| Cloudflare route contract | `node scripts/check-cloudflare-waf.mjs` | 174 assertions passed. |
| Security source contract | `node scripts/check-security.mjs` | 49 checks passed. |
| Proxy and browser journeys | See the two linked profile reports. | Auth budget, spoofed forwarding/identity headers, invalid and expired JWT handling, CORS, security headers, and both UI profiles passed. |

The unique network for this run was `knowledge-base-hard04-3231115-1791507758`.
The first standard Docker image build received Maven Central HTTP 429 responses.
For the isolated browser run, the current source was compiled using a temporary
copy of the local Gradle dependency cache. That cache copy was removed after
the run. An earlier browser attempt used a stale frontend image; the final run
served the current frontend build and passed.

## Remaining boundaries

- [`AuthAttemptLimiter`](../../backend/src/main/java/com/know/security/AuthAttemptLimiter.java)
  state is per process. Production API replica count and request routing are
  not available in repository configuration.
- Terraform and the semantic repository checks establish configured
  expressions, not live Cloudflare policy state or runtime enforcement.
- Active limiter keys have no hard cardinality cap. Tests show 2,000 active
  keys remain tracked; process memory usage was not measured.
- The isolated browser reports retain the run metadata and outcomes but no
  successful-run screenshots or raw container logs.
