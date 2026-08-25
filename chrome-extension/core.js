(function (root, factory) {
  const api = factory()
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  else root.KnowCore = api
})(typeof globalThis === 'undefined' ? this : globalThis, function () {
  function activePaths(paths) { return paths.filter(path => path.status === 'ACTIVE') }
  function itemsForPath(items, pathId) { return items.filter(item => !pathId || item.pathIds.includes(pathId)) }
  function timerStartPayload(pathId, itemId, description) {
    return { pathId: pathId || null, itemId: itemId || null, description: description || null, source: 'CHROME_EXTENSION' }
  }
  function timerIsRunning(timer) { return Boolean(timer && (timer.running || timer.active)) }
  function timerStatus(timer) { return timerIsRunning(timer) ? (timer.description ? `Timer running · ${timer.description}` : 'Timer running') : 'No active timer' }
  return { activePaths, itemsForPath, timerStartPayload, timerIsRunning, timerStatus }
})
