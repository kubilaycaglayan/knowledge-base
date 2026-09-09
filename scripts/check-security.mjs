import { readFileSync } from 'node:fs'

const read = file => readFileSync(file, 'utf8')
const application = read('backend/src/main/resources/application.yml')
const compose = read('docker-compose.yml')
const proxy = read('deployment/Caddyfile')
const productionProxy = read('deployment/Caddyfile.cloudflare')
const popup = read('chrome-extension/popup.js')
const envExample = read('.env.example')
const authView = read('frontend/src/views/AuthView.vue')
const preflight = read('deployment/preflight.sh')
const viteConfig = read('frontend/vite.config.ts')
const developmentDocs = read('docs/development.md')
const startDevelopment = read('scripts/start-development.sh')
const deployProduction = read('scripts/deploy-production-web.sh')
const deployProductionNoCache = read('scripts/deploy-production-web-no-cache.sh')
const developmentCompose = read('docker-compose.dev.yml')
const productionCompose = read('docker-compose.production.yml')

const checks = [
  [application.includes('jwt-secret: ${JWT_SECRET:}'), 'JWT secret has no fallback value'],
  [application.includes('password: ${DATABASE_PASSWORD:}'), 'database password has no fallback value'],
  [compose.includes('JWT_SECRET:?Set JWT_SECRET'), 'Compose requires JWT_SECRET'],
  [compose.includes('POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD'), 'Compose requires POSTGRES_PASSWORD'],
  [application.includes('cors-origins: ${CORS_ORIGINS:http://localhost:5177}'), 'API CORS default is local-only'],
  [compose.includes('CORS_ORIGINS:-http://localhost:5177'), 'Compose CORS default is local-only'],
  [compose.includes('DOMAIN: "${DOMAIN:-localhost}"'), 'Compose passes the Caddy domain into the proxy'],
  [compose.includes('127.0.0.1:${PROXY_DEV_PORT:-3000}:80'), 'local convenience proxy port binds only to loopback'],
  [compose.includes('127.0.0.1:${DB_DEV_PORT:-5432}:5432'), 'local database convenience port binds only to loopback'],
  [compose.match(/logging: \{driver: json-file, options: \{max-size: "10m", max-file: "3"\}\}/g)?.length === 4, 'all Compose services use bounded JSON log rotation'],
  [envExample.includes('chrome-extension://replace-with-extension-id'), 'environment template requires an explicit extension origin'],
  [!envExample.includes('chrome-extension://*'), 'environment template does not allow all extension origins'],
  [startDevelopment.includes('chrome_extension_origin=') && startDevelopment.includes('case ",${CORS_ORIGINS:-},"'), 'development startup preserves existing CORS origins and adds the configured extension origin'],
  [startDevelopment.includes('export COMPOSE_PROJECT_NAME="knowledge-base-dev"') && startDevelopment.includes('compose_args=(--project-name knowledge-base-dev'), 'development startup cannot inherit the production Compose project name'],
  [deployProduction.includes('export COMPOSE_PROJECT_NAME="knowledge-base-production"') && deployProduction.includes('compose_args=(--project-name knowledge-base-production'), 'production deployment uses the fixed production Compose project name'],
  [deployProductionNoCache.includes('export COMPOSE_PROJECT_NAME="knowledge-base-production"') && deployProductionNoCache.includes('compose_args=(--project-name knowledge-base-production'), 'no-cache production deployment uses the fixed production Compose project name'],
  [developmentCompose.startsWith('name: knowledge-base-dev\n') && productionCompose.startsWith('name: knowledge-base-production\n'), 'Compose overlays default to isolated development and production project names'],
  [proxy.includes('Content-Security-Policy'), 'proxy emits CSP'],
  [proxy.includes('ws://localhost:* ws://127.0.0.1:*'), 'proxy CSP permits local Vite hot-reload websockets only on loopback hosts'],
  [proxy.includes('Permissions-Policy'), 'proxy emits Permissions-Policy'],
  [!popup.includes('innerHTML'), 'extension popup does not interpolate API data into innerHTML'],
  [proxy.includes('{$DOMAIN:localhost}') && proxy.includes(':80 {'), 'proxy supports the configured domain with a local listener fallback'],
  [proxy.includes('redir @production https://{host}{uri} permanent'), 'non-local production HTTP traffic redirects to HTTPS'],
  [application.includes('google-client-id: ${GOOGLE_CLIENT_ID:}'), 'Google client ID has no secret fallback'],
  [authView.includes('/auth/google') && authView.includes('JSON.stringify({ idToken })'), 'web authentication sends Google credentials to the backend verifier'],
  [proxy.includes('https://accounts.google.com/gsi/client'), 'proxy CSP permits the Google Identity Services client'],
  [productionProxy.includes('https://static.cloudflareinsights.com') && productionProxy.includes('https://cloudflareinsights.com'), 'production proxy CSP permits Cloudflare Web Analytics'],
  [preflight.includes('DOMAIN must be the real production hostname') && preflight.includes('CORS_ORIGINS must include https://${DOMAIN}'), 'deployment preflight rejects local domains and incomplete production CORS'],
  [/host:\s*["']0\.0\.0\.0["']/.test(viteConfig) && /port:\s*5177/.test(viteConfig) && /strictPort:\s*true/.test(viteConfig), 'Vite hot reload binds to the documented memorable remote-development port'],
  [/proxy:\s*\{\s*["']\/api["']:\s*\{\s*target:\s*["']http:\/\/localhost:8080["']/.test(viteConfig), 'Vite hot reload proxies API requests to the local backend'],
  [developmentDocs.includes('http://localhost:3000') && developmentDocs.includes('0.0.0.0:5177') && developmentDocs.includes('ssh -L 3000:localhost:3000'), 'development documentation covers proxied and standalone hot-reload access']
]

for (const [passed, description] of checks) if (!passed) throw new Error(`Security contract failed: ${description}`)
console.log(`Security contract passed (${checks.length} checks)`)
