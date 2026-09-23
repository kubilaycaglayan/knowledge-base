# Deployment

The Cloudflare production proxy CSP permits the Cloudflare Web Analytics beacon and its telemetry endpoint.

Sign-in survives API/container recreation: tokens are signed with the persistent
`JWT_SECRET` in `.env.production`, not a per-process key. Keep that value and the
public origin stable across deployments; rotating the key invalidates existing
tokens, and browser storage is specific to an origin. Back up the environment
securely alongside database backups. Tokens retain their existing 30-day expiry;
deployment does not reset it. Ordinary API errors and temporary deployment
outages preserve the browser session. Both smoke modes recreate the API and
verify the original token still reads the signed-in account afterward.

Production deployment defaults to API host port `18082`, PostgreSQL host port `15433`, and non-tunneled proxy port `19080`; each deployment reports the selected ports. It reads `KNOW_API_BASE` from `.env.production` (defaulting to `https://${DOMAIN}/api/v1`) and validates that it matches the production domain. Web/API deployment does not build or package the Chrome extension.

For production, use Cloudflare Tunnel so the Ubuntu server makes only outbound connections and the router needs no inbound port rules. Add `blaqc.space` to Cloudflare, use Cloudflare nameservers (full setup), and publish `knowledgebase.blaqc.space` through a named tunnel to `http://proxy:80`. Copy the tunnel token into the untracked `.env.production` as `CLOUDFLARE_TUNNEL_TOKEN`; never commit it. For a normal web/API deployment, run `./scripts/production-web-deploy.sh`; the script fixes the Compose project name to `knowledge-base-production` instead of accepting an inherited value. This runs preflight, builds with cache, updates the services in place, and waits for API, proxy, and tunnel health. Use `./scripts/production-web-deploy-no-cache.sh` only when a deliberate no-cache rebuild is wanted. Development uses a separate, fixed `knowledge-base-dev` Compose project and database volume. Production uses `docker-compose.production.yml` and `docker-compose.cloudflare.yml`; the production database volume is external and cannot be removed by Compose. The preflight rejects an incorrect project name, placeholder secrets, local/example domains, missing production CORS origin, missing tunnel token, missing production database volume, unresolved DNS, invalid Compose interpolation, and invalid Caddy configuration. Cloudflare terminates public HTTPS; the local Caddy origin listens only on the private Docker network. The base Compose file binds convenience and test ports to loopback; the Cloudflare overlay removes all host port bindings from the production proxy. The production web build uses the same-origin `/api/v1` proxy by default. PostgreSQL, the API, Caddy, and the tunnel origin remain private.

The API exposes `/actuator/health`, and Compose waits for PostgreSQL health before starting it. The public Caddy proxy has its own HTTPS health check and emits baseline `nosniff`, frame-denial, strict-origin referrer, CSP, and restrictive Permissions-Policy headers. Compose keeps each service's JSON logs bounded to three 10 MB files; inspect them with `docker compose logs --tail=200 api` (or `db`, `web`, or `proxy`) and forward them to the host's normal log collection if required.

Production Compose starts a dedicated `backup` container. It writes a local PostgreSQL dump immediately and every hour thereafter into the ignored, repo-local `backups/` directory, retaining 168 completed dumps by default (seven days). Configure `BACKUP_INTERVAL_SECONDS` or `BACKUP_RETENTION_COUNT` in `.env.production` if needed. The existing `./deployment/backup.sh` remains available for on-demand dumps and writes mode-600 files. The container runs as `BACKUP_UID`:`BACKUP_GID` (default `1000:1000`) so the mode-600 dumps and status file stay readable by the deploy user without `sudo`. The local dump is completed before any remote work, so a failed remote refresh cannot remove the latest known-good local snapshot.

The same container refreshes the explicitly confirmed remote backup database (currently a Neon project) after each local dump; set `BACKUP_DB_ENABLED=0` to skip it. `BACKUP_DB_URL` is the direct endpoint used for `pg_dump`/`pg_restore`; its URL path supplies the target database name. `BACKUP_DB_URL_POOLED` is optional and is used only for a connectivity check. `BACKUP_DB_CONFIRM=1` is the explicit authorization to overwrite the database named in the direct URL. The script uses an atomic lock, a temporary custom-format dump, `pg_restore --clean --if-exists --no-owner --no-acl`, Flyway history validation (and full `flyway validate` when the maintenance image provides the CLI), table lists, exact row counts, and deterministic row checksums. It records status, duration, dump size, checksum, and timestamps in `backups/backup-db-status.env` without writing credentials. Inspect the result with `docker compose --project-name knowledge-base-production logs --tail=100 backup` and the status file.

The backup database is a periodically refreshed backup, not an application datasource, read replica, or automatic failover target. Docker PostgreSQL remains the only live system of record and all expected recovery-point loss is up to one completed backup interval. A refresh temporarily makes the backup database unavailable or inconsistent; never point the application at it during refresh. Neon compute wake-up can add backup latency. A failed refresh does not affect application writes or local snapshots.

For recovery, stop application writes, validate the latest backup database snapshot, export it with `pg_dump`, restore it into a new disposable PostgreSQL database, run Flyway/schema and representative application checks, and only then perform an explicitly approved production restore or switch. The local backup remains important because a host or disk failure can destroy both the application and local copies. The production database volume is external and must never be removed, reset, or included in cleanup; only a deliberate verified backup/restore migration may replace it. Keep the production database volume and Caddy data volume on persistent storage.
# Cloudflare WAF

Production traffic is published through Cloudflare Tunnel. Configure the WAF
rules from `deployment/cloudflare` so the edge protects both the Vue web client
and `/api/v1` before traffic reaches Caddy and Spring Boot.

The Terraform configuration creates:

- Cloudflare Managed Ruleset execution for common web exploits.
- A custom rule set that rejects unexpected hosts and unsupported HTTP methods.
- Endpoint-specific rate limits for authentication, imports, search/reports, and
  the API as a whole.

Create a Cloudflare API token with `Zone WAF Write` for the target zone, then
run:

```bash
cd deployment/cloudflare
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars; do not commit it.
terraform init
terraform fmt -check
terraform validate
terraform plan
terraform apply
```

Review Cloudflare Security Events after the first apply. Managed rules should be
kept at their vendor defaults unless a specific false positive is observed.
Use a narrow exception for that endpoint or rule rather than disabling the WAF
globally. The existing Spring authentication limiter remains enabled because it
also keys attempts by email and is independent of edge IP limits.

The origin must remain reachable only through the tunnel. Deploy production
with `docker-compose.cloudflare.yml`; do not publish the proxy's HTTP/HTTPS
ports directly to the Internet.
