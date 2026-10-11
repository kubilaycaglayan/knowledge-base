import assert from "node:assert/strict";
import test from "node:test";
import { decisionNeededOperationsMissingOwner } from "./ototest-api-client-scope.mjs";

const matrix = (state, status = "decision-needed") => `| Verb + composed path | Controller method / inputs | Evidence | State | Evidence status |
| --- | --- | --- | --- | --- |
| GET /api/v1/unused | ExampleController.list | ExampleTest.lists | ${state} | ${status} |
`;

test("accepts a documented client-scope decision with an owner", () => {
  assert.deepEqual(decisionNeededOperationsMissingOwner(matrix(
    "Client scope gap: no supported web or desktop extension caller; Knowledge Base maintainers own the support decision.",
  )), []);
});

test("requires both an explicit client-scope gap and a decision owner", () => {
  assert.deepEqual(decisionNeededOperationsMissingOwner(matrix("Not used by current UI.")), [
    "GET /api/v1/unused: decision-needed operation must explain its missing supported client call site",
    "GET /api/v1/unused: decision-needed operation must name Knowledge Base maintainers as decision owner",
  ]);
});

test("does not apply client-scope decision rules to other classifications", () => {
  assert.deepEqual(decisionNeededOperationsMissingOwner(matrix("API behavior covered.", "covered")), []);
});
