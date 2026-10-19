import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import SwaggerParser from '@apidevtools/swagger-parser';
import { apiOperationsFromOpenApi, apiOperationsFromMatrix } from '../scripts/check-ototest-source-drift.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const spec = YAML.parse(fs.readFileSync(path.join(root, 'openapi.yaml'), 'utf8'));
// Resolve local component references only: a contract check must not fetch URLs.
await SwaggerParser.validate(structuredClone(spec), { resolve: { external: false } });
const matrix = apiOperationsFromMatrix(fs.readFileSync(path.join(root, 'docs/ototest/01-api-matrix.md'), 'utf8'));
const actual = [...apiOperationsFromOpenApi(spec)].sort();
assert.deepEqual(actual, [...matrix.keys()].sort(), 'OpenAPI operations must exactly match the API matrix');
const publicOperations = new Set(['GET /api/v1/auth/google/config', 'POST /api/v1/auth/register', 'POST /api/v1/auth/login', 'POST /api/v1/auth/google']);
let refs = 0;
function checkReferences(value) {
  if (!value || typeof value !== 'object') return;
  if (value.$ref) {
    assert.ok(value.$ref.startsWith('#/'), 'Only local references are allowed');
    const resolved = value.$ref.slice(2).split('/').map(s => s.replaceAll('~1', '/').replaceAll('~0', '~')).reduce((obj, key) => obj?.[key], spec);
    assert.notEqual(resolved, undefined, `Unresolved reference: ${value.$ref}`);
    refs++;
  }
  for (const child of Object.values(value)) checkReferences(child);
}
checkReferences(spec);
for (const entry of actual) {
  const [method, route] = entry.split(' ');
  assert.deepEqual(spec.paths[route][method.toLowerCase()].security, publicOperations.has(entry) ? [] : [{ bearerAuth: [] }], `Authentication: ${entry}`);
}
assert.equal(spec.components.securitySchemes.bearerAuth.type, 'http');
assert.equal(spec.components.securitySchemes.bearerAuth.scheme, 'bearer');
console.log(`Contract passed: ${actual.length} operations match the matrix, ${Object.keys(spec.components.schemas).length} schemas, ${refs} local references, authentication checked.`);
