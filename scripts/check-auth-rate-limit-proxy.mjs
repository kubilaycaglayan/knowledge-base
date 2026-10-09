const baseUrl = process.argv[2];
if (!baseUrl) {
  console.error("Usage: node scripts/check-auth-rate-limit-proxy.mjs <base-url>");
  process.exit(2);
}

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

console.log(
  "Proxy auth rate-limit check passed: 10 attempts allowed, 11th blocked despite changing X-Forwarded-For, independent email allowed; Retry-After is not part of the response.",
);
