# HARD-04: Rate limits and deployed security controls

**Priority:** High  
**Status:** Complete
**Scope:** Security test coverage and run documentation only.

Track completion in the [HARD-04 acceptance checklist](04-acceptance-checklist.md).

## Why this milestone exists

Authentication hardening already tests route protection, invalid JWTs, CORS,
security headers, and unknown-user behavior. `AuthAttemptLimiterTest` only
checks ten allowed attempts followed by a blocked attempt for one key;
`AuthControllerApiTest` mocks the limiter. `check-cloudflare-waf.mjs` checks
Terraform text markers, not expression coverage or live enforcement. The
missing evidence is the request-level contract and that edge policy matches
the application's actual route surface and behaves as intended in a safe test
environment.

## Tasks

- [x] Record the current two distinct controls before writing assertions:
  application auth throttling permits 10 attempts per 60-second window per
  `request.getRemoteAddr() + "|" + normalized email` (Google uses
  `request.getRemoteAddr() + "|google"`), while the optional Cloudflare rules
  use a 60-second window keyed by colo and source IP, with limits of 20 auth,
  12 imports, 60 search/report, and 300 total API requests. Verify these values
  against the implementation and Terraform when the milestone starts because
  policy can change. The complete source-backed route matrix and test evidence
  are in the [HARD-04 acceptance checklist](04-acceptance-checklist.md).
- [x] Add controller/integration tests that exceed login/register/Google
  authentication budgets and assert the current 429 response, error body,
  behavior for a different email/key, and behavior immediately after reset.
  Decide and document whether clients need a `Retry-After` header; do not
  assert one unless the API contract is intentionally updated.
- [x] Test limiter boundaries: exactly the tenth and eleventh application
  attempts, a request after the minute window, concurrent attempts for the
  same key, expiry cleanup when the map exceeds its 1,000-entry threshold, and
  active key cardinality under many distinct keys. The current map has no hard
  size cap; characterize growth and route any unacceptable resource behavior as a
  separate defect. Use a controllable time source or another deterministic
  test seam rather than sleeping for a minute.
- [x] Verify the limiter's client identity behind the actual reverse proxy.
  `AuthController` uses `HttpServletRequest.getRemoteAddr()` and does not
  directly read `X-Forwarded-For`; establish what address the production-shaped
  Caddy/Tomcat path presents, whether application attempts are consequently
  grouped by proxy address, and whether spoofed forwarding headers can affect
  it. Keep the Cloudflare IP-based policy distinct from this app-level key.
  The isolated Caddy/Tomcat probe confirmed that changing forwarding headers
  does not create a new app-level budget. The production replica count is not
  exposed by repository configuration; document the effective per-process
  behavior and keep the live count unknown until an authorized deployment
  inventory is available.
- [x] Add contract tests linking the API route inventory to Cloudflare WAF
  rate-limit expressions for auth, imports, expensive search/report endpoints,
  and general API traffic. A static text check alone is insufficient; assert
  semantic route coverage against the declared policy. Verify interactions
  between narrow and broad overlapping rules against Cloudflare's documented
  semantics; do not infer precedence solely from Terraform list order. Test
  representative included and excluded paths and method behavior.
- [x] If a Cloudflare staging/test account is available, perform a bounded,
  isolated enforcement check and retain rule/version/evidence. Otherwise,
  explicitly document that live edge enforcement remains unverified; do not
  use production credentials or create load against production.
- [x] Review security regression matrix for auth brute force, token expiry,
  CORS origins, WebSocket authentication/ownership, import size/type limits,
  export ownership, and security headers through both local and production-like
  proxy configurations.

The Cloudflare account and deployment state are unavailable in this workspace.
Live Cloudflare enforcement remains unverified; no production credentials or
production endpoints were used. The configured Terraform expressions and
repository contract tests establish configuration behavior only.

## Completion evidence

- [`AuthAttemptLimiterTest`](../../backend/src/test/java/com/know/security/AuthAttemptLimiterTest.java)
  covers the exact window boundary, concurrent attempts, cleanup after 1,001
  keys, and 2,000 simultaneously active keys. The latter confirms that active
  map cardinality grows with distinct keys; it does not claim a hard memory cap
  or measure process RSS.
- [`AuthControllerApiTest`](../../backend/src/test/java/com/know/api/AuthControllerApiTest.java)
  uses the real limiter through MockMvc for login, registration, and Google
  authentication. It verifies the 429 body and confirms `Retry-After` is not
  part of the contract.
- [`check-auth-rate-limit-proxy.mjs`](../../scripts/check-auth-rate-limit-proxy.mjs)
  exercises the production-shaped Caddy/Tomcat path, including forwarded and
  identity header spoofing, expired JWT rejection, CORS, and security headers.
- [`auth-rate-limit.real-stack.acceptance.test.mjs`](../../frontend/scripts/auth-rate-limit.real-stack.acceptance.test.mjs)
  checks accessible 429 feedback and recovery in desktop and mobile-size
  Chromium. The runner is wired into the existing required timer WebSocket CI
  job.
- [`check-cloudflare-waf.mjs`](../../scripts/check-cloudflare-waf.mjs) checks
  the controller route inventory against the Terraform host/path expressions,
  inclusion and exclusion boundaries, methods, thresholds, characteristics,
  and optional enablement. It passed 174 assertions.
- The rate-limit rules are a separate ordered rules list. Cloudflare documents
  that rate-limit rules are evaluated in order and a terminating `Block` stops
  later rule evaluation. The configured narrow rules precede the broad API
  rule, so do not describe all matching limits as independent blocks on a
  request once an earlier rule blocks it. See [Cloudflare rate limiting
  rules](https://developers.cloudflare.com/waf/rate-limiting-rules/) and
  [security feature interoperability](https://developers.cloudflare.com/waf/feature-interoperability/).
- Dated profile results and runtime metadata are recorded in the [HARD-04
  run report](../runs/2026-10-09-hard04-rate-limits.md).

## Acceptance evidence

- HTTP-level tests prove rate-limit behavior and boundary semantics, not only
  internal counter behavior.
- Application-level and Cloudflare limits are reported separately, including
  their different keys, thresholds, and the optional nature of edge policy.
- Tests show independent clients/keys do not share an unintended budget and
  untrusted forwarding headers do not bypass a limit.
- The WAF route matrix is tied to current controller routes and has an
  explicit statement of whether live Cloudflare enforcement was exercised.
- No production endpoint is used for load or enforcement testing.

## Relevant sources

- `backend/src/main/java/com/know/api/AuthController.java`
- `backend/src/main/java/com/know/security/AuthAttemptLimiter.java`
- `backend/src/test/java/com/know/security/AuthAttemptLimiterTest.java`
- `backend/src/test/java/com/know/api/AuthControllerApiTest.java`
- `backend/src/main/java/com/know/api/ApiExceptionHandler.java`
- `scripts/check-cloudflare-waf.mjs`
- `deployment/cloudflare/`
- `deployment/Caddyfile.cloudflare`
- `backend/src/main/java/com/know/realtime/TimerWebSocketHandler.java`
