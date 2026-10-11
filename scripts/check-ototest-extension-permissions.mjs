import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function permissionRowsFromMatrix(markdown) {
  const header = markdown.split("\n").findIndex((line) => line.includes("| Entry point / capability |"));
  const rows = new Map();
  for (const line of markdown.split("\n").slice(header + 2)) {
    if (!line.startsWith("|")) break;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    const capability = cells[0] ?? "";
    if (/permission/i.test(capability)) rows.set(capability, cells);
  }
  return rows;
}

export function extensionPermissionDrift(manifest, matrix) {
  const rows = permissionRowsFromMatrix(matrix);
  const errors = [];
  if (!matrix.includes("**Inventory owner:** Knowledge Base maintainers")) {
    errors.push("extension matrix must identify Knowledge Base maintainers as the permission review owner");
  }
  if (!matrix.includes("verify / web-and-extension")) {
    errors.push("extension matrix must identify the build and verification job");
  }
  const declaredPermissions = (manifest.permissions ?? []).map((permission) => [`\`${permission}\` permission`, permission]);
  const hostPermissions = manifest.host_permissions ?? [];
  const declaredHosts = hostPermissions.map((host) => [
    host.includes("app.clockify.me") ? "Clockify host permission" : "API host permission",
    host,
  ]);
  if (hostPermissions.filter((host) => host.includes("app.clockify.me")).length !== 1
    || hostPermissions.filter((host) => !host.includes("app.clockify.me")).length !== 1) {
    errors.push("host permissions must map to one API host row and one Clockify host row; classify each additional host explicitly");
  }

  for (const [rowName, sourceValue] of [...declaredPermissions, ...declaredHosts]) {
    const row = rows.get(rowName);
    if (!row) {
      errors.push(`missing matrix row: ${rowName} (${sourceValue})`);
      continue;
    }
    if (!row[1]?.toLowerCase().includes("manifest")) {
      errors.push(`${rowName}: source must identify the generated manifest`);
    }
    if (!/denied|absent|not granted/i.test(row[2] ?? "")) {
      errors.push(`${rowName}: behavior when permission is denied or absent must be stated`);
    }
  }

  for (const rowName of rows.keys()) {
    const permissionName = rowName.match(/^`([^`]+)` permission$/)?.[1];
    const source = permissionName
      ? (manifest.permissions ?? []).includes(permissionName)
      : rowName === "API host permission"
        ? declaredHosts.some(([name]) => name === rowName)
        : rowName === "Clockify host permission"
          ? declaredHosts.some(([name]) => name === rowName)
          : true;
    if (!source) errors.push(`matrix permission has no generated manifest declaration: ${rowName}`);
  }
  return errors.sort();
}

async function main() {
  const manifestPath = path.resolve(process.argv[2] ?? "");
  assert.ok(process.argv[2], "Usage: node scripts/check-ototest-extension-permissions.mjs <built-manifest.json>");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const matrix = fs.readFileSync(path.join(repositoryRoot, "docs/ototest/01-extension-and-feature-map.md"), "utf8");
  const errors = extensionPermissionDrift(manifest, matrix);
  assert.deepEqual(errors, [], `OTOTEST extension permission drift:\n${errors.join("\n")}`);
  console.log(`OTOTEST extension matrix matches ${manifest.permissions?.length ?? 0} permissions and ${manifest.host_permissions?.length ?? 0} host permissions.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
