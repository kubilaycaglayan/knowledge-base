(function (root, factory) {
  const api = factory()
  // WXT bundles this file through a CommonJS-style wrapper, but the popup
  // consumes the browser-global API. Only use module.exports in a real Node
  // environment; otherwise always publish the API on globalThis.
  if (typeof module !== 'undefined' && module.exports && typeof require === 'function') module.exports = api
  else root.KnowCore = api
})(typeof globalThis === 'undefined' ? this : globalThis, function () {
  function activePaths(paths) { return paths.filter(path => path.status === 'ACTIVE') }
  // Labels are independent of paths. A path is context for a timer, not a
  // restriction on which label can be selected (matching the web client).
  function timerLabels(labels) { return labels }
  function timerStartPayload(pathId, labelIds, description) {
    const ids = Array.isArray(labelIds) ? labelIds : labelIds ? [labelIds] : []
    return { pathId: pathId || null, labelIds: ids, description: description || null, source: 'CHROME_EXTENSION' }
  }
  function timerIsRunning(timer) { return Boolean(timer && (timer.running || timer.active)) }
  function timerElapsedSeconds(timer, now = Date.now()) {
    if (!timerIsRunning(timer) || !timer.startedAt) return 0
    return Math.max(0, Math.floor((now - Date.parse(timer.startedAt)) / 1000))
  }
  function formatTimer(seconds) {
    return [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60]
      .map(value => String(value).padStart(2, '0'))
      .join(':')
  }
  function timerStatus(timer, now = Date.now()) {
    if (!timerIsRunning(timer)) return '00:00:00'
    return formatTimer(timerElapsedSeconds(timer, now))
  }
  return { activePaths, timerLabels, timerStartPayload, timerIsRunning, timerElapsedSeconds, formatTimer, timerStatus }
})
