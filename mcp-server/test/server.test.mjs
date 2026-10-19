import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readDocument } from '../server.mjs';

test('stdio client initializes, discovers only read tools, and reads real documents and API contracts', async () => {
  const client = new Client({ name: 'homework-test', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('../server.mjs', import.meta.url))], stderr: 'pipe' });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map(t => t.name).sort(), ['get_api_operation', 'read_project_document']);
    assert.ok(tools.every(t => t.annotations.readOnlyHint && !t.annotations.destructiveHint));
    const document = await client.callTool({ name: 'read_project_document', arguments: { document: 'specification' } });
    assert.ok(!document.isError);
    assert.match(document.content[0].text, /SPEC-04/);
    const operation = await client.callTool({ name: 'get_api_operation', arguments: { method: 'get', route: '/api/v1/timers/current' } });
    assert.ok(!operation.isError);
    const parsed = JSON.parse(operation.content[0].text);
    assert.ok(parsed.operation.responses['200']);
    assert.deepEqual(parsed.operation.security, [{ bearerAuth: [] }]);
    const traversal = await client.callTool({ name: 'read_project_document', arguments: { document: '../.env.production' } });
    assert.equal(traversal.isError, true);
    const missing = await client.callTool({ name: 'get_api_operation', arguments: { method: 'get', route: '/api/v1/not-a-route' } });
    assert.equal(missing.isError, true);
  } finally {
    await client.close();
  }
});

test('unknown document IDs and symlink substitution cannot expose another file', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'kb-homework-mcp-'));
  try {
    writeFileSync(path.join(temp, 'private.txt'), 'synthetic secret fixture');
    symlinkSync('private.txt', path.join(temp, 'product-spec.md'));
    assert.throws(() => readDocument(temp, 'specification'), /Symlink/);
    assert.throws(() => readDocument(temp, '../private.txt'), /Unknown document/);
    assert.throws(() => readDocument(temp, 'constructor'), /Unknown document/);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
