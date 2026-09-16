const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync(
  require.resolve("./clockify-settings.js"),
  "utf8",
);
const context = { globalThis: {} };
vm.runInNewContext(source, context);

test("keeps Clockify import enabled by default and only disables on false", () => {
  const settings = context.globalThis.KnowClockifySettings;
  assert.equal(settings.KEY, "clockifyImportEnabled");
  assert.equal(settings.isEnabled(undefined), true);
  assert.equal(settings.isEnabled(true), true);
  assert.equal(settings.isEnabled(false), false);
});
