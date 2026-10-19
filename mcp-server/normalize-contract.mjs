import fs from 'node:fs';
import YAML from 'yaml';

const spec = JSON.parse(fs.readFileSync(0, 'utf8'));
spec.info.title = 'Knowledge Base API';
spec.info.description = 'Retrospective contract exported from the implemented Spring API. See docs/api-contract.md for provenance and limitations.';
spec.servers = [{ url: '/', description: 'Same origin; paths include /api/v1' }];
const publicOperations = new Set([
  'get /api/v1/auth/google/config', 'post /api/v1/auth/register',
  'post /api/v1/auth/login', 'post /api/v1/auth/google',
]);
for (const [route, item] of Object.entries(spec.paths)) {
  for (const [method, operation] of Object.entries(item)) {
    if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
    operation.security = publicOperations.has(`${method} ${route}`) ? [] : [{ bearerAuth: [] }];
  }
}
spec['x-homework-source-revision'] = process.env.HOMEWORK_SOURCE_REVISION || 'unknown';
process.stdout.write(YAML.stringify(spec, { lineWidth: 100 }));
