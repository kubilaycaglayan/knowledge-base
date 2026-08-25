import { flushPromises, mount } from '@vue/test-utils'
import PathsView from './PathsView.vue'
import { api } from '../lib/api'

vi.mock('../lib/api', () => ({ api: vi.fn() }))

describe('PathsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === '/paths') return [{ id: 'path-1', name: 'Algorithms', status: 'ACTIVE' }]
      if (path === '/items') return [{ id: 'item-1', title: 'Graph theory' }, { id: 'item-2', title: 'Sorting' }]
      if (path === '/paths/path-1/summary') return {
        path: { id: 'path-1', name: 'Algorithms', status: 'ACTIVE' },
        itemIds: ['item-1', 'item-2'], itemProgress: { 'item-1': 40, 'item-2': 80 }, trackedSeconds: 120,
        recentActivity: []
      }
      return undefined
    })
  })

  it('filters associated path items while preserving their progress', async () => {
    const wrapper = mount(PathsView)
    await flushPromises()
    await wrapper.get('button.text-button').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Graph theory')
    expect(wrapper.text()).toContain('Sorting')
    await wrapper.get('input[aria-label="Filter path items"]').setValue('sort')

    expect(wrapper.text()).not.toContain('Graph theory — 40%')
    expect(wrapper.text()).toContain('Sorting — 80%')
  })
})
