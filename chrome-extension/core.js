(function (root, factory) {
  const api = factory()
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  else root.KnowCore = api
})(typeof globalThis === 'undefined' ? this : globalThis, function () {
  function activePaths(paths) { return paths.filter(path => path.status === 'ACTIVE') }
  function itemsForPath(items, pathId, selectedItemId) {
    return items.filter(item => !pathId || item.pathIds.includes(pathId) || item.id === selectedItemId)
  }
  function timerStartPayload(pathId, itemId, description) {
    return { pathId: pathId || null, itemId: itemId || null, description: description || null, source: 'CHROME_EXTENSION' }
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
    if (!timerIsRunning(timer)) return 'No active timer'
    const clock = formatTimer(timerElapsedSeconds(timer, now))
    return timer.description ? clock + ' · ' + timer.description : clock
  }
  return { activePaths, itemsForPath, timerStartPayload, timerIsRunning, timerElapsedSeconds, timerStatus }
})
