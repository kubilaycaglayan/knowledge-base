const test = require("node:test");
const assert = require("node:assert/strict");
const { authorizationUrl, parseRedirect } = require("./google-auth.js");

const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const token = (nonce) => `${encode({ alg: "none" })}.${encode({ nonce })}.signature`;

test("builds an OIDC authorization request for the extension redirect", () => {
  const url = new URL(authorizationUrl("client-id", "https://extension.chromiumapp.org/", "state", "nonce"));
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("response_type"), "id_token");
  assert.equal(url.searchParams.get("client_id"), "client-id");
  assert.equal(url.searchParams.get("redirect_uri"), "https://extension.chromiumapp.org/");
  assert.equal(url.searchParams.get("state"), "state");
  assert.equal(url.searchParams.get("nonce"), "nonce");
  assert.equal(url.searchParams.get("scope"), "openid email profile");
});

test("accepts only a redirect with matching state and nonce", () => {
  const idToken = token("nonce");
  assert.equal(parseRedirect(`https://extension.chromiumapp.org/#state=state&id_token=${idToken}`, "state", "nonce"), idToken);
  assert.throws(() => parseRedirect(`https://extension.chromiumapp.org/#state=other&id_token=${idToken}`, "state", "nonce"), /state mismatch/);
  assert.throws(() => parseRedirect(`https://extension.chromiumapp.org/#state=state&id_token=${token("other")}`, "state", "nonce"), /nonce mismatch/);
});
