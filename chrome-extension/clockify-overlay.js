import "./clockify-validation.js";
import "./clockify-settings.js";

(function () {
  if (window.top !== window) return;
  const detailedRoute = () => {
    try {
      const url = new URL(window.location.href);
      return url.origin === "https://app.clockify.me" && /^\/reports\/detailed(?:\/|$)/.test(url.pathname);
    } catch { return false; }
  };
  let root;
  let shadow;
  let enabled = null;
  const mount = () => {
    if (root) return;
    root = document.documentElement.appendChild(document.createElement("div"));
    root.id = "know-clockify-import-overlay-host";
    shadow = root.attachShadow({ mode: "closed" });
    shadow.innerHTML = `<style>
    :host { all: initial; }
    .panel { --background: #fff; --text: #252b36; --muted: #606b7b; --border: #dfe3e9; --control-border: #aab3c0; --accent: #334155; --on-accent: #fff; --hover: #1b2533; --focus: #2563b5; --selected: #e7ebf0; --danger: #a12727; position: fixed; z-index: 2147483647; right: max(24px, env(safe-area-inset-right)); bottom: max(24px, env(safe-area-inset-bottom)); width: 300px; max-width: calc(100vw - 32px); box-sizing: border-box; padding: 16px; border: 1px solid var(--border); border-radius: 4px; background: var(--background); color: var(--text); box-shadow: 0 14px 34px #18212f2e, 0 2px 8px #18212f1f; font: 14px/1.5 Inter, ui-sans-serif, system-ui, sans-serif; overflow-wrap: anywhere; }
    h2 { margin: 0 0 5px; color: var(--text); font: 650 17px/1.3 Inter, ui-sans-serif, system-ui, sans-serif; letter-spacing: -.3px; text-wrap: balance; } h2 span { color: var(--muted); } p { margin: 5px 0; color: var(--muted); } .counts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px; margin: 13px 0 5px; } .count { min-width: 0; padding: 8px 4px; border-radius: 4px; background: var(--selected); text-align: center; } strong { display: block; color: var(--text); font-size: 20px; font-variant-numeric: tabular-nums; } small { color: var(--muted); font-size: 10px; overflow-wrap: anywhere; } .error { color: var(--danger); } button { min-height: 36px; margin-top: 8px; padding: 7px 10px; border: 1px solid var(--accent); border-radius: 4px; background: var(--accent); color: var(--on-accent); font: 600 12px system-ui, sans-serif; cursor: pointer; touch-action: manipulation; -webkit-tap-highlight-color: var(--selected); } button:hover { border-color: var(--hover); background: var(--hover); } button:focus-visible { outline: 2px solid var(--focus); outline-offset: 3px; }
    @media (prefers-color-scheme: dark) { .panel { color-scheme: dark; --background: #1c2430; --text: #e1e6ee; --muted: #a7b2c2; --border: #343e4c; --control-border: #697789; --accent: #c4d1e2; --on-accent: #18212e; --hover: #e0e8f3; --focus: #86b7f3; --selected: #303e52; --danger: #ffaaaa; } }
    @media (max-width: 700px) { button { min-height: 44px; } }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
    </style><section class="panel" aria-live="polite"><h2 translate="no">knowledge<span>.</span>base · Clockify</h2><p class="message">Watching detailed reports…</p><div class="counts" hidden><div class="count"><strong class="imported">0</strong><small>imported</small></div><div class="count"><strong class="skipped">0</strong><small>duplicates skipped</small></div><div class="count"><strong class="paths">0</strong><small>new paths</small></div></div><button class="login" hidden>Open Extension</button></section>`;
    $(".login").onclick = () => chrome.runtime.sendMessage({ type: "KNOW_OPEN_POPUP" });
  };
  const $ = (selector) => shadow?.querySelector(selector);
  const updateRoute = () => {
    if (!KnowClockifySettings.isEnabled(enabled)) {
      if (root) root.hidden = true;
      return;
    }
    mount();
    root.hidden = !detailedRoute();
  };
  const seen = new Set();
  let importing = false;
  const hash = async (payload) => {
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  };
  const show = (summary) => {
    $(".message").textContent = `Imported ${summary.imported} sessions from this report.`;
    $(".imported").textContent = summary.imported;
    $(".skipped").textContent = summary.skipped;
    $(".paths").textContent = summary.createdPaths;
    $(".counts").hidden = false;
  };
  chrome.storage.local.get(KnowClockifySettings.KEY).then((stored) => {
    enabled = KnowClockifySettings.isEnabled(stored[KnowClockifySettings.KEY]);
    updateRoute();
  });
  chrome.storage.onChanged?.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[KnowClockifySettings.KEY]) return;
    enabled = KnowClockifySettings.isEnabled(changes[KnowClockifySettings.KEY].newValue);
    updateRoute();
  });
  window.addEventListener("popstate", updateRoute);
  window.addEventListener("hashchange", updateRoute);
  if (typeof window.setInterval === "function") window.setInterval(updateRoute, 250);
  window.addEventListener("message", async (event) => {
    if (!KnowClockifySettings.isEnabled(enabled) || !detailedRoute() || event.source !== window || event.origin !== "https://app.clockify.me" || event.data?.source !== "know-clockify" || event.data.type !== "detailed-report" || importing) return;
    const payload = event.data.payload;
    const validation = KnowClockifyValidation.validate(payload);
    if (!validation.ok) { $(".message").textContent = validation.error; $(".message").className = "message error"; return; }
    if (!payload.timeentries.length) {
      $(".message").textContent = "No completed entries in this report.";
      return;
    }
    const key = await hash(payload);
    if (seen.has(key)) return;
    importing = true;
    $(".message").textContent = `Importing ${payload.timeentries.length} sessions…`;
    chrome.runtime.sendMessage({ type: "KNOW_CLOCKIFY_IMPORT", payload }, (result) => {
      importing = false;
      if (chrome.runtime.lastError || !result?.ok) {
        $(".message").textContent = result?.error || "Could not import this report.";
        $(".message").className = "message error";
        $(".login").hidden = !result?.needsLogin;
        return;
      }
      $(".message").className = "message";
      seen.add(key);
      show(result.summary);
    });
  });
})();
