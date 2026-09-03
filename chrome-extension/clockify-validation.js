(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.KnowClockifyValidation = api;
})(typeof globalThis === "undefined" ? this : globalThis, function () {
  const MAX_BYTES = 2_000_000;
  const MAX_ENTRIES = 2_000;

  function validate(payload) {
    if (!payload || !Array.isArray(payload.timeentries) || payload.timeentries.length > MAX_ENTRIES)
      return { ok: false, error: "Clockify report is invalid or too large." };
    let bytes;
    try { bytes = new TextEncoder().encode(JSON.stringify(payload)).byteLength; } catch { return { ok: false, error: "Clockify report is invalid." }; }
    if (bytes > MAX_BYTES) return { ok: false, error: "Clockify report is too large." };
    if (payload.timeentries.some((entry) => !entry || typeof entry !== "object" || Array.isArray(entry)))
      return { ok: false, error: "Clockify report contains an invalid entry." };
    return { ok: true };
  }

  return { validate };
});
