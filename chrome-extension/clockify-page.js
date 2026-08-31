(function () {
  const reportUrl = (value) => {
    try {
      const url = new URL(value, location.href);
      return url.origin === "https://app.clockify.me"
        && /^\/report\/workspaces\/[^/]+\/async\/reports\/detailed\/[^/]+$/.test(url.pathname);
    } catch { return false; }
  };
  const publish = (url, payload) => {
    if (!reportUrl(url) || !payload || !Array.isArray(payload.timeentries)) return;
    window.postMessage({ source: "know-clockify", type: "detailed-report", payload }, "https://app.clockify.me");
  };
  const inspect = (url, response) => {
    if (!reportUrl(url)) return;
    response.clone().json().then((payload) => publish(url, payload)).catch(() => {});
  };
  const originalFetch = window.fetch;
  window.fetch = function (...args) {
    const result = originalFetch.apply(this, args);
    result.then((response) => inspect(typeof args[0] === "string" ? args[0] : args[0]?.url, response)).catch(() => {});
    return result;
  };
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__knowClockifyUrl = url;
    return originalOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener("load", () => {
      if (!reportUrl(this.__knowClockifyUrl)) return;
      try { publish(this.__knowClockifyUrl, JSON.parse(this.responseText)); } catch {}
    });
    return originalSend.apply(this, args);
  };
})();
