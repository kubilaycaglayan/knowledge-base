import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function violations(branch, files) {
  const findings = [];
  if (!/^homework\/datatalksclub(?:-[a-z0-9-]+)?$/.test(branch)) findings.push('Use a homework/datatalksclub-* branch; main and detached HEAD are rejected.');
  for (const file of files) {
    const normalized = file.toLowerCase();
    const basename = path.posix.basename(normalized);
    const template = basename === '.env.example' || basename === 'terraform.tfvars.example';
    if (!template && (basename === '.env' || basename.startsWith('.env.') || basename === 'secrets' ||
      /\.(pem|key|p12|pfx)$/.test(basename) || basename === 'terraform.tfvars' || basename.includes('.tfstate') ||
      normalized.startsWith('backups/'))) findings.push(`Sensitive path is staged: ${file}`);
    if (normalized.startsWith('.agents/skills/')) findings.push(`Existing local skills must be preserved: ${file}`);
  }
  return findings;
}

export function checkRepository(cwd = process.cwd()) {
  const git = (args) => execFileSync('git', args, { cwd, encoding: 'utf8' });
  const branch = git(['branch', '--show-current']).trim();
  const files = git(['diff', '--cached', '--name-only', '--no-renames', '-z']).split('\0').filter(Boolean);
  return violations(branch, files);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const findings = checkRepository();
  if (findings.length) {
    console.error(findings.join('\n'));
    process.exitCode = 1;
  } else console.log('Homework guard passed: branch and staged paths are allowed.');
}
