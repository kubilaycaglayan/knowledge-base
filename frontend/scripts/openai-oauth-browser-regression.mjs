import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

// Run against an isolated OAuth-enabled local API; never against production.
const base = process.env.OAUTH_BROWSER_BASE || 'http://localhost:8080';
assert.match(base, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/);
const clientId = process.env.OAUTH_BROWSER_CLIENT_ID || 'knowledge-base-openai';
const callback = 'https://chatgpt.com/connector_platform_oauth_redirect';
const caddy = readFileSync(new URL('../../deployment/Caddyfile.cloudflare', import.meta.url), 'utf8');
const policy = caddy.match(/header @oauth_connect Content-Security-Policy "([^"]+)"/)[1];
const email = `browser-oauth-${randomUUID()}@example.com`;
const password = 'Disposable-OAuth-Password-2026';
const registered = await fetch(`${base}/api/v1/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
assert.equal(registered.status, 200, 'disposable account registration failed');
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route(`${base}/connect/openai/**`, async route => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': policy } });
  });
  await page.route(`${callback}**`, route => route.fulfill({ status: 200, body: 'callback reached' }));
  const verifier = randomBytes(48).toString('base64url');
  const params = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: callback, resource: `${base}/mcp`, scope: 'kb:notes:read', state: randomBytes(24).toString('base64url'), code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' });
  await page.goto(`${base}/oauth2/authorize?${params}`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.locator('form button').click({ timeout: 5000 });
  await page.getByRole('heading', { name: 'Connect Recall Personal Knowledge Base' }).waitFor();
  // Cancellation must ignore checked permissions and never issue a code.
  await page.getByRole('button', { name: 'Cancel connection' }).click();
  await page.waitForURL(`${callback}**`, { timeout: 5000 });
  const denied = new URL(page.url()).searchParams;
  assert.equal(denied.get('error'), 'access_denied');
  assert.equal(denied.has('code'), false);
  assert.equal(denied.get('state'), params.get('state'));
  console.log('OAuth cancellation denies access without issuing a code.');
} finally {
  await browser.close();
}
