import assert from "node:assert/strict";
import test from "node:test";
import { sourceDrift } from "./check-ototest-source-drift.mjs";

const apiMatrix = `| Verb + composed path | Source | Evidence | Result | Status |\n| --- | --- | --- | --- | --- |\n| GET \`/api/v1/paths\` | PathController | PathApiTest.readsOwnedPaths | owned paths | covered |`;
const routeMatrix = `| Route / state | Source | Evidence | Class | Status | Gap |\n| --- | --- | --- | --- | --- | --- |\n| \`/paths\` | main.ts | Path view test | browser | covered | none |\n| Unknown URL fallback | main.ts | NotFound test | browser | covered | none |`;

test("accepts matching API path aliases and registered routes", () => {
  const apiMatrixWithAliases = `${apiMatrix}\n| POST \`/api/v1/timers/stop\` | TimerController | TimerApiTest.stopsCurrent | stops | covered |\n| POST \`/api/v1/timers/{id}/stop\` | TimerController | TimerApiTest.stopsById | stops | covered |`;
  const drift = sourceDrift(
    { paths: { "/api/v1/paths": { get: {}, head: {} }, "/api/v1/timers/stop": { post: {} }, "/api/v1/timers/{id}/stop": { post: {} } } },
    apiMatrixWithAliases,
    `const routes = [{ path: "/paths" }, { path: "/:pathMatch(.*)*" }];`,
    routeMatrix,
  );
  assert.deepEqual(drift, { apiMissing: [], apiExtra: [], routeMissing: [], routeExtra: [] });
});

test("reports API and route drift in both directions", () => {
  const drift = sourceDrift(
    { paths: { "/api/v1/paths": { get: {} }, "/api/v1/notes": { post: {} } } },
    apiMatrix,
    `const routes = [{ path: "/paths" }, { path: "/notes" }];`,
    routeMatrix,
  );
  assert.deepEqual(drift, {
    apiMissing: ["POST /api/v1/notes"],
    apiExtra: [],
    routeMissing: ["/notes"],
    routeExtra: [],
  });
});

test("reports inventory entries absent from the source of truth", () => {
  const drift = sourceDrift(
    { paths: { "/api/v1/paths": { get: {} } } },
    `${apiMatrix}\n| DELETE \`/api/v1/paths/{id}\` | PathController | PathApiTest.deletesPath | deleted | covered |`,
    `const routes = [{ path: "/paths" }];`,
    `${routeMatrix}\n| \`/notes\` | main.ts | Notes test | browser | gap | unverified |`,
  );
  assert.deepEqual(drift, {
    apiMissing: [],
    apiExtra: ["DELETE /api/v1/paths/{id}"],
    routeMissing: [],
    routeExtra: ["/notes"],
  });
});

test("allows retired routes only when explicitly classified unsupported", () => {
  const drift = sourceDrift(
    { paths: { "/api/v1/paths": { get: {} } } },
    apiMatrix,
    `const routes = [{ path: "/paths" }];`,
    `${routeMatrix}\n| \`/retired\` | main.ts | historical row | excluded | unsupported/excluded | retired |`,
  );
  assert.deepEqual(drift, { apiMissing: [], apiExtra: [], routeMissing: [], routeExtra: [] });
});
