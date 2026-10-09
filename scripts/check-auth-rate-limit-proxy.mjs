import { createHmac, randomUUID } from "node:crypto";

const baseUrl = process.argv[2];
if (!baseUrl) {
  console.error("Usage: node scripts/check-auth-rate-limit-proxy.mjs <base-url>");
  process.exit(2);
}
const allowedOrigin = new URL(baseUrl).origin;

const unique = crypto.randomUUID();
const email = `rate-limit-${unique}@example.invalid`;
const password = "not-a-real-account-password";
const attempt = async (address, targetEmail = email) => {
  const response = await fetch(new URL("/api/v1/auth/login", baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": address,
    },
    body: JSON.stringify({ email: targetEmail, password }),
  });
  return {
    status: response.status,
    body: await response.json(),
    retryAfter: response.headers.get("retry-after"),
  };
};

for (let index = 0; index < 10; index++) {
  const response = await attempt(`198.51.100.${index + 1}`);
  if (response.status !== 401) {
    throw new Error(`Expected authentication failure on allowed attempt ${index + 1}; received ${response.status}`);
  }
}

const blocked = await attempt("203.0.113.99");
if (
  blocked.status !== 429 ||
  blocked.body.error !== "Too many authentication attempts; try again shortly" ||
  blocked.retryAfter !== null
) {
  throw new Error(`Unexpected blocked response contract: ${JSON.stringify(blocked)}`);
}

const independent = await attempt("203.0.113.99", `other-${unique}@example.invalid`);
if (independent.status !== 401) {
  throw new Error(`A different email unexpectedly shared the exhausted budget (${independent.status})`);
}

const protectedRoute = new URL("/api/v1/auth/me", baseUrl);
for (const headers of [
  {},
  { Authorization: "Bearer not-a-jwt" },
  {
    "X-User-Id": randomUUID(),
    "X-Forwarded-User": "attacker@example.invalid",
    "X-Forwarded-For": "203.0.113.50",
  },
]) {
  const response = await fetch(protectedRoute, { headers });
  if (response.status !== 401) {
    throw new Error(`Protected route accepted untrusted identity headers (${response.status})`);
  }
}

const jwtSecret = process.env.AUTH_RATE_LIMIT_JWT_SECRET;
if (jwtSecret) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    sub: randomUUID(),
    exp: Math.floor(Date.now() / 1000) - 60,
    iat: Math.floor(Date.now() / 1000) - 120,
  })}`;
  const expiredToken = `${unsigned}.${createHmac("sha256", jwtSecret).update(unsigned).digest("base64url")}`;
  const expired = await fetch(protectedRoute, { headers: { Authorization: `Bearer ${expiredToken}` } });
  if (expired.status !== 401) throw new Error(`Expired JWT was not rejected (${expired.status})`);
}

const page = await fetch(baseUrl);
for (const [header, value] of [
  ["x-content-type-options", "nosniff"],
  ["x-frame-options", "DENY"],
  ["referrer-policy", "strict-origin-when-cross-origin"],
  ["permissions-policy", "camera=(), microphone=(), geolocation=()"],
]) {
  if (page.headers.get(header) !== value) throw new Error(`Proxy header ${header} was not set as expected`);
}
if (!page.headers.get("content-security-policy")) {
  throw new Error("The proxy path omitted Content-Security-Policy");
}
const allowedCors = await fetch(protectedRoute, {
  method: "OPTIONS",
  headers: { Origin: allowedOrigin, "Access-Control-Request-Method": "PUT" },
});
if (
  allowedCors.headers.get("access-control-allow-origin") !== allowedOrigin ||
  !allowedCors.headers.get("access-control-allow-methods")?.includes("PUT")
) {
  throw new Error("The proxy path did not preserve the configured CORS origin and method");
}
const deniedCors = await fetch(protectedRoute, {
  method: "OPTIONS",
  headers: { Origin: "https://untrusted.example", "Access-Control-Request-Method": "GET" },
});
if (deniedCors.headers.has("access-control-allow-origin")) {
  throw new Error("The proxy path allowed an untrusted CORS origin");
}
const deniedMethod = await fetch(protectedRoute, {
  method: "OPTIONS",
  headers: { Origin: allowedOrigin, "Access-Control-Request-Method": "TRACE" },
});
if (deniedMethod.status !== 403 || deniedMethod.headers.has("access-control-allow-methods")) {
  throw new Error(`The proxy path did not reject an unconfigured CORS method (${deniedMethod.status})`);
}

console.log(
  "Production-shaped proxy checks passed: auth budgets/response, spoofed X-Forwarded-For and identity headers, unauthenticated/invalid identity rejection, security headers, and configured/untrusted CORS origins.",
);
