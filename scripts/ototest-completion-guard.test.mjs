import assert from "node:assert/strict";
import test from "node:test";
import { completionGuardProblems } from "./ototest-completion-guard.mjs";

const passingRun = "| Hosted verify | [run](https://github.com/example/knowledge-base/actions/runs/123) | Pass |";

test("does not apply completion requirements while OTOTEST-05 is in progress", () => {
  assert.deepEqual(completionGuardProblems({
    status: "In progress",
    checklist: "- [ ] Physical Android acceptance",
    runRecord: "",
  }), []);
});

test("rejects completion while any acceptance item remains unchecked", () => {
  const problems = completionGuardProblems({
    status: "Complete",
    checklist: "- [x] Inventory reviewed\n- [ ] Physical Android acceptance",
    runRecord: passingRun,
  });

  assert.equal(problems.length, 1);
  assert.match(problems[0], /1 unchecked acceptance item/);
});

test("requires a linked passing hosted run for completion", () => {
  const problems = completionGuardProblems({
    status: "Complete",
    checklist: "- [x] All acceptance items",
    runRecord: "No hosted run recorded",
  });

  assert.equal(problems.length, 1);
  assert.match(problems[0], /passing hosted run linked/);
});

test("accepts a fully checked milestone with passing hosted evidence", () => {
  assert.deepEqual(completionGuardProblems({
    status: "Complete",
    checklist: "- [x] Inventory reviewed\n- [x] Browser gates passed",
    runRecord: passingRun,
  }), []);
});
