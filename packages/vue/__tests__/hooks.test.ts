import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getFilterGroup } from '../hooks'

describe('Vue Hooks', () => {
  beforeEach(() => {
    // 模拟 window.location
    vi.stubGlobal('location', {
      search: '',
      hash: '',
      pathname: '/',
    })

    // 模拟 window.history
    vi.stubGlobal('history', {
      replaceState: vi.fn(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should create filter group', () => {
    const configs = [
      {
        name: 'test',
        component: 'input',
        componentProps: {},
        visible: true,
      },
    ] as const

    const group = getFilterGroup(configs)
    expect(group).toBeDefined()
    expect(group.filterKeys).toEqual(['test'])
  })
})
