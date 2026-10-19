import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { violations, checkRepository } from './guard.mjs';

test('main, detached HEAD, sensitive paths, and existing skills are rejected', () => {
  assert.ok(violations('main', []).length);
  assert.ok(violations('', []).length);
  for (const file of ['.env.production', 'backups/snapshot.sql', 'secrets', 'deployment/cloudflare/terraform.tfstate', '.agents/skills/app-session/SKILL.md']) {
    assert.ok(violations('homework/datatalksclub-submission', [file]).length, file);
  }
  assert.deepEqual(violations('homework/datatalksclub-submission', ['product-spec.md', '.env.example', 'agent-capabilities/skills/api-contract-review/SKILL.md']), []);
});

test('the real Git index is checked, including staged skill deletion', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'kb-homework-guard-'));
  const git = args => execFileSync('git', args, { cwd: temp, stdio: 'pipe' });
  try {
    git(['init', '-b', 'homework/datatalksclub-submission']);
    mkdirSync(path.join(temp, '.agents/skills/existing'), { recursive: true });
    writeFileSync(path.join(temp, '.agents/skills/existing/SKILL.md'), 'fixture');
    git(['add', '.']);
    git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture']);
    assert.deepEqual(checkRepository(temp), []);
    git(['rm', '.agents/skills/existing/SKILL.md']);
    assert.match(checkRepository(temp).join('\n'), /skills must be preserved/);
    writeFileSync(path.join(temp, '.env.production'), 'synthetic fixture only');
    git(['add', '.env.production']);
    assert.match(checkRepository(temp).join('\n'), /Sensitive path/);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
