import { flushPromises, mount } from '@vue/test-utils'
import ItemsView from './ItemsView.vue'
import { api } from '../lib/api'

vi.mock('../lib/api', () => ({ api: vi.fn() }))

describe('ItemsView', () => {
  it('shows archived memberships while offering only active paths for new items', async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === '/items') return [{ id: 'item-1', title: 'Existing item', type: 'BOOK', status: 'PLANNED', progress: 0, pathIds: ['archived'], tags: [] }]
      if (path === '/paths') return [{ id: 'active', name: 'Current path', status: 'ACTIVE' }, { id: 'archived', name: 'Finished path', status: 'ARCHIVED' }]
      if (path === '/notes') return []
      return undefined
    })
    const wrapper = mount(ItemsView)
    await flushPromises()

    expect(wrapper.text()).toContain('Finished path')
    expect(wrapper.find('fieldset legend').text()).toBe('Active paths')
    expect(wrapper.findAll('fieldset input')).toHaveLength(1)
    expect(wrapper.find('fieldset input').attributes('value')).toBe('active')
  })

  it('offers the supported item types when adding a resource', async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === '/items') return []
      if (path === '/paths') return []
      if (path === '/notes') return []
      return undefined
    })
    const wrapper = mount(ItemsView)
    await flushPromises()
    const type = wrapper.get('select[aria-label="Item type"]')
    expect(type.findAll('option').map(option => option.text())).toContain('MOVIE')
    expect(type.findAll('option').map(option => option.text())).toContain('PAPER')
    await type.setValue('MOVIE')
    await wrapper.get('input[aria-label="Item title"]').setValue('A film to revisit')
    await wrapper.get('form').trigger('submit')
    expect(vi.mocked(api)).toHaveBeenCalledWith('/items', expect.objectContaining({ method: 'POST', body: expect.stringContaining('"type":"MOVIE"') }))
  })
})
