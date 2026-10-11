import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function apiOperationsFromOpenApi(spec) {
  return new Set(Object.entries(spec.paths ?? {}).flatMap(([route, operations]) =>
    Object.keys(operations ?? {})
      .filter((method) => ["get", "post", "put", "patch", "delete"].includes(method.toLowerCase()))
      .map((method) => `${method.toUpperCase()} ${route}`)));
}

export function apiOperationsFromMatrix(markdown) {
  const table = markdown.split("\n").slice(markdown.split("\n").findIndex((line) =>
    line.includes("| Verb + composed path |")) + 2);
  const rows = new Map();
  for (const line of table) {
    if (!line.startsWith("|")) break;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    const firstCell = cells[0] ?? "";
    const match = firstCell.match(/^(GET|POST|PUT|PATCH|DELETE) `([^`]+)`/);
    if (match) rows.set(`${match[1]} ${match[2]}`, cells.at(-1) ?? "");
  }
  return rows;
}

export function routePatternsFromSource(source) {
  return new Set([...source.matchAll(/\bpath\s*:\s*["']([^"']+)["']/g)].map((match) => match[1]));
}

export function routePatternsFromMatrix(markdown) {
  const header = markdown.split("\n").findIndex((line) => line.includes("| Route / state |"));
  const routes = new Map();
  for (const line of markdown.split("\n").slice(header + 2)) {
    if (!line.startsWith("|")) break;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    const route = cells[0]?.match(/^`([^`]+)`/)?.[1];
    if (route) routes.set(route, cells[4] ?? "");
    else if (cells[0]?.includes("Unknown URL fallback")) routes.set(":unknown-fallback:", cells[4] ?? "");
  }
  return routes;
}

export function sourceDrift(openApi, apiMatrix, routeSource, routeMatrix) {
  const sourceOperations = apiOperationsFromOpenApi(openApi);
  const inventoryOperations = apiOperationsFromMatrix(apiMatrix);
  const sourceRoutes = routePatternsFromSource(routeSource);
  const inventoryRoutes = routePatternsFromMatrix(routeMatrix);
  const fallback = [...sourceRoutes].find((route) => route.includes("pathMatch"));
  if (fallback && inventoryRoutes.has(":unknown-fallback:")) inventoryRoutes.set(fallback, inventoryRoutes.get(":unknown-fallback:"));
  return {
    apiMissing: [...sourceOperations].filter((item) => !inventoryOperations.has(item)).sort(),
    apiExtra: [...inventoryOperations].filter(([item, status]) => !sourceOperations.has(item) && status !== "unsupported/excluded").map(([item]) => item).sort(),
    routeMissing: [...sourceRoutes].filter((item) => !inventoryRoutes.has(item)).sort(),
    routeExtra: [...inventoryRoutes].filter(([item, status]) => !sourceRoutes.has(item) && item !== ":unknown-fallback:" && status !== "unsupported/excluded").map(([item]) => item).sort(),
  };
}

async function main() {
  let spec;
  if (process.argv.includes("--openapi-stdin")) {
    spec = JSON.parse(fs.readFileSync(0, "utf8"));
  } else {
    const apiPort = process.env.API_DEV_PORT || "8080";
    const openApiUrl = process.env.OTOTEST_OPENAPI_URL || `http://127.0.0.1:${apiPort}/v3/api-docs`;
    const response = await fetch(openApiUrl);
    assert.equal(response.ok, true, `OpenAPI request failed with HTTP ${response.status}`);
    spec = await response.json();
  }
  const result = sourceDrift(
    spec,
    fs.readFileSync(path.join(repositoryRoot, "docs/ototest/01-api-matrix.md"), "utf8"),
    fs.readFileSync(path.join(repositoryRoot, "frontend/src/main.ts"), "utf8"),
    fs.readFileSync(path.join(repositoryRoot, "docs/ototest/01-route-matrix.md"), "utf8"),
  );
  const errors = Object.entries(result).flatMap(([kind, entries]) => entries.map((entry) => `${kind}: ${entry}`));
  assert.deepEqual(errors, [], `OTOTEST source inventory drift:\n${errors.join("\n")}`);
  console.log(`OTOTEST source inventory matches ${apiOperationsFromOpenApi(spec).size} API operations and ${routePatternsFromSource(fs.readFileSync(path.join(repositoryRoot, "frontend/src/main.ts"), "utf8")).size} frontend routes.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
