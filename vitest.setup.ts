import { vi } from 'vitest'
import { config } from '@vue/test-utils'

// 全局配置
config.global.stubs = {
  transition: false,
}

// 模拟 localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  clear: vi.fn(),
  removeItem: vi.fn(),
}

vi.stubGlobal('localStorage', localStorageMock)
