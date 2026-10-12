import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const allowlistPath = join(root, "scripts/test-timing-allowlist.json");

function filesBelow(directory, predicate) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return filesBelow(path, predicate);
    return predicate(path) ? [path] : [];
  });
}

function normalizeExpression(expression) {
  return expression.replace(/\s+/g, " ").trim();
}

function findMatches(source, kind) {
  const matches = [];
  const pattern =
    kind === "real-timer"
      ? /setTimeout\s*\(\s*resolve\s*,\s*([^)]+)\)/g
      : /waitForTimeout\s*\(\s*(\d+(?:\.\d+)?)\s*\)/g;
  for (const match of source.matchAll(pattern)) {
    if (kind === "browser-wait" && Number(match[1]) <= 100) continue;
    matches.push({
      expression: normalizeExpression(match[0]),
      line: source.slice(0, match.index).split("\n").length,
    });
  }
  return matches;
}

export function timingViolations({ files, allowlist }) {
  const violations = [];
  for (const file of files) {
    const entries = allowlist[file.path] ?? [];
    const byExpression = new Map(entries.map((entry) => [entry.expression, entry]));
    const counts = new Map();
    for (const match of findMatches(file.content, file.kind)) {
      const entry = byExpression.get(match.expression);
      const count = (counts.get(match.expression) ?? 0) + 1;
      counts.set(match.expression, count);
      if (!entry) {
        violations.push(`${file.path}:${match.line}: unapproved ${match.expression}`);
      } else if (!entry.reason?.trim()) {
        violations.push(`${file.path}: allowlist reason is required for ${entry.expression}`);
      } else if (count > entry.count) {
        violations.push(
          `${file.path}:${match.line}: ${match.expression} occurs ${count} times; allowlist permits ${entry.count}`,
        );
      }
    }
    for (const entry of entries) {
      if (!entry.reason?.trim()) {
        violations.push(`${file.path}: allowlist reason is required for ${entry.expression}`);
      }
    }
  }
  return violations;
}

function main() {
  const allowlist = JSON.parse(readFileSync(allowlistPath, "utf8"));
  const sourceFiles = filesBelow(join(root, "frontend/src"), (path) => path.endsWith(".test.ts"));
  const browserFiles = [
    join(root, "frontend/scripts/board.acceptance.test.mjs"),
    join(root, "frontend/scripts/nav-shell.acceptance.test.mjs"),
  ];
  const files = [
    ...sourceFiles.map((path) => ({
      path: relative(root, path),
      content: readFileSync(path, "utf8"),
      kind: "real-timer",
    })),
    ...browserFiles.map((path) => ({
      path: relative(root, path),
      content: readFileSync(path, "utf8"),
      kind: "browser-wait",
    })),
  ];
  const violations = timingViolations({ files, allowlist });
  if (violations.length) {
    console.error("Test timing guard failed:");
    for (const violation of violations) console.error(`- ${violation}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `Test timing guard passed (${sourceFiles.length} component test files; browser waits over 100 ms checked)`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
