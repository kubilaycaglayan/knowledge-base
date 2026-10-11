import assert from "node:assert/strict";
import test from "node:test";
import { publicOperationsMissingRationale } from "./ototest-api-public-status.mjs";

const matrix = (operationRows) => `| Verb + composed path | Controller method / inputs | Evidence | State | Status |
| --- | --- | --- | --- | --- |
${operationRows.join("\n")}
`;

test("accepts public operations that explain their authentication exception", () => {
  assert.deepEqual(publicOperationsMissingRationale(matrix([
    "| GET `/api/v1/auth/google/config` | `AuthController.googleConfig`; public because the sign-in page needs the client ID before a session exists | test | configuration | covered |",
    "| POST `/api/v1/auth/register` | `AuthController.register`; public because new users do not have an authenticated account yet | test | account created | covered |",
  ])), []);
});

test("reports each public operation with no bypass rationale", () => {
  assert.deepEqual(publicOperationsMissingRationale(matrix([
    "| GET `/api/v1/auth/google/config` | `AuthController.googleConfig`; public | test | configuration | covered |",
    "| POST `/api/v1/auth/register` | `AuthController.register`; public because registration issues the first token | test | account created | covered |",
  ])), [
    "GET `/api/v1/auth/google/config`: public API operation must state why authentication is bypassed",
  ]);
});

test("does not treat private operations as public exceptions", () => {
  assert.deepEqual(publicOperationsMissingRationale(matrix([
    "| GET `/api/v1/paths` | `PathController.list`; authenticated owner scope | test | owned paths | covered |",
  ])), []);
});
