import assert from "node:assert/strict";
import test from "node:test";
import { extensionPermissionDrift } from "./check-ototest-extension-permissions.mjs";

const manifest = {
  permissions: ["storage", "identity"],
  host_permissions: ["http://localhost:8080/*", "https://app.clockify.me/reports/detailed*"],
};

const matrix = `**Inventory owner:** Knowledge Base maintainers
**Build job:** verify / web-and-extension
| Entry point / capability | Source and permission | Product behavior / evidence | Surface classification and gap | Evidence status |
| --- | --- | --- | --- | --- |
| \`storage\` permission | WXT generated manifest | Persists preferences; if permission is denied, settings and timer state cannot persist. | Covered | covered |
| \`identity\` permission | WXT generated manifest | Google sign-in; if denied, Google sign-in is unavailable. | Gap | gap |
| API host permission | WXT generated manifest | API calls; if denied, extension cannot read or change Knowledge Base data. | Gap | gap |
| Clockify host permission | WXT generated manifest | Clockify import; if denied, Clockify reports cannot be read. | Manual | manual |
`;

test("matches all declared permissions to rows that explain denied behavior", () => {
  assert.deepEqual(extensionPermissionDrift(manifest, matrix), []);
});

test("reports newly declared permissions and missing denial outcomes", () => {
  const changed = { ...manifest, permissions: [...manifest.permissions, "notifications"] };
  const incomplete = matrix.replace("if denied, Google sign-in is unavailable.", "Google sign-in requires identity.");
  assert.deepEqual(extensionPermissionDrift(changed, incomplete), [
    "`identity` permission: behavior when permission is denied or absent must be stated",
    "missing matrix row: `notifications` permission (notifications)",
  ]);
});

test("reports stale manifest permission rows", () => {
  const stale = matrix.replace("| \\`identity\\` permission", "| Future permission");
  assert.ok(extensionPermissionDrift({ permissions: ["storage"], host_permissions: manifest.host_permissions }, stale)
    .includes("matrix permission has no generated manifest declaration: `identity` permission"));
});
