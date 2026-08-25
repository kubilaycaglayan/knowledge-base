import { readFileSync } from 'node:fs'

const read = file => readFileSync(file, 'utf8')
const application = read('backend/src/main/resources/application.yml')
const compose = read('docker-compose.yml')
const proxy = read('deployment/Caddyfile')
const popup = read('chrome-extension/popup.js')
const envExample = read('.env.example')
const authView = read('frontend/src/views/AuthView.vue')

const checks = [
  [application.includes('jwt-secret: ${JWT_SECRET:}'), 'JWT secret has no fallback value'],
  [application.includes('password: ${DATABASE_PASSWORD:}'), 'database password has no fallback value'],
  [compose.includes('JWT_SECRET:?Set JWT_SECRET'), 'Compose requires JWT_SECRET'],
  [compose.includes('POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD'), 'Compose requires POSTGRES_PASSWORD'],
  [application.includes('cors-origins: ${CORS_ORIGINS:http://localhost:5173}'), 'API CORS default is local-only'],
  [compose.includes('CORS_ORIGINS:-http://localhost:5173'), 'Compose CORS default is local-only'],
  [compose.includes('DOMAIN: "${DOMAIN:-localhost}"'), 'Compose passes the Caddy domain into the proxy'],
  [compose.includes('127.0.0.1:${PROXY_DEV_PORT:-3000}:80'), 'local convenience proxy port binds only to loopback'],
  [compose.includes('127.0.0.1:${DB_DEV_PORT:-5432}:5432'), 'local database convenience port binds only to loopback'],
  [envExample.includes('chrome-extension://replace-with-extension-id'), 'environment template requires an explicit extension origin'],
  [!envExample.includes('chrome-extension://*'), 'environment template does not allow all extension origins'],
  [proxy.includes('Content-Security-Policy'), 'proxy emits CSP'],
  [proxy.includes('Permissions-Policy'), 'proxy emits Permissions-Policy'],
  [!popup.includes('innerHTML'), 'extension popup does not interpolate API data into innerHTML'],
  [proxy.includes('{$DOMAIN:localhost}') && proxy.includes(':80 {'), 'proxy supports the configured domain with a local listener fallback'],
  [application.includes('google-client-id: ${GOOGLE_CLIENT_ID:}'), 'Google client ID has no secret fallback'],
  [authView.includes("'/auth/google'"), 'web authentication sends Google credentials to the backend verifier'],
  [proxy.includes('https://accounts.google.com/gsi/client'), 'proxy CSP permits the Google Identity Services client']
]

for (const [passed, description] of checks) if (!passed) throw new Error(`Security contract failed: ${description}`)
console.log(`Security contract passed (${checks.length} checks)`)
