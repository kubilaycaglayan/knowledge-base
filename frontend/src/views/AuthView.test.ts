import { mount } from '@vue/test-utils'
import AuthView from './AuthView.vue'
import { api } from '../lib/api'

vi.mock('../lib/api', () => ({ api: vi.fn() }))

describe('AuthView', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('registers, persists the token, and emits authentication', async () => {
    vi.mocked(api).mockResolvedValue({ token: 'test-token' })
    const wrapper = mount(AuthView)

    await wrapper.find('.text-button').trigger('click')
    await wrapper.get('input[type="email"]').setValue('learner@example.com')
    await wrapper.get('input[type="password"]').setValue('a-secure-password')
    await wrapper.get('form').trigger('submit')

    expect(api).toHaveBeenCalledWith('/auth/register', expect.objectContaining({ method: 'POST' }))
    expect(localStorage.getItem('know_token')).toBe('test-token')
    expect(wrapper.emitted('authenticated')).toHaveLength(1)
  })

  it('shows an actionable error when authentication fails', async () => {
    vi.mocked(api).mockRejectedValue(new Error('bad credentials'))
    const wrapper = mount(AuthView)

    await wrapper.get('input[type="email"]').setValue('learner@example.com')
    await wrapper.get('input[type="password"]').setValue('a-secure-password')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.get('[role="alert"]').text()).toContain('valid email')
    expect(wrapper.emitted('authenticated')).toBeUndefined()
  })
})
