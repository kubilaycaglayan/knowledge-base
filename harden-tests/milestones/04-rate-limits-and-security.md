# HARD-04: Rate limits and deployed security controls

**Priority:** High  
**Status:** Planned  
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

- [ ] Record the current two distinct controls before writing assertions:
  application auth throttling permits 10 attempts per 60-second window per
  `request.getRemoteAddr() + "|" + normalized email` (Google uses the fixed
  key `google`), while the optional Cloudflare rules use a 60-second window
  keyed by colo and source IP, with limits of 20 auth, 12 imports, 60
  search/report, and 300 total API requests. Verify these values against the
  implementation and Terraform when the milestone starts because policy can
  change.
- [ ] Add controller/integration tests that exceed login/register/Google
  authentication budgets and assert the current 429 response, error body,
  behavior for a different email/key, and behavior immediately after reset.
  Decide and document whether clients need a `Retry-After` header; do not
  assert one unless the API contract is intentionally updated.
- [ ] Test limiter boundaries: exactly the tenth and eleventh application
  attempts, a request after the minute window, concurrent attempts for the
  same key, expiry cleanup when the map exceeds its cleanup threshold, and
  memory behavior under many distinct keys. Use a controllable time source or
  another deterministic test seam rather than sleeping for a minute.
- [ ] Verify the limiter's client identity behind the actual reverse proxy.
  `AuthController` uses `HttpServletRequest.getRemoteAddr()` and does not
  directly read `X-Forwarded-For`; establish what address the production-shaped
  Caddy/Tomcat path presents, whether application attempts are consequently
  grouped by proxy address, and whether spoofed forwarding headers can affect
  it. Keep the Cloudflare IP-based policy distinct from this app-level key.
- [ ] Add contract tests linking the API route inventory to Cloudflare WAF
  rate-limit expressions for auth, imports, expensive search/report endpoints,
  and general API traffic. A static text check alone is insufficient; assert
  semantic route coverage against the declared policy. Verify that the narrow
  rules coexist with and are ordered ahead of the broad API ceiling, and test
  representative included and excluded paths/methods.
- [ ] If a Cloudflare staging/test account is available, perform a bounded,
  isolated enforcement check and retain rule/version/evidence. Otherwise,
  explicitly document that live edge enforcement remains unverified; do not
  use production credentials or create load against production.
- [ ] Review security regression matrix for auth brute force, token expiry,
  CORS origins, WebSocket authentication/ownership, import size/type limits,
  export ownership, and security headers through both local and production-like
  proxy configurations.

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
- `scripts/check-cloudflare-waf.mjs`
- `deployment/cloudflare/`
- `backend/src/main/java/com/know/realtime/TimerWebSocketHandler.java`
