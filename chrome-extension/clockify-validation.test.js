const test = require("node:test");
const assert = require("node:assert/strict");
const { validate } = require("./clockify-validation.js");

test("accepts a bounded Clockify report", () => assert.equal(validate({ timeentries: [{}] }).ok, true));
test("rejects malformed and oversized reports", () => {
  assert.equal(validate(null).ok, false);
  assert.equal(validate({ timeentries: [{ value: "x".repeat(2_100_000) }] }).ok, false);
});
