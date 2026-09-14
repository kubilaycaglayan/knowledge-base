const test = require('node:test')
const assert = require('node:assert/strict')
const { activePaths, timerLabels, timerStartPayload, timerIsRunning, timerElapsedSeconds, timerStatus, formatGroupDuration } = require('./core.js')

test('only active paths are offered to the timer', () => {
  assert.deepEqual(activePaths([{ id: 'active', status: 'ACTIVE' }, { id: 'archived', status: 'ARCHIVED' }]).map(path => path.id), ['active'])
})

test('all labels are available for any selected path', () => {
  const labels = [{ id: 'one', pathIds: ['path-a'] }, { id: 'two', pathIds: ['path-b'] }]
  assert.deepEqual(timerLabels(labels, 'path-a').map(label => label.id), ['one', 'two'])
  assert.equal(timerLabels(labels, '').length, 2)
})

test('labels remain available across independent path selections', () => {
  const labels = [{ id: 'one', pathIds: ['path-a'] }, { id: 'two', pathIds: ['path-b'] }]
  assert.deepEqual(timerLabels(labels, 'path-a', ['two']).map(label => label.id), ['one', 'two'])
})

test('timer requests carry the extension source and nullable selections', () => {
  assert.deepEqual(timerStartPayload('', ['label-id'], ''), { pathId: null, labelIds: ['label-id'], description: null, source: 'CHROME_EXTENSION' })
})

test('current timer status does not display the server description', () => {
  const timer = { running: true, startedAt: '2026-08-31T00:00:00Z', description: 'Chapter 4' }
  assert.equal(timerIsRunning(timer), true)
  assert.equal(timerElapsedSeconds(timer, Date.parse('2026-08-31T01:02:03Z')), 3723)
  assert.equal(timerStatus(timer, Date.parse('2026-08-31T01:02:03Z')), '01:02:03')
  assert.equal(timerStatus(null), '00:00:00')
})

test('server timer state is authoritative for stop decisions', () => {
  assert.equal(timerIsRunning({ running: true }), true)
  assert.equal(timerIsRunning(null), false)
})

test('formats session group totals as HH:MM', () => {
  assert.equal(formatGroupDuration([{ durationSeconds: 3600 }, { durationSeconds: 1800 }]), '01:30')
  assert.equal(formatGroupDuration([{ durationSeconds: 45 }]), '00:00')
})
