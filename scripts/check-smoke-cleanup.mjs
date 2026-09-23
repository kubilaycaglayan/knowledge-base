import { readFileSync } from "node:fs";

const smoke = readFileSync("scripts/run-smoke-tests.sh", "utf8");
const required = [
  ['smoke_pid="${BASHPID:-$$}"', "portable isolated smoke process identifier"],
  [
    'export COMPOSE_PROJECT_NAME="knowledge-base-smoke-${smoke_pid}-$(date +%s%N)"',
    "generated isolated smoke Compose project name",
  ],
  [
    '[[ "$COMPOSE_PROJECT_NAME" != *smoke* ]]',
    "rejection of a non-smoke Compose project name",
  ],
  ["-f docker-compose.smoke.yml", "smoke-only port isolation overlay"],
  [
    "compose down --volumes --remove-orphans --rmi local",
    "scoped Compose containers, volumes, and local images cleanup",
  ],
  [
    'docker buildx rm --force "$buildx_builder"',
    "exact temporary Buildx builder cleanup",
  ],
  [
    'docker buildx create --name "$buildx_builder" --driver docker-container',
    "isolated Buildx builder creation",
  ],
  [
    '--driver-opt network=host',
    "Buildx builder network access for dependency resolution",
  ],
  [
    'export BUILDX_BUILDER="$buildx_builder"',
    "Buildx builds are scoped to the temporary builder",
  ],
  ["for attempt in {1..180}; do", "fresh-database API health startup budget"],
  ["PROXY_HTTPS_PORT:=26443", "isolated full-stack HTTPS proxy port"],
  [
    "docker-compose.smoke-gha-cache.yml",
    "GitHub Actions BuildKit cache overlay",
  ],
  [
    "docker-compose.smoke-local-cache.yml",
    "optional local BuildKit cache overlay",
  ],
  [
    "docker-compose.smoke-local-api-cache-from.yml",
    "warm API BuildKit cache overlay",
  ],
  [
    "docker-compose.smoke-local-web-cache-from.yml",
    "warm web BuildKit cache overlay",
  ],
  ['rm -rf "$backup_dir"', "temporary backup directory cleanup"],
];
for (const [fragment, description] of required)
if (!smoke.includes(fragment))
    throw new Error(`Cleanup contract failed: ${description}`);
if (smoke.includes('if [[ "$attempt" == 30 ]]; then\n    echo "API did not become healthy"'))
  throw new Error("Cleanup contract failed: API health must not retain the premature 30-attempt timeout");
console.log(`Cleanup contract passed (${required.length} checks)`);
