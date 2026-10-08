# HARD-04 acceptance checklist: rate limits and security

Use this checklist with [HARD-04](04-rate-limits-and-security.md). Verify
limits from source at implementation time and report application and edge
controls separately.

## Application authentication limiter

- [ ] Document the live threshold, window, key construction, normalization,
  response status/body, and reset semantics from current code.
- [ ] Exercise login, registration, and Google authentication through the HTTP
  controller/integration boundary; assert the configured budget and 429
  response shape rather than only testing the counter class.
- [ ] Test exact boundary requests (last allowed and first rejected), then
  verify another normalized email/key has an independent budget.
- [ ] Advance an injected/fake clock beyond the window and prove the key can
  make an allowed request again without a minute-long sleep.
- [ ] Race concurrent attempts for the same key and prove the threshold cannot
  be bypassed or exceeded by a check-then-increment race.
- [ ] Exercise expiry cleanup past the configured map threshold and many
  distinct keys; assert expired entries are reclaimed and memory use is
  bounded by an explicit observable invariant.
- [ ] Determine the remote address seen through the production-shaped
  Caddy/Tomcat path; test whether spoofed forwarding headers alter the limiter
  key and document the observed trust boundary.
- [ ] State whether `Retry-After` is part of the contract; assert it only if
  implemented and documented.

## Edge policy and route coverage

- [ ] Inventory actual controller method/path pairs for auth, import, search,
  reports, and general APIs; compare them semantically with Cloudflare rules.
- [ ] Verify current edge thresholds, time window, key dimensions, optional
  enablement, rule expressions, and ordering from Terraform/configuration.
- [ ] Assert representative included and excluded path/method combinations;
  verify narrow endpoint rules apply before the broad API ceiling.
- [ ] Keep app-level email/remote-address limits distinct from edge colo/IP
  limits in code, reports, and documentation.
- [ ] Treat static Terraform text checks as configuration evidence only; record
  explicitly whether live Cloudflare enforcement was exercised.
- [ ] If live testing is available, use an isolated staging zone with bounded
  requests and retain policy version and evidence; never load-test production.

## Regression matrix

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
- [ ] Link tests, source route inventory, policy version, and environment of
  each run before marking the milestone complete.
