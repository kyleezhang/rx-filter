import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createRxFilterGroup, createRxFilterGroupByArray } from '../group'
import type { TFilterConfig } from '../types'

describe('RxFilterGroup', () => {
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

  it('should create group with config map', async () => {
    const config: Record<string, TFilterConfig<string, any, any, any>> = {
      test: {
        name: 'test',
        component: 'input',
        componentProps: {},
        visible: true,
      },
    }

    const group = createRxFilterGroup(config)
    expect(group).toBeDefined()
    expect(group.filterKeys).toEqual(['test'])
  })

  it('should create group with config array', () => {
    const configs = [
      {
        name: 'test',
        component: 'input',
        componentProps: {},
        visible: true,
      },
    ]

    const group = createRxFilterGroupByArray(configs)
    expect(group).toBeDefined()
    expect(group.filterKeys).toEqual(['test'])
  })
})
