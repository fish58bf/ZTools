import { beforeEach, describe, expect, it, vi } from 'vitest'

const clipboardState = {
  imageEmpty: true,
  text: '',
  pngBuffer: Buffer.from('fake-png')
}
const existingFilePaths = new Set<string>()

vi.mock('electron', () => ({
  clipboard: {
    readImage: vi.fn(() => ({
      isEmpty: () => clipboardState.imageEmpty,
      toPNG: () => clipboardState.pngBuffer,
      getSize: () => ({ width: 10, height: 20 })
    })),
    readText: vi.fn(() => clipboardState.text),
    writeText: vi.fn(),
    writeImage: vi.fn(),
    has: vi.fn(() => false),
    read: vi.fn(() => ''),
    writeBuffer: vi.fn()
  },
  nativeImage: {
    createFromPath: vi.fn(() => ({ isEmpty: () => true })),
    createFromDataURL: vi.fn(() => ({ isEmpty: () => true }))
  }
}))

vi.mock('../../src/main/utils/clipboardFiles', () => ({
  hasClipboardFiles: vi.fn(() => false),
  readClipboardFilePaths: vi.fn(() => []),
  readClipboardFiles: vi.fn(() => []),
  writeClipboardFiles: vi.fn(() => true)
}))

vi.mock('../../src/main/core/native', () => {
  class ClipboardMonitor {
    start = vi.fn()
    stop = vi.fn()
  }
  class WindowMonitor {
    start = vi.fn()
    stop = vi.fn()
  }
  return {
    default: ClipboardMonitor,
    ClipboardMonitor,
    WindowMonitor,
    WindowManager: {
      activateWindow: vi.fn(() => true),
      simulatePaste: vi.fn(),
      getActiveWindow: vi.fn(() => null)
    }
  }
})

vi.mock('../../src/main/core/lmdb/lmdbInstance', () => ({
  default: {
    promises: {
      put: vi.fn(async () => undefined),
      get: vi.fn(async () => null),
      remove: vi.fn(async () => undefined),
      allDocs: vi.fn(async () => [])
    }
  }
}))

vi.mock('../../src/main/core/appData/appDataPaths', () => ({
  getClipboardPath: vi.fn(() => '/tmp/ztools-test-clipboard')
}))

vi.mock('../../src/main/api', () => ({
  default: { dbGet: vi.fn(() => null) }
}))

vi.mock('../../src/main/managers/pluginManager', () => ({
  default: { sendPluginMessage: vi.fn() }
}))

vi.mock('fs', () => ({
  existsSync: vi.fn((filePath: string) => existingFilePaths.has(filePath)),
  promises: {
    mkdir: vi.fn(async () => undefined),
    writeFile: vi.fn(async () => undefined),
    stat: vi.fn(async () => ({ size: 0 })),
    unlink: vi.fn(async () => undefined),
    readdir: vi.fn(async () => [])
  }
}))

import { writeClipboardFiles } from '../../src/main/utils/clipboardFiles'
import clipboardManager from '../../src/main/managers/clipboardManager'

async function triggerClipboardChange(): Promise<string | undefined> {
  await (clipboardManager as any).handleClipboardChange()
  return (clipboardManager as any).lastCopiedContent?.type
}

describe('clipboard type detection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clipboardState.imageEmpty = true
    clipboardState.text = ''
    ;(clipboardManager as any).lastCopiedContent = null
    ;(clipboardManager as any).lastSavedHash = null
  })

  it('treats a real image copy as an image', async () => {
    clipboardState.imageEmpty = false
    clipboardState.text = ''

    expect(await triggerClipboardChange()).toBe('image')
  })

  it('treats Office text copies carrying a selection rendering as text', async () => {
    // Word/WPS on macOS put both public.utf8-plain-text and public.tiff on the pasteboard.
    clipboardState.imageEmpty = false
    clipboardState.text = 'hello from Word'

    expect(await triggerClipboardChange()).toBe('text')
    expect((clipboardManager as any).lastCopiedContent?.data).toBe('hello from Word')
  })

  it('ignores whitespace-only text alongside an image', async () => {
    clipboardState.imageEmpty = false
    clipboardState.text = '   \n\t '

    expect(await triggerClipboardChange()).toBe('image')
  })

  it('treats a plain text copy as text', async () => {
    clipboardState.imageEmpty = true
    clipboardState.text = 'plain text'

    expect(await triggerClipboardChange()).toBe('text')
  })
})

describe('clipboard content writing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    existingFilePaths.clear()
    vi.mocked(writeClipboardFiles).mockReturnValue(true)
  })

  it('writes a single existing file path', () => {
    existingFilePaths.add('/tmp/file-a.txt')

    expect(clipboardManager.writeContent({ type: 'file', content: '/tmp/file-a.txt' })).toBe(true)
    expect(writeClipboardFiles).toHaveBeenCalledWith(['/tmp/file-a.txt'])
  })

  it('writes multiple files while filtering invalid paths', () => {
    existingFilePaths.add('/tmp/file-a.txt')
    existingFilePaths.add('/tmp/folder-b')

    expect(
      clipboardManager.writeContent({
        type: 'file',
        content: ['/tmp/file-a.txt', '', '/tmp/missing.txt', '/tmp/folder-b']
      })
    ).toBe(true)
    expect(writeClipboardFiles).toHaveBeenCalledWith(['/tmp/file-a.txt', '/tmp/folder-b'])
  })

  it('rejects a file list without any valid paths', () => {
    expect(clipboardManager.writeContent({ type: 'file', content: ['', '/tmp/missing.txt'] })).toBe(
      false
    )
    expect(writeClipboardFiles).not.toHaveBeenCalled()
  })

  it('returns false when the platform file writer is unsupported', () => {
    existingFilePaths.add('/tmp/file-a.txt')
    vi.mocked(writeClipboardFiles).mockReturnValue(false)

    expect(clipboardManager.writeContent({ type: 'file', content: '/tmp/file-a.txt' })).toBe(false)
  })

  it('rejects array content for text and image types at runtime', () => {
    expect(clipboardManager.writeContent({ type: 'text', content: ['invalid'] } as never)).toBe(
      false
    )
    expect(clipboardManager.writeContent({ type: 'image', content: ['invalid'] } as never)).toBe(
      false
    )
  })
})
