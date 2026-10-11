import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { completionGuardProblems } from "./ototest-completion-guard.mjs";
import { invalidEvidenceStatuses, unresolvedAcceptanceReferences } from "./ototest-browser-evidence.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inventoryRoot = path.join(repositoryRoot, "docs/ototest");
const inventoryFiles = fs
  .readdirSync(inventoryRoot)
  .filter((name) => name.endsWith(".md"));
const missing = [];
const problems = [];

function readTable(filename, headerText) {
  const lines = fs.readFileSync(path.join(inventoryRoot, filename), "utf8").split("\n");
  const headerIndex = lines.findIndex((line) => line.includes(headerText));
  assert.notEqual(headerIndex, -1, `${filename}: missing table header ${headerText}`);
  const tableLines = [];
  for (let index = headerIndex; index < lines.length && lines[index].startsWith("|"); index += 1) {
    tableLines.push(lines[index]);
  }
  return tableLines.slice(2).map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));
}

function readControlEvidenceRows() {
  const lines = fs.readFileSync(path.join(inventoryRoot, "01-control-matrix.md"), "utf8").split("\n");
  const rows = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].startsWith("|")) continue;
    const headings = lines[index].split("|").slice(1, -1).map((cell) => cell.trim());
    const evidenceIndex = headings.findIndex((heading) => [
      "Evidence candidate",
      "Existing named assertion and evidence class",
      "Existing evidence and exact assertion",
      "Applicable source/evidence inventory",
    ].includes(heading));
    if (evidenceIndex < 0) continue;

    for (let rowIndex = index + 2; rowIndex < lines.length && lines[rowIndex].startsWith("|"); rowIndex += 1) {
      const cells = lines[rowIndex].split("|").slice(1, -1).map((cell) => cell.trim());
      if (cells.every((cell) => /^-+$/.test(cell))) continue;
      rows.push({ cells, evidenceIndex, row: rows.length + 1, document: "01-control-matrix.md" });
      index = rowIndex;
    }
  }
  return rows;
}

const routeEvidenceRows = readTable("01-route-matrix.md", "| Route / state |").map((cells, index) => ({
  cells,
  evidenceIndex: 2,
  row: index + 1,
  document: "01-route-matrix.md",
}));

function findFiles(directory, predicate) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return findFiles(fullPath, predicate);
    return predicate(fullPath) ? [fullPath] : [];
  });
}

function checkTable(filename, headerText, { identityColumn = 0, sourceColumn = 1, classifiedColumn = -1 } = {}) {
  const seen = new Set();
  for (const [index, cells] of readTable(filename, headerText).entries()) {
    const identity = cells[identityColumn];
    const classification = cells.at(classifiedColumn);
    const row = `${filename}:${index + 1}`;
    if (!identity) problems.push(`${row}: missing row identity`);
    else if (seen.has(identity)) problems.push(`${row}: duplicate row identity ${identity}`);
    else seen.add(identity);
    if (!cells[sourceColumn]) problems.push(`${row}: missing source/evidence location`);
    if (!classification) problems.push(`${row}: missing evidence classification`);
  }
}

function checkInventoryOwner(filename) {
  const source = fs.readFileSync(path.join(inventoryRoot, filename), "utf8");
  if (!/^\*\*Inventory owner:\*\*\s+\S/m.test(source)) {
    problems.push(`${filename}: missing inventory owner`);
  }
}

checkTable("01-route-matrix.md", "| Route / state |", { classifiedColumn: 3 });
for (const { row, status } of invalidEvidenceStatuses(readTable("01-route-matrix.md", "| Route / state |"), 4)) {
  problems.push(`01-route-matrix.md:row ${row}: invalid evidence status ${JSON.stringify(status)}`);
}
checkTable("01-api-matrix.md", "| Verb + composed path |", { classifiedColumn: 2 });
checkTable("01-control-matrix.md", "| Checklist IDs |", { classifiedColumn: 5 });
checkTable("01-extension-and-feature-map.md", "| Entry point / capability |", { classifiedColumn: 3 });
checkTable("01-extension-and-feature-map.md", "| Feature domain |", { classifiedColumn: 3 });
for (const filename of ["01-route-matrix.md", "01-api-matrix.md", "01-control-matrix.md", "01-extension-and-feature-map.md"]) {
  checkInventoryOwner(filename);
}

const apiRows = readTable("01-api-matrix.md", "| Verb + composed path |");
const apiTestClasses = new Map();
for (const testFile of findFiles(path.join(repositoryRoot, "backend/src/test/java"), (file) => file.endsWith(".java"))) {
  const className = path.basename(testFile, ".java");
  apiTestClasses.set(className, [...(apiTestClasses.get(className) ?? []), testFile]);
}
const apiEvidenceReferences = new Set();
for (const row of apiRows) {
  for (const [, className, methodName] of row[2].matchAll(/\b([A-Za-z][A-Za-z0-9]*Test)\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
    apiEvidenceReferences.add(`${className}.${methodName}`);
  }
}
for (const reference of apiEvidenceReferences) {
  const [className, methodName] = reference.split(".");
  const classFiles = apiTestClasses.get(className) ?? [];
  if (classFiles.length !== 1) {
    problems.push(`01-api-matrix.md: ${reference} resolves to ${classFiles.length} test classes`);
    continue;
  }
  const source = fs.readFileSync(classFiles[0], "utf8");
  const escapedMethod = methodName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!new RegExp(`(?:void|[\\w<>.?\\[\\]]+)\\s+${escapedMethod}\\s*\\(`).test(source)) {
    problems.push(`01-api-matrix.md: ${reference} does not resolve to a method declaration`);
  }
}

const frontendTestSources = Object.fromEntries(
  ["frontend/src", "frontend/scripts"]
    .flatMap((directory) => findFiles(path.join(repositoryRoot, directory), (file) => /\.(?:test|spec)\.(?:ts|tsx|js|mjs)$/.test(file)))
    .map((file) => [path.basename(file), fs.readFileSync(file, "utf8")]),
);
for (const { document, row, file, reference } of unresolvedAcceptanceReferences(
  [...routeEvidenceRows, ...readControlEvidenceRows()],
  frontendTestSources,
)) {
  problems.push(`${document}:row ${row}: ${file} assertion ${JSON.stringify(reference)} does not resolve`);
}

const milestoneIndex = fs.readFileSync(path.join(inventoryRoot, "README.md"), "utf8");
const roadmap = fs.readFileSync(path.join(inventoryRoot, "roadmap.md"), "utf8");
const milestoneFiles = [
  "01-coverage-inventories.md",
  "02-backend-api-coverage.md",
  "03-web-routes-and-controls.md",
  "04-real-stack-and-extension.md",
  "05-traceability-and-gates.md",
];
for (const [index, filename] of milestoneFiles.entries()) {
  const id = String(index + 1).padStart(2, "0");
  const indexMatch = milestoneIndex.match(new RegExp(`\\| \\[OTOTEST-${id}\\]\\([^)]*\\).*?\\|\\s*(Proposed|In progress|Complete|Blocked|Closed by decision)\\s*\\|`));
  const roadmapMatch = roadmap.match(new RegExp(`^\\| OTOTEST-${id}\\s*\\|.*\\|\\s*(Proposed|In progress|Complete|Blocked|Closed by decision)\\s*\\|$`, "m"));
  const milestone = fs.readFileSync(path.join(inventoryRoot, filename), "utf8");
  const milestoneMatch = milestone.match(/^\*\*Status:\*\*\s*(Proposed|In progress|Complete|Blocked|Closed by decision)\s*$/m);
  const statuses = [indexMatch?.[1], roadmapMatch?.[1], milestoneMatch?.[1]];
  if (statuses.some((status) => status === undefined) || new Set(statuses).size !== 1) {
    problems.push(`OTOTEST-${id}: status differs or is missing across README, roadmap, and ${filename}`);
  }
}
const checklist05 = fs.readFileSync(path.join(inventoryRoot, "05-acceptance-checklist.md"), "utf8");
const checklist05Status = checklist05.match(/^\*\*Status:\*\*\s*(Proposed|In progress|Complete|Blocked|Closed by decision)\s*$/m)?.[1];
const roadmap05Status = roadmap.match(/^\| OTOTEST-05\s*\|.*\|\s*(Proposed|In progress|Complete|Blocked|Closed by decision)\s*\|$/m)?.[1];
if (!checklist05Status || checklist05Status !== roadmap05Status) {
  problems.push("OTOTEST-05: acceptance checklist status differs or is missing compared with roadmap");
}
const runRecord = fs.readFileSync(path.join(inventoryRoot, "runs/2026-10-10-ototest-05-local-gates.md"), "utf8");
problems.push(...completionGuardProblems({ status: checklist05Status, checklist: checklist05, runRecord }));

for (const filename of inventoryFiles) {
  const sourcePath = path.join(inventoryRoot, filename);
  const source = fs.readFileSync(sourcePath, "utf8");
  const markdownLinks = source.matchAll(/(?<!!)\[[^\]]+\]\(([^)]+)\)/g);

  for (const [, rawTarget] of markdownLinks) {
    const target = rawTarget.trim().split(/[?#]/, 1)[0];
    if (!target || /^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith("//")) continue;

    const resolvedTarget = path.resolve(path.dirname(sourcePath), decodeURIComponent(target));
    if (!fs.existsSync(resolvedTarget)) missing.push(`${filename}: ${rawTarget}`);
  }
}

assert.deepEqual(missing, [], `OTOTEST inventory contains stale local links:\n${missing.join("\n")}`);
assert.deepEqual(problems, [], `OTOTEST inventory integrity errors:\n${problems.join("\n")}`);
console.log(`OTOTEST inventory integrity passed (${inventoryFiles.length} documents; ${apiRows.length} API rows; ${apiEvidenceReferences.size} qualified API test references).`);
