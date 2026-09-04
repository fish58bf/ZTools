import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  writeContent: vi.fn(),
  hideWindow: vi.fn(),
  getPreviousActiveWindow: vi.fn(),
  activateApp: vi.fn(),
  simulatePaste: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: any[]) => any) => {
      mocks.handlers.set(channel, handler)
    })
  }
}))

vi.mock('../../src/main/core/native', () => ({
  WindowManager: {
    simulatePaste: mocks.simulatePaste
  }
}))

vi.mock('../../src/main/managers/clipboardManager', () => ({
  default: {
    writeContent: mocks.writeContent,
    activateApp: mocks.activateApp
  }
}))

vi.mock('../../src/main/managers/windowManager', () => ({
  default: {
    hideWindow: mocks.hideWindow,
    getPreviousActiveWindow: mocks.getPreviousActiveWindow
  }
}))

import { ClipboardAPI } from '../../src/main/api/shared/clipboard'

describe('clipboard write-content IPC', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.handlers.clear()
    mocks.getPreviousActiveWindow.mockReturnValue(null)
    new ClipboardAPI().init()
  })

  it('pastes multiple files after a successful write', async () => {
    mocks.writeContent.mockReturnValue(true)
    const handler = mocks.handlers.get('clipboard:write-content')!
    const data = { type: 'file', content: ['/tmp/file-a.txt', '/tmp/file-b.txt'] } as const

    await expect(handler({}, data, true)).resolves.toEqual({ success: true })
    expect(mocks.writeContent).toHaveBeenCalledWith(data)
    expect(mocks.simulatePaste).toHaveBeenCalledOnce()
  })

  it('does not paste when writing fails or automatic paste is disabled', async () => {
    const handler = mocks.handlers.get('clipboard:write-content')!
    const data = { type: 'file', content: '/tmp/file-a.txt' } as const

    mocks.writeContent.mockReturnValue(false)
    await expect(handler({}, data, true)).resolves.toEqual({ success: false })

    mocks.writeContent.mockReturnValue(true)
    await expect(handler({}, data, false)).resolves.toEqual({ success: true })
    expect(mocks.simulatePaste).not.toHaveBeenCalled()
  })
})
