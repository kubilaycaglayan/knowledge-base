# HARD-04 acceptance checklist: rate limits and security

Use this checklist with [HARD-04](04-rate-limits-and-security.md). Verify
limits from source at implementation time and report application and edge
controls separately.

## Source-backed current state

The values below were checked against application code and Terraform in this
source audit. Refresh them when either source changes. Configured Terraform
values are not evidence that the Cloudflare ruleset is currently deployed.

| Control | Current configured contract | Current evidence and limitation |
| --- | --- | --- |
| Application auth budget | 10 attempts per fixed 60-second window, keyed by `request.getRemoteAddr() + "\|" + normalizedEmail`; `normalizedEmail` is trimmed and lowercased with `Locale.ROOT`. Google uses the same remote address plus the shared key value `google`. | [`AuthAttemptLimiter`](../../backend/src/main/java/com/know/security/AuthAttemptLimiter.java) uses an atomic `ConcurrentHashMap.compute` and `System.nanoTime()`. [`AuthController`](../../backend/src/main/java/com/know/api/AuthController.java) calls it for valid login, register, and Google requests. [`AuthAttemptLimiterTest`](../../backend/src/test/java/com/know/security/AuthAttemptLimiterTest.java) only covers ten allowed attempts, the next blocked attempt, and a different email on the same address. |
| Application response | Blocked attempts throw HTTP 429 with reason `Too many authentication attempts; try again shortly`; [`ApiExceptionHandler`](../../backend/src/main/java/com/know/api/ApiExceptionHandler.java) serializes `{ "error": "…" }`. No `Retry-After` header is set by this path. | [`AuthControllerApiTest`](../../backend/src/test/java/com/know/api/AuthControllerApiTest.java) mocks the limiter and does not exercise a real budget or 429 response. |
| Application reset and cleanup | A window resets when the next request arrives at/after its original `resetAt`; it is fixed, not sliding. Expired entries are removed during requests only when map size exceeds 1,000. | Current code has no injected time source and no hard cardinality cap. Cleanup does not establish bounded memory while many distinct keys remain active. |
| Application deployment scope | The limiter stores windows in a component-local `ConcurrentHashMap`; state is local to one application process. | Verify production API process/replica count and routing. If multiple processes serve traffic, measure whether a client can receive an independent per-process budget and report that limitation. |
| Cloudflare auth | Host plus exact path regex for `/api/v1/auth/(login|register|google)`, 20 requests per 60 seconds per `cf.colo.id` and `ip.src`, 300-second mitigation. | Configured in [`main.tf`](../../deployment/cloudflare/main.tf); no live deployment/enforcement record is present in this repository. |
| Cloudflare imports | Host plus `/api/v1/imports/` path prefix, 12 requests per 60 seconds per colo/IP, 300-second mitigation. | The prefix covers Clockify and Knowledge Base import routes; the rule is path-based and does not declare an HTTP method condition. |
| Cloudflare search/reports | Host plus `/api/v1/search` or `/api/v1/reports` exact path or descendant path, 60 requests per 60 seconds per colo/IP, 120-second mitigation. | The rule is path-based and does not declare an HTTP method condition. |
| Cloudflare general API | Host plus `/api/v1` exact path or descendant path, 300 requests per 60 seconds per colo/IP, 60-second mitigation. | Every narrow API path also matches the general API expression. Keep the overlapping configured budgets visible when assessing effective behavior. |
| Cloudflare enablement | `enable_rate_limits` defaults to `true`; [`terraform.tfvars.example`](../../deployment/cloudflare/terraform.tfvars.example) also sets it true. | Actual deployment variables and Cloudflare state are not available from checked-in source; report live status as unverified unless independently observed in an authorized staging account. |
| Static policy check | [`check-cloudflare-waf.mjs`](../../scripts/check-cloudflare-waf.mjs) checks nine source markers, including phases, rule refs, shared characteristics, and token sensitivity. | Marker presence is configuration lint only. It does not evaluate expressions against controller mappings, prove rule interactions, or verify live Cloudflare enforcement. |

### Route expression matrix

The controller path inventory below was compared with
[`AuthController`](../../backend/src/main/java/com/know/api/AuthController.java),
[`ImportController`](../../backend/src/main/java/com/know/api/ImportController.java),
[`KnowledgeBaseTransferController`](../../backend/src/main/java/com/know/api/KnowledgeBaseTransferController.java),
[`SearchController`](../../backend/src/main/java/com/know/api/SearchController.java),
and [`ReportController`](../../backend/src/main/java/com/know/api/ReportController.java).

| Route family | Current controller paths/methods | Edge rule match | Exclusion/boundary assertions |
| --- | --- | --- | --- |
| Authentication | `POST /api/v1/auth/login`, `/register`, `/google` | Exact auth path regex; also broad API expression. | `/api/v1/auth/google/config`, `/me`, and `/password` do not match the narrow auth regex; they still match the broad API expression. |
| Imports | Clockify: `POST /api/v1/imports/clockify`, `GET /api/v1/imports/clockify/batches`, `DELETE /api/v1/imports/clockify/batches/{id}`. Knowledge Base: `POST /api/v1/imports/knowledge-base`, `GET .../export`, `GET .../batches`, `DELETE .../batches/{id}`. | Import path prefix; also broad API expression. | `/api/v1/imports` without the trailing slash does not match the narrow prefix; `/api/v1/imports-other/...` is outside the prefix. |
| Search and reports | `GET /api/v1/search`, `GET /api/v1/reports`. | Exact endpoint or descendant regex; also broad API expression. | `/api/v1/searchx` and `/api/v1/reports-old` do not match the narrow expression; they still match the broad API expression. |
| All API routes | Every route under `/api/v1` from the controller inventory. | `/api/v1` or any descendant path. | `/api/v10/...`, `/health`, and non-API web routes do not match the broad expression. |
| Host scope | All four rate-limit expressions require `http.host eq var.domain`; the custom WAF has a separate unexpected-Host block. | Rate-limit rules only match the configured hostname. | Test configured host, an alternate host, and a missing/invalid host against rate-limit matching and the custom host rule separately. |
| Method scope | The custom WAF allows GET, HEAD, POST, PUT, PATCH, DELETE, and OPTIONS; the rate-limit rules have no method predicate. | Any method to a matching path reaches the same rate-limit expression. | Verify custom method allow/block behavior independently from path-based rate limiting. |

The current Terraform rate-limit expressions do not constrain HTTP method.
Assert that each actual controller method maps to the expected path rule, and
record that a different method to the same path still matches the rate-limit
expression. The separate custom WAF method rule allows GET, HEAD, POST, PUT,
PATCH, DELETE, and OPTIONS. The narrow rules appear before the broad rule in
the Terraform list, but tests must establish Cloudflare's actual handling of
overlapping rate-limit rules before describing that order as precedence.

The application key includes the socket peer reported by Servlet and does not
read `X-Forwarded-For` directly. The production-shaped
[`Caddyfile.cloudflare`](../../deployment/Caddyfile.cloudflare) reverse
proxies `/api/*` to the API and does not configure a custom trusted-proxy
identity rule. Source inspection alone does not establish the actual
`getRemoteAddr()` value seen inside Tomcat or how multiple API replicas share
this in-memory limiter; capture those runtime facts in a local disposable-stack
report.

## Application authentication limiter

- [x] Document the configured threshold, window, key construction,
  normalization, response status/body, and reset semantics from current code
  in the table above; confirm deployed values separately when available.
- [ ] Exercise login, registration, and Google authentication through the HTTP
  controller/integration boundary; assert the configured budget and 429
  response shape rather than only testing the counter class.
- [ ] Test exact boundary requests (last allowed and first rejected), then
  verify another normalized email/key has an independent budget.
- [ ] Make window-expiry tests deterministic. The current implementation uses
  `System.nanoTime()` directly and exposes no clock seam; do not use a
  one-minute sleep as the only reset test.
- [ ] Race concurrent attempts for the same key and prove the threshold cannot
  be bypassed or exceeded by a check-then-increment race.
- [ ] Exercise expiry cleanup when the map exceeds 1,000 entries and characterize
  many distinct active keys. Assert expired-entry reclamation, report observed
  cardinality/cost, and do not imply a hard memory bound that the current map
  does not provide.
- [ ] Verify process scope: determine whether the live deployment has one or
  multiple API processes and whether the same client can rotate between them.
  Document the effective per-process budget and any distributed-limit gap.
- [ ] Determine the remote address seen through the production-shaped
  Caddy/Tomcat path; test whether spoofed forwarding headers alter the limiter
  key and document the observed trust boundary.
- [ ] State whether `Retry-After` is part of the contract; assert it only if
  implemented and documented.

## Edge policy and route coverage

- [x] Inventory current controller method/path pairs for auth, import, search,
  reports, and general APIs in the route matrix above. Refresh after controller
  or Terraform route changes.
- [ ] Verify current edge thresholds, time window, key dimensions, optional
  enablement, rule expressions, and ordering from Terraform/configuration.
- [ ] Add semantic assertions for every included and excluded route family in
  the matrix, including the `/api/v1` boundary, import slash boundary, search
  and reports suffix boundary, and auth `google/config` exclusion.
- [ ] Verify interactions between narrow and broad budgets against Cloudflare
  rule semantics; record whether list order affects evaluation instead of
  assuming precedence from Terraform text order alone.
- [ ] Keep app-level email/remote-address limits distinct from edge colo/IP
  limits in code, reports, and documentation.
- [ ] Treat static Terraform text checks as configuration evidence only; record
  explicitly whether live Cloudflare enforcement was exercised.
- [ ] If live testing is available, use an isolated staging zone with bounded
  requests and retain policy version and evidence; never load-test production.
- [ ] Until staging evidence exists, label Cloudflare enforcement unverified
  and do not treat the example tfvars value or static check as deployment
  state.

## Regression matrix

| Existing baseline | Current evidence | Additional HARD-04 evidence needed |
| --- | --- | --- |
| Protected and public routes, invalid/expired JWTs, unknown user, CORS, headers | [`SecurityHardeningIntegrationTest`](../../backend/src/test/java/com/know/integration/SecurityHardeningIntegrationTest.java) discovers controller routes and exercises these contracts in the H2 integration profile. | Repeat relevant routes through the local and production-shaped Caddy paths; report origin/host and forwarded-header behavior. |
| Cross-user reads/writes, reference ownership, list/search isolation, export access | [`CrossUserIsolationIntegrationTest`](../../backend/src/test/java/com/know/integration/CrossUserIsolationIntegrationTest.java) exercises ownership and transfer/export boundaries in H2. | Preserve these cases while reviewing rate-limited imports/exports and deployed proxy behavior; verify response/log bodies do not reveal foreign data. |
| Timer WebSocket authentication and user-specific updates | [`TimerWebSocketHandlerTest`](../../backend/src/test/java/com/know/realtime/TimerWebSocketHandlerTest.java) and [`KnowIntegrationTest`](../../backend/src/test/java/com/know/integration/KnowIntegrationTest.java) cover handler auth and integration behavior. | Retain the production-proxy WebSocket smoke and explicitly attempt a cross-user subscription through that path. |
| Import/export API behavior | [`ImportControllerApiTest`](../../backend/src/test/java/com/know/api/ImportControllerApiTest.java) covers controller/service delegation; H2 integration tests cover import flows and ownership. | Add request-size/type boundary evidence through the deployed-shaped proxy and link it to the Cloudflare import path budget. |

- [ ] Verify invalid/expired tokens, protected routes, intended public routes,
  CORS origin/method behavior, and security headers through local and
  production-shaped proxy paths.
- [ ] Verify WebSocket authentication and ownership, including cross-user
  subscription attempts.
- [ ] Verify import size/type limits and export ownership with boundary and
  rejection cases.
- [ ] Verify spoofed identity/forwarding headers cannot bypass rate limits or
  authorization.
- [ ] Ensure failures never include secrets or another user's data in logs or
  response bodies.
- [ ] Exercise the auth form's 429 feedback in desktop Chromium and mobile-size
  Chromium: assert the existing accessible alert and retry action remain
  reachable and the email can be corrected. Assert the 429 response itself is
  the same for existing and unknown identities; document any separate account
  enumeration behavior instead of attributing it to the rate-limit response.
- [ ] Link tests, source route inventory, policy version, and environment of
  each run before marking the milestone complete.
