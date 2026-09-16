const test = require("node:test");
const assert = require("node:assert/strict");
const { normalize } = require("./api-config.js");

test("normalizes a valid API URL", () =>
  assert.equal(
    normalize("https://know.example/api/v1/"),
    "https://know.example/api/v1",
  ));
test("rejects credentials, query strings, and wrong paths", () => {
  assert.throws(() => normalize("https://user:pass@know.example/api/v1"));
  assert.throws(() => normalize("https://know.example/api/v1?debug=1"));
  assert.throws(() => normalize("https://know.example/"));
});
