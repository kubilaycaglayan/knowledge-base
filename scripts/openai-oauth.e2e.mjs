import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";

const port = process.env.API_DEV_PORT || "8080";
const baseUrl = process.env.OPENAI_OAUTH_ISSUER || `http://localhost:${port}`;
const resource = `${baseUrl}/mcp`;
const clientId = process.env.OPENAI_OAUTH_CLIENT_ID || "knowledge-base-openai-smoke";
const clientSecret = process.env.OPENAI_OAUTH_CLIENT_SECRET || "local-smoke-openai-client-secret-not-for-production";
const redirectUri = "https://chatgpt.com/connector_platform_oauth_redirect";
const domainChallenge = process.env.OPENAI_DOMAIN_CHALLENGE || "knowledge-base-openai-smoke-challenge";
const cookies = new Map();

function rememberCookies(response) {
  const setCookies = response.headers.getSetCookie?.()
    ?? [response.headers.get("set-cookie")].filter(Boolean);
  for (const header of setCookies) {
    const [pair] = header.split(";", 1);
    const separator = pair.indexOf("=");
    if (separator < 1) continue;
    const name = pair.slice(0, separator);
    const value = pair.slice(separator + 1);
    if (/max-age=0/i.test(header)) cookies.delete(name);
    else cookies.set(name, value);
  }
}

async function request(url, options = {}) {
  const headers = new Headers(options.headers ?? {});
  if (cookies.size > 0 && !headers.has("cookie")) {
    headers.set("cookie", [...cookies].map(([name, value]) => `${name}=${value}`).join("; "));
  }
  const response = await fetch(url, { ...options, headers, redirect: "manual" });
  rememberCookies(response);
  return response;
}

function decodeHtml(value) {
  return value.replaceAll("&quot;", '"').replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
}

function attributes(tag) {
  const result = {};
  for (const [, name, doubleQuoted, singleQuoted, unquoted] of tag.matchAll(
    /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g,
  )) {
    result[name.toLowerCase()] = decodeHtml(doubleQuoted ?? singleQuoted ?? unquoted ?? "");
  }
  return result;
}

function inputValues(html) {
  return [...html.matchAll(/<input\b[^>]*>/gi)].map(([tag]) => attributes(tag));
}

function field(html, name) {
  const found = inputValues(html).find((input) => input.name === name);
  assert.ok(found, `OAuth form did not contain ${name}`);
  return found.value ?? "";
}

function formBody(values) {
  return new URLSearchParams(values).toString();
}

function pkcePair() {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

async function createAccount(label) {
  const email = `oauth-${label}-${randomUUID()}@example.com`;
  const password = "e2e-OAuth-Password-2026";
  const response = await request(`${baseUrl}/api/v1/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 200, `Could not register isolated ${label} OAuth test account`);
  const payload = await response.json();
  assert.ok(payload.token, "Registration response did not contain a Knowledge Base JWT");
  return { email, password, token: payload.token };
}

async function getConsentPage(email, password, scopes, state, challenge) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    resource,
    scope: scopes.join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  let response = await request(`${baseUrl}/oauth2/authorize?${params}`);

  for (let redirects = 0; redirects < 6; redirects += 1) {
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const next = new URL(response.headers.get("location"), baseUrl);
      if (next.pathname === "/connect/openai/login") {
        const loginPage = await request(next);
        assert.equal(loginPage.status, 200, "OAuth password login page did not load");
        const loginHtml = await loginPage.text();
        const csrf = field(loginHtml, "_csrf");
        const previousSession = [...cookies].find(([name]) => name === "SESSION")?.[1];
        const loginResponse = await request(`${baseUrl}/connect/openai/login`, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: formBody({ email, password, _csrf: csrf }),
        });
        assert.equal(loginResponse.status, 302, "OAuth password login did not continue authorization");
        const currentSession = [...cookies].find(([name]) => name === "SESSION")?.[1];
        if (previousSession && currentSession) {
          assert.notEqual(currentSession, previousSession, "OAuth login did not rotate its session ID");
        }
        response = await request(new URL(loginResponse.headers.get("location"), baseUrl));
        continue;
      }
      if (next.pathname === "/oauth2/authorize") {
        response = await request(next);
        continue;
      }
      if (next.pathname === "/connect/openai/consent") {
        response = await request(next);
        const consentHtml = await response.text();
        assert.equal(response.status, 200,
          `OAuth consent page did not load for state ${state} at ${next.href}: ${consentHtml}`);
        return consentHtml;
      }
      throw new Error(`Unexpected OAuth redirect: ${next.pathname}`);
    }
    throw new Error(`OAuth authorization stopped before consent (HTTP ${response.status})`);
  }
  throw new Error("OAuth authorization exceeded the redirect limit");
}

async function authorizeAndExchange(account, scopes, selectedScopes, { invalidVerifier = false } = {}) {
  const state = randomBytes(24).toString("base64url");
  const { verifier, challenge } = pkcePair();
  const consentHtml = await getConsentPage(account.email, account.password, scopes, state, challenge);
  const renderedScopes = inputValues(consentHtml)
    .filter((input) => input.name === "scope" && input.checked !== undefined)
    .map((input) => input.value);
  for (const scope of scopes) assert.ok(renderedScopes.includes(scope), `Consent omitted requested scope ${scope}`);
  assert.match(consentHtml, /Choose the read-only categories/);

  const consentResponse = await request(`${baseUrl}/oauth2/authorize`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: formBody({
      _csrf: field(consentHtml, "_csrf"),
      client_id: field(consentHtml, "client_id"),
      state: field(consentHtml, "state"),
      user_oauth_approval: "true",
      scope: selectedScopes.join(" "),
    }),
  });
  assert.equal(consentResponse.status, 302, "Consent did not return an authorization code");
  const callback = new URL(consentResponse.headers.get("location"));
  assert.equal(callback.searchParams.get("state"), state, "OAuth state did not survive the callback");
  assert.equal(callback.searchParams.get("iss"), baseUrl, "OAuth callback did not include the configured issuer");
  const code = callback.searchParams.get("code");
  assert.ok(code, "OAuth callback did not contain an authorization code");

  const submittedVerifier = invalidVerifier ? randomBytes(48).toString("base64url") : verifier;
  const tokenResponse = await exchangeAuthorizationCode(code, submittedVerifier);
  const tokenBody = await tokenResponse.text();
  if (invalidVerifier) {
    assert.equal(tokenResponse.status, 400, `Wrong PKCE verifier was accepted: ${tokenBody}`);
    assert.equal(JSON.parse(tokenBody).error, "invalid_grant");
    return null;
  }
  assert.equal(tokenResponse.status, 200, `Code exchange failed: ${tokenBody}`);
  return { ...JSON.parse(tokenBody), authorizationCode: code, codeVerifier: verifier };
}

async function exchangeAuthorizationCode(code, verifier, target = resource) {
  return fetch(`${baseUrl}/oauth2/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: formBody({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
      resource: target,
    }),
  });
}

async function exchangeRefresh(refreshToken, target = resource) {
  const values = { grant_type: "refresh_token", refresh_token: refreshToken };
  if (target) values.resource = target;
  return fetch(`${baseUrl}/oauth2/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: formBody(values),
  });
}

async function mcp(token) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return fetch(resource, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: randomUUID(), method: "tools/list", params: {} }),
  });
}

async function main() {
  assert.equal(process.env.OPENAI_OAUTH_ENABLED, "true", "Smoke environment must enable isolated OAuth");
  const challengeResponse = await request(`${baseUrl}/.well-known/openai-apps-challenge`);
  assert.equal(challengeResponse.status, 200);
  assert.equal(await challengeResponse.text(), domainChallenge, "Domain challenge endpoint did not return exact plain text");
  const serverMetadata = await request(`${baseUrl}/.well-known/oauth-authorization-server`);
  assert.equal(serverMetadata.status, 200);
  const metadata = await serverMetadata.json();
  assert.equal(metadata.issuer, baseUrl);
  assert.ok(metadata.code_challenge_methods_supported.includes("S256"));
  assert.equal(metadata.authorization_response_iss_parameter_supported, true);
  const resourceMetadata = await request(`${baseUrl}/.well-known/oauth-protected-resource`);
  assert.equal(resourceMetadata.status, 200);
  assert.equal((await resourceMetadata.json()).resource, resource);

  const invalidResource = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    resource: `${baseUrl}/wrong-resource`,
    scope: "kb:notes:read",
    state: "invalid-resource-e2e",
    code_challenge: "invalid-resource-challenge",
    code_challenge_method: "S256",
  });
  const invalidTarget = await request(`${baseUrl}/oauth2/authorize?${invalidResource}`);
  assert.equal(invalidTarget.status, 400, "Authorization accepted a different resource identifier");
  assert.equal((await invalidTarget.json()).error, "invalid_target");

  const invalidRedirect = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: "https://attacker.example/callback",
    resource,
    scope: "kb:notes:read",
    state: "invalid-redirect-e2e",
    code_challenge: "invalid-redirect-challenge",
    code_challenge_method: "S256",
  });
  const invalidCallback = await request(`${baseUrl}/oauth2/authorize?${invalidRedirect}`);
  assert.equal(invalidCallback.status, 400, "Authorization accepted a callback outside the registered redirect allow-list");

  assert.equal((await mcp()).status, 401, "MCP accepted a request with no access token");
  assert.equal((await mcp("not-a-signed-jwt")).status, 401, "MCP accepted a malformed access token");
  const directConsent = await request(`${baseUrl}/connect/openai/consent?client_id=${clientId}&state=direct-consent&scope=kb%3Anotes%3Aread`);
  assert.equal(directConsent.status, 302, "Anonymous direct consent access was not redirected to OAuth login");
  assert.equal(new URL(directConsent.headers.get("location"), baseUrl).pathname, "/connect/openai/login");

  const owner = await createAccount("owner");
  const other = await createAccount("other");
  const authorization = await authorizeAndExchange(owner, ["kb:notes:read", "kb:logs:read"], ["kb:notes:read"]);
  const claims = JSON.parse(Buffer.from(authorization.access_token.split(".")[1], "base64url").toString("utf8"));
  assert.equal(claims.iss, baseUrl);
  assert.equal(claims.aud, resource);
  assert.deepEqual(claims.scope, ["kb:notes:read"]);
  assert.equal(claims.exp - claims.iat, 900, "Access token lifetime is not 15 minutes");

  const toolsResponse = await mcp(authorization.access_token);
  assert.equal(toolsResponse.status, 200);
  const toolNames = (await toolsResponse.json()).result.tools.map(({ name }) => name).sort();
  assert.deepEqual(toolNames, ["note_get", "notes_list", "search"]);

  const ownerConnections = await request(`${baseUrl}/api/v1/openai-connections`, {
    headers: { authorization: `Bearer ${owner.token}` },
  });
  assert.equal(ownerConnections.status, 200);
  const ownerGrants = await ownerConnections.json();
  assert.equal(ownerGrants.length, 1);
  assert.match(ownerGrants[0].scopes, /kb:notes:read/);
  const grantId = ownerGrants[0].id;
  const otherConnections = await request(`${baseUrl}/api/v1/openai-connections`, {
    headers: { authorization: `Bearer ${other.token}` },
  });
  assert.deepEqual(await otherConnections.json(), [], "Another user could see the owner's OAuth grant");
  const foreignRevoke = await request(`${baseUrl}/api/v1/openai-connections/${grantId}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${other.token}` },
  });
  assert.equal(foreignRevoke.status, 404, "Another user could revoke the owner's OAuth grant");

  const wrongResourceRefresh = await exchangeRefresh(authorization.refresh_token, `${baseUrl}/wrong-resource`);
  assert.equal(wrongResourceRefresh.status, 400, "Refresh accepted a different resource identifier");
  const rotatedResponse = await exchangeRefresh(authorization.refresh_token, null);
  const rotatedBody = await rotatedResponse.text();
  assert.equal(rotatedResponse.status, 200, `Refresh without a resource identifier failed: ${rotatedBody}`);
  const rotated = JSON.parse(rotatedBody);
  assert.notEqual(rotated.refresh_token, authorization.refresh_token, "Refresh token did not rotate");
  const replayResponse = await exchangeRefresh(authorization.refresh_token);
  assert.equal(replayResponse.status, 400, "Replayed refresh token was accepted");
  assert.equal((await mcp(rotated.access_token)).status, 401, "Refresh replay did not revoke the grant");

  const secondAuthorization = await authorizeAndExchange(owner, ["kb:logs:read"], ["kb:logs:read"]);
  const logTools = await mcp(secondAuthorization.access_token);
  assert.equal(logTools.status, 200);
  assert.deepEqual((await logTools.json()).result.tools.map(({ name }) => name).sort(), ["logs_list", "search"]);
  const secondGrant = await request(`${baseUrl}/api/v1/openai-connections`, {
    headers: { authorization: `Bearer ${owner.token}` },
  });
  assert.equal(secondGrant.status, 200);
  const grants = await secondGrant.json();
  assert.equal(grants.length, 1);
  const revoked = await request(`${baseUrl}/api/v1/openai-connections/${grants[0].id}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${owner.token}` },
  });
  assert.equal(revoked.status, 200);
  assert.equal((await mcp(secondAuthorization.access_token)).status, 401, "Explicit grant revocation did not invalidate MCP access");
  const reconsentState = randomBytes(24).toString("base64url");
  const reconsentChallenge = pkcePair().challenge;
  const reconsentPage = await getConsentPage(owner.email, owner.password, ["kb:logs:read"],
    reconsentState, reconsentChallenge);
  assert.match(reconsentPage, /Approve selected access/, "Revoking a connection did not require fresh consent");

  await authorizeAndExchange(owner, ["kb:boards:read"], ["kb:boards:read"], { invalidVerifier: true });

  const replayAuthorization = await authorizeAndExchange(owner, ["kb:activity:read"], ["kb:activity:read"]);
  assert.equal((await mcp(replayAuthorization.access_token)).status, 200);
  const codeReplay = await exchangeAuthorizationCode(replayAuthorization.authorizationCode, replayAuthorization.codeVerifier);
  const replayBody = await codeReplay.json();
  assert.equal(codeReplay.status, 400, "Authorization code replay was accepted");
  assert.equal(replayBody.error, "invalid_grant", "Code replay did not use the OAuth invalid_grant response");
  assert.equal((await mcp(replayAuthorization.access_token)).status, 401, "Authorization code replay did not revoke the previously issued access token");

  console.log("OpenAI OAuth E2E passed: discovery, challenge, redirect allow-list, valid and invalid PKCE, session login, consent guard/scope binding, issuer/audience, MCP authentication and scope enforcement, owner isolation, refresh fallback/rotation/replay, authorization-code replay revocation, and explicit grant revocation.");
}

await main();
