(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.KnowApiConfig = api;
})(typeof globalThis === "undefined" ? this : globalThis, function () {
  const compiledApiBase = typeof __KNOW_API_BASE__ === "string" ? __KNOW_API_BASE__ : "";
  const isProduction = typeof __KNOW_EXTENSION_ENV__ === "string"
    && __KNOW_EXTENSION_ENV__ === "production";
  const developmentApiBase = "http://localhost:8080/api/v1";

  function normalize(value) {
    const url = new URL(String(value || "").trim());
    if (!url.pathname.replace(/\/$/, "").endsWith("/api/v1") || url.search || url.hash)
      throw Error("API URL must end in /api/v1");
    if (url.username || url.password || !["http:", "https:"].includes(url.protocol))
      throw Error("API URL must use HTTP(S) without credentials");
    if (isProduction && url.protocol !== "https:")
      throw Error("Production API URL must use HTTPS");
    const normalized = url.toString().replace(/\/$/, "");
    if (isProduction && compiledApiBase && normalized !== normalizeCompiled())
      throw Error("This production build is locked to its configured API");
    return normalized;
  }

  function normalizeCompiled() {
    const url = new URL(compiledApiBase);
    return url.toString().replace(/\/$/, "");
  }

  function apiBase(stored) {
    return normalize(compiledApiBase || stored || developmentApiBase);
  }

  return { apiBase, normalize, isProduction };
});
