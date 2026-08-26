import { flushPromises, mount } from '@vue/test-utils'
import ReportsView from './ReportsView.vue'
import { api } from '../lib/api'

vi.mock('../lib/api', () => ({ api: vi.fn() }))

describe('ReportsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api).mockResolvedValue({
      period: 'WEEK', from: '2026-08-24', to: '2026-08-30', totalSeconds: 5400,
      days: [{ date: '2026-08-25', totalSeconds: 3600, paths: [{ id: 'path-1', label: 'Wander', seconds: 3600 }], items: [{ id: 'item-1', label: 'Walking', seconds: 1800 }] }],
      paths: [{ id: 'path-1', label: 'Wander', seconds: 5400 }], items: [{ id: 'item-1', label: 'Walking', seconds: 5400 }]
    })
  })

  it('shows the daily timeline and path/resource categories', async () => {
    const wrapper = mount(ReportsView)
    await flushPromises()

    expect(wrapper.text()).toContain('Time, day by day')
    expect(wrapper.text()).toContain('Wander')
    expect(wrapper.text()).toContain('Walking')
    const dayLabel = new Date('2026-08-25T00:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    expect(wrapper.text()).toContain(dayLabel)
    expect(wrapper.find(`[aria-label="${dayLabel}: 1h 0m tracked"]`).exists()).toBe(true)
  })

  it('requests the selected month view', async () => {
    const wrapper = mount(ReportsView)
    await flushPromises()
    await wrapper.findAll('button[aria-pressed="false"]')[0].trigger('click')
    await flushPromises()

    expect(vi.mocked(api)).toHaveBeenLastCalledWith(expect.stringContaining('/reports?period=MONTH'))
  })
})
