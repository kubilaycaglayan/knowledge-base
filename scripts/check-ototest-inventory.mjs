import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { completionGuardProblems } from "./ototest-completion-guard.mjs";
import { apiRowsMissingNamedEvidence, coveredMutationReferenceClaimsMissingOwnership, coveredRecordReadClaimsMissingOutcomes, coveredStateClaimsMissingLayer, invalidEvidenceStatuses, rowsMissingNamedAssertions, unresolvedAcceptanceReferences } from "./ototest-browser-evidence.mjs";
import { missingInventoryMetadata } from "./ototest-inventory-metadata.mjs";
import { qualifiedJavaEvidenceReferences } from "./ototest-java-evidence.mjs";
import { manualRowsMissingProcedureLink } from "./ototest-manual-evidence.mjs";

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

function readControlStatusRows() {
  const lines = fs.readFileSync(path.join(inventoryRoot, "01-control-matrix.md"), "utf8").split("\n");
  const rows = [];
  const identities = new Set();
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].startsWith("| Checklist ID |")) continue;
    const headings = lines[index].split("|").slice(1, -1).map((cell) => cell.trim());
    const statusIndex = headings.indexOf("Evidence status");
    const evidenceIndex = headings.findIndex((heading) => [
      "Evidence candidate",
      "Existing named assertion and evidence class",
      "Existing evidence and exact assertion",
      "Applicable source/evidence inventory",
    ].includes(heading));
    if (statusIndex < 0) {
      problems.push(`01-control-matrix.md:table at line ${index + 1}: missing Evidence status column`);
      continue;
    }
    if (!/^-+$/.test(lines[index + 1]?.split("|").slice(1, -1)[statusIndex]?.trim() ?? "")) {
      problems.push(`01-control-matrix.md:table at line ${index + 1}: Evidence status column is missing from the separator`);
      continue;
    }
    for (let rowIndex = index + 2; rowIndex < lines.length && lines[rowIndex].startsWith("|"); rowIndex += 1) {
      const cells = lines[rowIndex].split("|").slice(1, -1).map((cell) => cell.trim());
      if (cells.every((cell) => /^-+$/.test(cell))) continue;
      if (cells.length !== headings.length) {
        problems.push(`01-control-matrix.md:row ${rows.length + 1}: expected ${headings.length} cells, found ${cells.length}`);
      }
      const identity = cells[0] ?? "";
      if (!identity) problems.push(`01-control-matrix.md:row ${rows.length + 1}: missing checklist ID`);
      else if (identities.has(identity)) problems.push(`01-control-matrix.md:row ${rows.length + 1}: duplicate checklist ID ${identity}`);
      else identities.add(identity);
      if (!cells[1]) problems.push(`01-control-matrix.md:row ${rows.length + 1}: missing source and expected behavior`);
      rows.push({ cells, statusIndex, evidenceIndex, row: rows.length + 1 });
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

function checkInventoryMetadata(filename) {
  const source = fs.readFileSync(path.join(inventoryRoot, filename), "utf8");
  for (const missingField of missingInventoryMetadata(source)) {
    problems.push(`${filename}: missing ${missingField}`);
  }
}

checkTable("01-route-matrix.md", "| Route / state |", { classifiedColumn: 3 });
for (const { row, status } of invalidEvidenceStatuses(readTable("01-route-matrix.md", "| Route / state |"), 4)) {
  problems.push(`01-route-matrix.md:row ${row}: invalid evidence status ${JSON.stringify(status)}`);
}
checkTable("01-api-matrix.md", "| Verb + composed path |", { classifiedColumn: 2 });
for (const { row, status } of invalidEvidenceStatuses(readTable("01-api-matrix.md", "| Verb + composed path |"), 4)) {
  problems.push(`01-api-matrix.md:row ${row}: invalid evidence status ${JSON.stringify(status)}`);
}
checkTable("01-control-matrix.md", "| Checklist IDs |", { classifiedColumn: 5 });
for (const { row, status } of invalidEvidenceStatuses(readTable("01-control-matrix.md", "| Checklist IDs |"), 6)) {
  problems.push(`01-control-matrix.md:family row ${row}: invalid evidence status ${JSON.stringify(status)}`);
}
for (const { row, cells, statusIndex } of readControlStatusRows()) {
  const [invalid] = invalidEvidenceStatuses([cells], statusIndex);
  if (invalid) problems.push(`01-control-matrix.md:action row ${row} ${cells[0]}: invalid evidence status ${JSON.stringify(invalid.status)}`);
}
checkTable("01-extension-and-feature-map.md", "| Entry point / capability |", { classifiedColumn: 3 });
checkTable("01-extension-and-feature-map.md", "| Feature domain |", { classifiedColumn: 3 });
for (const [header, statusIndex, label] of [
  ["| Entry point / capability |", 4, "entrypoint"],
  ["| Feature domain |", 5, "feature domain"],
  ["| Journey | Ordered transitions and shared operation |", 4, "cross-client journey"],
]) {
  for (const { row, status } of invalidEvidenceStatuses(readTable("01-extension-and-feature-map.md", header), statusIndex)) {
    problems.push(`01-extension-and-feature-map.md:${label} row ${row}: invalid evidence status ${JSON.stringify(status)}`);
  }
}
checkTable("01-extension-and-feature-map.md", "| Journey | Ordered transitions and shared operation |", { classifiedColumn: 3 });
for (const { row, status } of invalidEvidenceStatuses(readTable("01-extension-and-feature-map.md", "| Affected scope |"), 4)) {
  problems.push(`01-extension-and-feature-map.md:support-decision row ${row}: invalid evidence status ${JSON.stringify(status)}`);
}
checkTable("01-extension-and-feature-map.md", "| Affected scope |", { classifiedColumn: 3 });
for (const filename of ["01-route-matrix.md", "01-api-matrix.md", "01-control-matrix.md", "01-extension-and-feature-map.md"]) {
  checkInventoryMetadata(filename);
}

const apiRows = readTable("01-api-matrix.md", "| Verb + composed path |");
for (const { row, operation } of apiRowsMissingNamedEvidence(apiRows)) {
  problems.push(`01-api-matrix.md:row ${row} ${operation}: missing a qualified Java test assertion reference`);
}
const apiTestClasses = new Map();
for (const testFile of findFiles(path.join(repositoryRoot, "backend/src/test/java"), (file) => file.endsWith(".java"))) {
  const className = path.basename(testFile, ".java");
  apiTestClasses.set(className, [...(apiTestClasses.get(className) ?? []), testFile]);
}
const controlEvidenceRows = readControlEvidenceRows();
const extensionRows = readTable("01-extension-and-feature-map.md", "| Entry point / capability |");
const apiEvidenceReferences = new Set(apiRows.flatMap((row) =>
  qualifiedJavaEvidenceReferences(row[2]).map(({ className, methodName }) => `${className}.${methodName}`)));
const controlEvidenceReferences = new Set(controlEvidenceRows.flatMap(({ cells, evidenceIndex }) =>
  qualifiedJavaEvidenceReferences(cells[evidenceIndex] ?? "")
    .map(({ className, methodName }) => `${className}.${methodName}`)));
for (const reference of new Set([...apiEvidenceReferences, ...controlEvidenceReferences])) {
  const [className, methodName] = reference.split(".");
  const classFiles = apiTestClasses.get(className) ?? [];
  if (classFiles.length !== 1) {
    problems.push(`Java evidence: ${reference} resolves to ${classFiles.length} test classes`);
    continue;
  }
  const source = fs.readFileSync(classFiles[0], "utf8");
  const escapedMethod = methodName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!new RegExp(`(?:void|[\\w<>.?\\[\\]]+)\\s+${escapedMethod}\\s*\\(`).test(source)) {
    problems.push(`Java evidence: ${reference} does not resolve to a method declaration`);
  }
}

const frontendTestSources = Object.fromEntries(
  ["frontend/src", "frontend/scripts", "chrome-extension"]
    .flatMap((directory) => findFiles(path.join(repositoryRoot, directory), (file) => /\.(?:test|spec)\.(?:ts|tsx|js|mjs)$/.test(file)))
    .map((file) => [path.basename(file), fs.readFileSync(file, "utf8")]),
);
for (const { document, row, file, reference } of unresolvedAcceptanceReferences(
  [...routeEvidenceRows, ...controlEvidenceRows, ...extensionRows.map((cells, index) => ({ cells, evidenceIndex: 2, row: index + 1, document: "01-extension-and-feature-map.md" }))],
  frontendTestSources,
)) {
  problems.push(`${document}:row ${row}: ${file} assertion ${JSON.stringify(reference)} does not resolve`);
}

for (const [filename, rows, evidenceIndex, statusIndex] of [
  ["01-route-matrix.md", readTable("01-route-matrix.md", "| Route / state |"), 2, 4],
  ["01-api-matrix.md", apiRows, 2, 4],
  ["01-control-matrix.md", readTable("01-control-matrix.md", "| Checklist IDs |"), 3, 6],
  ["01-extension-and-feature-map.md", extensionRows, 2, 4],
]) {
  for (const { row, identity } of rowsMissingNamedAssertions(rows, evidenceIndex, statusIndex)) {
    problems.push(`${filename}:row ${row} ${identity}: covered evidence must name a test assertion`);
  }
}
for (const { row, cells, evidenceIndex, statusIndex } of readControlStatusRows()) {
  if (evidenceIndex < 0) continue;
  for (const missingAssertion of rowsMissingNamedAssertions([cells], evidenceIndex, statusIndex)) {
    problems.push(`01-control-matrix.md:action row ${row} ${missingAssertion.identity}: covered evidence must name a test assertion`);
  }
}

for (const { row, identity } of coveredMutationReferenceClaimsMissingOwnership(apiRows, 0, 1, 3, 4)) {
  problems.push(`01-api-matrix.md:row ${row} ${identity}: covered mutations with referenced record IDs must state their ownership outcome`);
}
for (const { row, identity } of coveredRecordReadClaimsMissingOutcomes(apiRows, 0, 3, 4)) {
  problems.push(`01-api-matrix.md:row ${row} ${identity}: covered ID reads must state owned, missing, and foreign-ID outcomes`);
}

for (const [filename, rows, evidenceIndex, claimIndex, statusIndex] of [
  ["01-route-matrix.md", readTable("01-route-matrix.md", "| Route / state |"), 2, 5, 4],
  ["01-api-matrix.md", apiRows, 2, 3, 4],
  ["01-extension-and-feature-map.md", extensionRows, 2, 2, 4],
]) {
  for (const { row, identity } of coveredStateClaimsMissingLayer(rows, evidenceIndex, claimIndex, statusIndex)) {
    problems.push(`${filename}:row ${row} ${identity}: persistence and ownership claims must cite an integration evidence layer`);
  }
}
for (const { row, cells, evidenceIndex, statusIndex } of readControlStatusRows()) {
  if (evidenceIndex < 0) continue;
  for (const missingLayer of coveredStateClaimsMissingLayer([cells], evidenceIndex, 3, statusIndex)) {
    problems.push(`01-control-matrix.md:action row ${row} ${missingLayer.identity}: persistence and ownership claims must cite an integration evidence layer`);
  }
}

for (const [filename, header, statusIndex] of [
  ["01-route-matrix.md", "| Route / state |", 4],
  ["01-api-matrix.md", "| Verb + composed path |", 4],
  ["01-control-matrix.md", "| Checklist IDs |", 6],
  ["01-extension-and-feature-map.md", "| Entry point / capability |", 4],
  ["01-extension-and-feature-map.md", "| Feature domain |", 5],
  ["01-extension-and-feature-map.md", "| Journey | Ordered transitions and shared operation |", 4],
  ["01-extension-and-feature-map.md", "| Affected scope |", 4],
]) {
  for (const { row, identity } of manualRowsMissingProcedureLink(readTable(filename, header), statusIndex)) {
    problems.push(`${filename}:row ${row} ${identity}: manual evidence has no linked procedure`);
  }
}
for (const { row, cells, statusIndex } of readControlStatusRows()) {
  for (const missingProcedure of manualRowsMissingProcedureLink([cells], statusIndex)) {
    problems.push(`01-control-matrix.md:action row ${row} ${missingProcedure.identity}: manual evidence has no linked procedure`);
  }
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
