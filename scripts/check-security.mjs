import { readFileSync } from 'node:fs'

const read = file => readFileSync(file, 'utf8')
const application = read('backend/src/main/resources/application.yml')
const compose = read('docker-compose.yml')
const proxy = read('deployment/Caddyfile')
const popup = read('chrome-extension/popup.js')
const envExample = read('.env.example')

const checks = [
  [application.includes('jwt-secret: ${JWT_SECRET:}'), 'JWT secret has no fallback value'],
  [application.includes('password: ${DATABASE_PASSWORD:}'), 'database password has no fallback value'],
  [compose.includes('JWT_SECRET:?Set JWT_SECRET'), 'Compose requires JWT_SECRET'],
  [compose.includes('POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD'), 'Compose requires POSTGRES_PASSWORD'],
  [application.includes('cors-origins: ${CORS_ORIGINS:http://localhost:5173}'), 'API CORS default is local-only'],
  [compose.includes('CORS_ORIGINS:-http://localhost:5173'), 'Compose CORS default is local-only'],
  [envExample.includes('chrome-extension://replace-with-extension-id'), 'environment template requires an explicit extension origin'],
  [!envExample.includes('chrome-extension://*'), 'environment template does not allow all extension origins'],
  [proxy.includes('Content-Security-Policy'), 'proxy emits CSP'],
  [proxy.includes('Permissions-Policy'), 'proxy emits Permissions-Policy'],
  [!popup.includes('innerHTML'), 'extension popup does not interpolate API data into innerHTML']
]

for (const [passed, description] of checks) if (!passed) throw new Error(`Security contract failed: ${description}`)
console.log(`Security contract passed (${checks.length} checks)`)
