# HARD-04 acceptance checklist: rate limits and security

Use this checklist with [HARD-04](04-rate-limits-and-security.md). Verify
limits from source at implementation time and report application and edge
controls separately.

## Source-backed current state

The values below were checked against application code and Terraform during
HARD-04. Configured Terraform values are not evidence that Cloudflare currently
enforces the rules.

| Control | Configured contract | HARD-04 evidence and limitation |
| --- | --- | --- |
| Application auth budget | 10 attempts per fixed 60-second window, keyed by `request.getRemoteAddr() + "|" + normalizedEmail`; email is trimmed and lowercased using `Locale.ROOT`. Google uses `request.getRemoteAddr() + "|google"`. | [`AuthAttemptLimiter`](../../backend/src/main/java/com/know/security/AuthAttemptLimiter.java) uses an atomic `ConcurrentHashMap.compute` and monotonic time. Deterministic time, concurrent attempts, expiry cleanup, and 2,000 active keys are covered in [`AuthAttemptLimiterTest`](../../backend/src/test/java/com/know/security/AuthAttemptLimiterTest.java). Active key count grows without a hard cap; process RSS was not measured. |
| Application response | HTTP 429 with `{ "error": "Too many authentication attempts; try again shortly" }`. No `Retry-After` header. | [`AuthControllerApiTest`](../../backend/src/test/java/com/know/api/AuthControllerApiTest.java) exercises the real limiter through MockMvc for login, registration, and Google. The proxy probe also checks the 429 body and absent header. |
| Reset and cleanup | A fixed window resets when a request arrives at or after `resetAt`. Expired entries are removed during requests only when the map exceeds 1,000 entries. | Exact one-minute boundary and reclamation after 1,001 keys are tested without sleeping. Distinct active keys remain until expiry and subsequent cleanup. |
| Deployment scope | Limiter state is local to one Spring application process. | The isolated stack used one API process. The production replica count and routing are not in repository configuration and remain unknown; a multi-process deployment would have a per-process budget, not a shared distributed budget. |
| Reverse-proxy identity | The app uses Servlet `getRemoteAddr()` and does not directly trust `X-Forwarded-For`. Cloudflare separately keys by colo and source IP. | The isolated [`Caddyfile.cloudflare`](../../deployment/Caddyfile.cloudflare) to Tomcat probe exhausted a budget while changing forwarding and identity headers; those headers did not change the app key. The peer address is the proxy connection seen by the app. |
| Cloudflare auth | Configured-host exact path for `/api/v1/auth/(login|register|google)`, 20 requests per 60 seconds per colo/IP, 300-second mitigation. | Terraform config only; live zone enforcement is unverified. |
| Cloudflare imports | Configured-host `/api/v1/imports/` prefix, 12 requests per 60 seconds per colo/IP, 300-second mitigation. | Covers Clockify and Knowledge Base import paths. No method predicate. |
| Cloudflare search/reports | Configured-host `/api/v1/search` or `/api/v1/reports` exact path or descendant path, 60 requests per 60 seconds per colo/IP, 120-second mitigation. | Suffix boundaries are asserted. No method predicate. |
| Cloudflare general API | Configured-host `/api/v1` exact path or descendant path, 300 requests per 60 seconds per colo/IP, 60-second mitigation. | Every narrow API path also matches the broad expression. Actual deployed state is unavailable. |
| Cloudflare enablement | `enable_rate_limits` defaults to true in Terraform and the example tfvars. | The module is optional and actual deployment variables/state are unavailable. Do not infer deployed enablement. |
| Static policy check | [`check-cloudflare-waf.mjs`](../../scripts/check-cloudflare-waf.mjs) asserts route expression shape and policy configuration. | 174 semantic contract assertions passed. This is repository configuration evidence, not Cloudflare expression-engine or live-enforcement evidence. |

### Route expression matrix

The source mapping checks cover
[`AuthController`](../../backend/src/main/java/com/know/api/AuthController.java),
[`ImportController`](../../backend/src/main/java/com/know/api/ImportController.java),
[`KnowledgeBaseTransferController`](../../backend/src/main/java/com/know/api/KnowledgeBaseTransferController.java),
[`SearchController`](../../backend/src/main/java/com/know/api/SearchController.java),
and [`ReportController`](../../backend/src/main/java/com/know/api/ReportController.java).

| Route family | Current controller paths/methods | Narrow edge expression | Tested boundaries |
| --- | --- | --- | --- |
| Authentication | `POST /api/v1/auth/login`, `/register`, `/google` | Exact auth path regex; also broad API expression. | `google/config`, `me`, and `password` are outside the narrow auth rule but inside the broad API rule. |
| Imports | Clockify `POST /clockify`, `GET /clockify/batches`, `DELETE /clockify/batches/{id}` under `/api/v1/imports`; Knowledge Base `POST /api/v1/imports/knowledge-base`, `GET /export`, `GET /batches`, `DELETE /batches/{id}`. | `/api/v1/imports/` prefix; also broad API. | Missing trailing slash `/api/v1/imports` and sibling `/api/v1/imports-other/...` are excluded from the narrow rule. |
| Search/reports | `GET /api/v1/search`, `GET /api/v1/reports`. | Exact endpoint or descendant path; also broad API. | `/searchx` and `/reports-old` miss the narrow rule and match only broad API. |
| All API routes | Every `/api/v1` route. | `/api/v1` exact path or descendant. | `/api/v10/...` and `/health` are excluded. |
| Host/method | Rate-limit rules require `http.host eq var.domain`; none has a method predicate. | Host scope is included in each expression. | Configured, alternate, and absent hosts plus GET, HEAD, POST, PUT, PATCH, DELETE, and OPTIONS behavior are checked. The separate custom WAF method allowlist remains independent. |

Cloudflare states that rate-limit rules are evaluated in order and a
terminating `Block` stops later rule evaluation. The narrow rules are listed
before the broad API rule, but a request blocked by a narrow rule does not
reach later rate-limit rules. The repository test verifies configured order
and expression boundaries; it does not claim to execute Cloudflare's runtime
engine. See [rate limiting rules](https://developers.cloudflare.com/waf/rate-limiting-rules/)
and [security feature interoperability](https://developers.cloudflare.com/waf/feature-interoperability/).

## Application authentication limiter

- [x] Document threshold, fixed window, key construction, normalization,
  response body/status, reset semantics, and lack of `Retry-After`.
- [x] Exercise login, registration, and Google through the HTTP controller
  boundary with the real limiter; verify 429 response shape.
- [x] Assert the tenth attempt is allowed, the eleventh is rejected, and a
  different normalized email has an independent key.
- [x] Advance a controllable clock to test reset at the minute boundary.
- [x] Race concurrent attempts and prove only ten are allowed.
- [x] Test cleanup beyond 1,000 keys and characterize 2,000 simultaneous active
  keys. Record the lack of a hard size cap; no RSS claim is made.
- [x] Record per-process state and the unknown production replica count. A
  distributed budget is not claimed.
- [x] Exercise the production-shaped Caddy/Tomcat path with changing
  `X-Forwarded-For` and spoofed identity headers; confirm they do not bypass the
  application budget or protected-route authentication.
- [x] State that `Retry-After` is not part of the current API contract.

## Edge policy and route coverage

- [x] Inventory controller method/path pairs and current Terraform limits,
  keys, time windows, mitigation windows, optional enablement, and host scope.
- [x] Add semantic route assertions for included/excluded auth, imports,
  search/reports, and broad API paths, including suffix and slash boundaries.
- [x] Assert method-independent path matching and separate host boundaries.
- [x] Document ordered narrow and broad rule interaction using Cloudflare's
  published evaluation semantics; do not claim list order alone proves
  precedence or that every overlapping rule blocks the same request.
- [x] Keep app email/socket-peer limits distinct from Cloudflare colo/IP
  controls in tests and documentation.
- [x] Label Terraform checks as configuration evidence only.
- [x] Record live Cloudflare enforcement as unverified. No authorized staging
  zone was available; no production requests or credentials were used.

## Security regression review

| Security area | Existing or new evidence | Boundary |
| --- | --- | --- |
| Protected/public routes, malformed and expired JWTs, CORS, security headers | [`SecurityHardeningIntegrationTest`](../../backend/src/test/java/com/know/integration/SecurityHardeningIntegrationTest.java), existing smoke checks, and the HARD-04 Caddy/Tomcat probe for unauthenticated, malformed, and expired-token responses, CORS, and proxy headers. | Expired-token unit/integration coverage remains in the app test profile; the proxy probe uses a disposable locally signed expired token. |
| Ownership and cross-user leakage | [`CrossUserIsolationIntegrationTest`](../../backend/src/test/java/com/know/integration/CrossUserIsolationIntegrationTest.java), [`KnowIntegrationTest`](../../backend/src/test/java/com/know/integration/KnowIntegrationTest.java), and [`TimerWebSocketHandlerTest`](../../backend/src/test/java/com/know/realtime/TimerWebSocketHandlerTest.java). | Existing isolated integration/unit coverage; no production data used. |
| WebSocket auth/ownership | Handler rejects invalid auth and sends timer updates only to the owning authenticated user; required timer/WebSocket real-stack job remains in CI. | HARD-04 reviewed the current suite and retained its real-stack proxy runner. |
| Import size/type and export ownership | Existing API/integration tests, transfer ownership cases, and deployed-shaped smoke import/export paths. | Boundary and ownership assertions are app/integration coverage; rate-limit expression includes all import methods by path. |
| Auth rate-limit UI recovery | [`auth-rate-limit.real-stack.acceptance.test.mjs`](../../frontend/scripts/auth-rate-limit.real-stack.acceptance.test.mjs) asserts the same 429 body for a known and unknown email, accessible alert, retry button, and corrected email in both Chromium profiles. | Browser uses disposable accounts in a temporary local database. |
| Failure disclosure | Generic auth response is asserted; cross-user suites assert owner data is not disclosed; run records contain no credentials or personal data. | Logs from production are not accessed. |

- [x] Review and link the auth, token, CORS, WebSocket, import/export,
  ownership, and security-header regression inventory.
- [x] Verify spoofed forwarding/identity headers cannot bypass the limiter or
  protected-route authentication in the local production-shaped proxy stack.
- [x] Exercise accessible auth 429 feedback and retry in desktop and
  mobile-size Chromium; verify the email can be corrected and the rate-limit
  response is identical for known/unknown identities.
- [x] Link tests, route inventory, configured policy, and local run environment
  in the dated [HARD-04 run report](../runs/2026-10-09-hard04-rate-limits.md).

HARD-04 is **Complete**. Cloudflare live enforcement and the production API
replica count remain explicitly unverified because neither deployment state
nor an authorized staging account is available in this repository workspace.
