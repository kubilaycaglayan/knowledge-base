const test = require('node:test')
const assert = require('node:assert/strict')
const { activePaths, itemsForPath, timerStartPayload, timerIsRunning, timerElapsedSeconds, timerStatus } = require('./core.js')

test('only active paths are offered to the timer', () => {
  assert.deepEqual(activePaths([{ id: 'active', status: 'ACTIVE' }, { id: 'archived', status: 'ARCHIVED' }]).map(path => path.id), ['active'])
})

test('item choices follow the selected path', () => {
  const items = [{ id: 'one', pathIds: ['path-a'] }, { id: 'two', pathIds: ['path-b'] }]
  assert.deepEqual(itemsForPath(items, 'path-a').map(item => item.id), ['one'])
  assert.equal(itemsForPath(items, '').length, 2)
})

test('timer requests carry the extension source and nullable selections', () => {
  assert.deepEqual(timerStartPayload('', 'item-id', ''), { pathId: null, itemId: 'item-id', description: null, source: 'CHROME_EXTENSION' })
})

test('current timer state preserves the server description', () => {
  const timer = { running: true, startedAt: '2026-08-31T00:00:00Z', description: 'Chapter 4' }
  assert.equal(timerIsRunning(timer), true)
  assert.equal(timerElapsedSeconds(timer, Date.parse('2026-08-31T01:02:03Z')), 3723)
  assert.equal(timerStatus(timer, Date.parse('2026-08-31T01:02:03Z')), '01:02:03 · Chapter 4')
  assert.equal(timerStatus(null), 'No active timer')
})

test('server timer state is authoritative for stop decisions', () => {
  assert.equal(timerIsRunning({ running: true }), true)
  assert.equal(timerIsRunning(null), false)
})
