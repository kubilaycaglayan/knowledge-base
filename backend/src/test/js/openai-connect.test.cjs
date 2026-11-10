const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('Google callback posts the credential and resumes the OAuth request', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../../main/resources/static/connect/openai/openai-connect.js'), 'utf8');
  let callback;
  let posted;
  const button = {};
  const window = { location: { href: '' }, alert: () => assert.fail('Unexpected login error'), google: { accounts: { id: {
    initialize: options => { assert.equal(options.client_id, 'client-id'); callback = options.callback; },
    renderButton: element => assert.equal(element, button),
  } } } };
  const document = { getElementById: id => ({ 'google-connect-config': { dataset: { clientId: 'client-id', csrfToken: 'csrf' } }, 'google-connect-button': button }[id]) };
  const fetch = async (url, options) => { posted = { url, options }; return { ok: true, json: async () => ({ authorizationUrl: '/oauth2/authorize?state=example' }) }; };
  vm.runInNewContext(source, { window, document, fetch });
  assert.equal(typeof callback, 'function');
  await callback({ credential: 'google-token' });
  assert.equal(posted.url, '/connect/openai/google');
  assert.equal(posted.options.headers['X-CSRF-TOKEN'], 'csrf');
  assert.equal(JSON.parse(posted.options.body).idToken, 'google-token');
  assert.equal(window.location.href, '/oauth2/authorize?state=example');
});
