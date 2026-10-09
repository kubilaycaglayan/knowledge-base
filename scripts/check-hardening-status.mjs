import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const summaryPlan = read("../harden-tests/plan.md");
const milestoneIndex = read("../harden-tests/milestones/README.md");

const milestones = [
  ["HARD-01", "01-browser-journeys"],
  ["HARD-02", "02-browser-resilience"],
  ["HARD-03", "03-postgres-and-boundaries"],
  ["HARD-04", "04-rate-limits-and-security"],
  ["HARD-05", "05-performance-baselines"],
  ["HARD-06", "06-ios-validation"],
  ["HARD-07", "07-run-evidence-and-plan-hygiene"],
];

function statusFrom(text, pattern, description) {
  const match = text.match(pattern);
  assert.ok(match, `Missing milestone status in ${description}`);
  return match[1].trim();
}

for (const [id, file] of milestones) {
  const milestone = read(`../harden-tests/milestones/${file}.md`);
  const checklist = read(`../harden-tests/milestones/${id.slice(-2)}-acceptance-checklist.md`);
  const indexStatus = statusFrom(
    milestoneIndex,
    new RegExp(`^\\| \\[${id}\\]\\([^)]*\\) \\|[^\\n]*\\| ([^|]+) \\|$`, "m"),
    "harden-tests/milestones/README.md",
  );
  const planStatus = statusFrom(
    summaryPlan,
    new RegExp(`^\\| ${id} — [^|]+ \\| ([^|]+) \\|$`, "m"),
    "harden-tests/plan.md",
  );
  const milestoneStatus = statusFrom(milestone, /^\*\*Status:\*\*\s*(.+)$/m, `${file}.md`);
  const checklistStatus = statusFrom(checklist, /^\*\*Status:\*\*\s*(.+)$/m, `${id} acceptance checklist`);
  assert.equal(indexStatus, planStatus, `${id} status differs between milestone index and summary plan`);
  assert.equal(indexStatus, milestoneStatus, `${id} status differs between milestone index and milestone document`);
  assert.equal(indexStatus, checklistStatus, `${id} status differs between milestone index and acceptance checklist`);
}

assert.match(read("../harden-tests/README.md"), /\[current plan\]\(plan\.md\)/, "hardening index must link the current plan");
assert.match(read("../docs/test-hardening-plan.md"), /historical[\s\S]*harden-tests\/plan\.md/i, "legacy plan must identify its historical scope and link the current plan");

console.log("Hardening milestone statuses and plan links are synchronized.");
