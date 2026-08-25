import { flushPromises, mount } from '@vue/test-utils'
import DashboardView from './DashboardView.vue'
import { api } from '../lib/api'

vi.mock('../lib/api', () => ({ api: vi.fn() }))

describe('DashboardView timer flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api).mockImplementation(async (path: string, options: RequestInit = {}) => {
      if (path === '/paths') return []
      if (path === '/items') return []
      if (path === '/timers/current') return null
      if (path === '/statistics') return { todaySeconds: 0, weekSeconds: 0, monthSeconds: 0, todayByPath: {}, todayByItem: {}, completedItems: 0, activeItems: 0, recentProgressChanges: [] }
      if (path === '/time-entries') return []
      if (path === '/timers' && options.method === 'POST') return { id: 'timer-1', startedAt: new Date().toISOString(), description: 'Focus' }
      if (path === '/timers/cancel') return undefined
      return undefined
    })
  })

  it('starts a server timer and can cancel the active session', async () => {
    const wrapper = mount(DashboardView)
    await flushPromises()

    expect(wrapper.text()).toContain('Start a session')
    await wrapper.find('button.primary').trigger('click')
    await flushPromises()

    expect(vi.mocked(api)).toHaveBeenCalledWith('/timers', expect.objectContaining({ method: 'POST' }))
    expect(wrapper.text()).toContain('Stop session')
    await wrapper.get('button.danger').trigger('click')
    await flushPromises()

    expect(vi.mocked(api)).toHaveBeenCalledWith('/timers/cancel', expect.objectContaining({ method: 'POST' }))
    expect(wrapper.text()).toContain('Start a session')
  })

  it('only offers items attached to the selected timer path', async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === '/paths') return [{ id: 'path-a', name: 'Algorithms', status: 'ACTIVE' }, { id: 'path-b', name: 'Writing', status: 'ACTIVE' }]
      if (path === '/items') return [{ id: 'item-a', title: 'Graphs', pathIds: ['path-a'] }, { id: 'item-b', title: 'Essays', pathIds: ['path-b'] }]
      if (path === '/timers/current') return null
      if (path === '/statistics') return { todaySeconds: 0, weekSeconds: 0, monthSeconds: 0, todayByPath: {}, todayByItem: {}, completedItems: 0, activeItems: 0, recentProgressChanges: [] }
      if (path === '/time-entries') return []
      return undefined
    })
    const wrapper = mount(DashboardView)
    await flushPromises()

    await wrapper.get('select[aria-label="Timer path"]').setValue('path-a')
    const options = wrapper.get('select[aria-label="Timer item"]').findAll('option').map(option => option.text())
    expect(options).toContain('Graphs')
    expect(options).not.toContain('Essays')
  })

  it('imports Clockify JSON through the server mapping endpoint', async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === '/paths') return []
      if (path === '/items') return []
      if (path === '/timers/current') return null
      if (path === '/statistics') return { todaySeconds: 0, weekSeconds: 0, monthSeconds: 0, todayByPath: {}, todayByItem: {}, completedItems: 0, activeItems: 0, recentProgressChanges: [] }
      if (path === '/time-entries') return []
      if (path === '/imports/clockify') return { imported: 2, skipped: 1, createdPaths: 1 }
      return undefined
    })
    const wrapper = mount(DashboardView)
    await flushPromises()
    await wrapper.get('textarea[aria-label="Clockify JSON"]').setValue('{"timeentries":[]}')
    const importButton = wrapper.findAll('button').find(button => button.text() === 'Import Clockify sessions')
    expect(importButton).toBeDefined()
    await importButton!.trigger('click')
    await flushPromises()
    expect(vi.mocked(api)).toHaveBeenCalledWith('/imports/clockify', expect.objectContaining({ method: 'POST' }))
    expect(wrapper.text()).toContain('Imported 2 sessions')
  })

  it('keeps active timer configuration controls visible and editable', async () => {
    vi.mocked(api).mockImplementation(async (path: string, options: RequestInit = {}) => {
      if (path === '/paths') return [{ id: 'path-a', name: 'Algorithms', status: 'ACTIVE' }]
      if (path === '/items') return [{ id: 'item-a', title: 'Graphs', pathIds: ['path-a'] }]
      if (path === '/timers/current') return { id: 'timer-a', pathId: 'path-a', itemId: 'item-a', startedAt: '2026-08-25T10:00:00Z', description: 'Focus', running: true }
      if (path === '/statistics') return { todaySeconds: 0, weekSeconds: 0, monthSeconds: 0, todayByPath: {}, todayByItem: {}, completedItems: 0, activeItems: 0, recentProgressChanges: [] }
      if (path === '/time-entries') return []
      if (path === '/timers/timer-a' && options.method === 'PUT') return { id: 'timer-a', pathId: 'path-a', itemId: 'item-a', startedAt: '2026-08-25T09:30:00Z', description: 'Updated focus', running: true }
      return undefined
    })
    const wrapper = mount(DashboardView)
    await flushPromises()
    expect(wrapper.find('input[aria-label="Timer start"]').exists()).toBe(true)
    const save = wrapper.findAll('button').find(button => button.text() === 'Save timer settings')
    expect(save).toBeDefined()
    await save!.trigger('click')
    await flushPromises()
    expect(vi.mocked(api)).toHaveBeenCalledWith('/timers/timer-a', expect.objectContaining({ method: 'PUT' }))
  })

  it('shows the path and shortened description for recent sessions', async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === '/paths') return [{ id: 'path-a', name: 'Algorithms', status: 'ACTIVE' }]
      if (path === '/items') return []
      if (path === '/timers/current') return null
      if (path === '/statistics') return { todaySeconds: 0, weekSeconds: 0, monthSeconds: 0, todayByPath: {}, todayByItem: {}, completedItems: 0, activeItems: 0, recentProgressChanges: [] }
      if (path === '/time-entries') return [{ id: 'entry-a', pathId: 'path-a', startedAt: '2026-08-25T10:00:00Z', endedAt: '2026-08-25T10:30:00Z', durationSeconds: 1800, description: 'A very long session description that should be shortened in the recent dashboard list because it contains lots of detail.' }]
      return undefined
    })
    const wrapper = mount(DashboardView)
    await flushPromises()
    expect(wrapper.text()).toContain('Algorithms')
    expect(wrapper.text()).toContain('A very long session description')
    expect(wrapper.text()).toContain('…')
  })
})
