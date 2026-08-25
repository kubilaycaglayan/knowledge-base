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
})
