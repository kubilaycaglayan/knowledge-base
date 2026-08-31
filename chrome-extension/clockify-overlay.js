(function () {
  if (window.top !== window) return;
  const root = document.documentElement.appendChild(document.createElement("div"));
  root.id = "know-clockify-import-overlay-host";
  const shadow = root.attachShadow({ mode: "closed" });
  shadow.innerHTML = `<style>
    :host { all: initial; }
    .panel { position: fixed; z-index: 2147483647; right: 24px; bottom: 24px; width: 290px; box-sizing: border-box; padding: 16px; border: 1px solid #dbe2da; border-radius: 14px; background: #fff; color: #1e2926; box-shadow: 0 10px 35px #29443826; font: 14px system-ui, sans-serif; }
    h2 { margin: 0 0 5px; color: #173d36; font: 800 17px system-ui, sans-serif; } p { margin: 5px 0; line-height: 1.35; color: #75827c; } .counts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; margin: 13px 0 5px; } .count { padding: 8px 4px; border-radius: 8px; background: #f4f5ef; text-align: center; } strong { display: block; color: #173d36; font-size: 20px; } small { color: #75827c; font-size: 10px; } .error { color: #a64f32; } button { margin-top: 8px; padding: 7px 10px; border: 0; border-radius: 7px; background: #e8754e; color: #fff; font: 700 12px system-ui, sans-serif; cursor: pointer; }
  </style><section class="panel" aria-live="polite"><h2>Know · Clockify</h2><p class="message">Watching detailed reports…</p><div class="counts" hidden><div class="count"><strong class="imported">0</strong><small>imported</small></div><div class="count"><strong class="skipped">0</strong><small>duplicates skipped</small></div><div class="count"><strong class="paths">0</strong><small>new paths</small></div></div><button class="login" hidden>Open extension</button></section>`;
  const $ = (selector) => shadow.querySelector(selector);
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
  window.addEventListener("message", async (event) => {
    if (event.source !== window || event.origin !== "https://app.clockify.me" || event.data?.source !== "know-clockify" || event.data.type !== "detailed-report" || importing) return;
    const payload = event.data.payload;
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
  $(".login").onclick = () => chrome.runtime.sendMessage({ type: "KNOW_OPEN_POPUP" });
})();
