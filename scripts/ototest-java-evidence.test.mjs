import assert from "node:assert/strict";
import test from "node:test";
import { qualifiedJavaEvidenceReferences } from "./ototest-java-evidence.mjs";

test("extracts qualified Java test method references", () => {
  assert.deepEqual(qualifiedJavaEvidenceReferences([
    "`PathAuthorizationApiTest.pathNamesAreValidatedBeforePersistence`",
    "`TimerPauseIntegrationTest.postgresCancelFailureRollsBackDraft`",
  ].join("; ")), [
    { className: "PathAuthorizationApiTest", methodName: "pathNamesAreValidatedBeforePersistence" },
    { className: "TimerPauseIntegrationTest", methodName: "postgresCancelFailureRollsBackDraft" },
  ]);
});

test("does not treat a Java test filename by itself as a method reference", () => {
  assert.deepEqual(qualifiedJavaEvidenceReferences("PathAuthorizationApiTest.java"), []);
});
