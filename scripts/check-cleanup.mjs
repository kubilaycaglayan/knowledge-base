import { readFileSync } from 'node:fs'

const smoke = readFileSync('scripts/smoke.sh', 'utf8')
const required = [
  ['docker compose down --volumes --remove-orphans --rmi local', 'scoped Compose containers, volumes, and local images cleanup'],
  ['docker buildx rm --force "$buildx_builder"', 'exact temporary Buildx builder cleanup'],
  ['docker buildx create --name "$buildx_builder" --driver docker-container', 'isolated Buildx builder creation'],
  ['export BUILDX_BUILDER="$buildx_builder"', 'Buildx cache is scoped to the temporary builder'],
  ['rm -rf "$backup_dir"', 'temporary backup directory cleanup']
]
for (const [fragment, description] of required) if (!smoke.includes(fragment)) throw new Error(`Cleanup contract failed: ${description}`)
console.log(`Cleanup contract passed (${required.length} checks)`)
