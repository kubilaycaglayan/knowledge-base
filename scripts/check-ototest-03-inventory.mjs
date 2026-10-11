import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const acceptance = read("../docs/ototest/01-acceptance-checklist.md");
const matrix = read("../docs/ototest/01-control-matrix.md");

const checklistIds = [...acceptance.matchAll(/\*\*(FLOW-\d{2}\.\d{2})\*\*/g)].map((match) => match[1]);
const matrixRows = [...matrix.matchAll(/^\|\s*(FLOW-\d{2}\.\d{2})\s*\|([^\n]*)$/gm)];
const matrixIds = matrixRows.map((match) => match[1]);

function duplicates(values) {
  const seen = new Set();
  const repeated = new Set();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated].sort();
}

assert.ok(checklistIds.length > 0, "OTOTEST-01 acceptance checklist has FLOW action IDs");
assert.deepEqual(duplicates(checklistIds), [], "FLOW action IDs must be unique in the source checklist");
assert.deepEqual(duplicates(matrixIds), [], "FLOW action IDs must have exactly one control-matrix row");

const checklistSet = new Set(checklistIds);
const matrixSet = new Set(matrixIds);
const missingRows = checklistIds.filter((id) => !matrixSet.has(id));
const untrackedRows = matrixIds.filter((id) => !checklistSet.has(id));
assert.deepEqual(missingRows, [], "Every inventoried FLOW action must have a control-matrix row");
assert.deepEqual(untrackedRows, [], "Every control-matrix FLOW row must trace to a source checklist action");

for (const [, id, cells] of matrixRows) {
  const columns = cells.split("|").slice(0, -1);
  const expectedColumns = id.startsWith("FLOW-10.") && id !== "FLOW-10.06" ? 2 : 3;
  assert.equal(columns.length, expectedColumns, `${id} must use the ${expectedColumns === 2 ? "shared-state" : "action-row"} inventory shape`);
  assert.ok(columns.every((cell) => cell.trim().length > 0), `${id} must not have an empty inventory cell`);
}

console.log(`OTOTEST-03 traceability passes: ${checklistIds.length} unique FLOW actions have one complete control-matrix row each.`);
