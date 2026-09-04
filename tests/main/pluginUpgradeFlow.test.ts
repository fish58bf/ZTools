import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  shell: { showItemInFolder: vi.fn() }
}))

vi.mock('../../src/main/api/shared/database', () => ({
  default: {
    dbGet: vi.fn(() => []),
    dbPut: vi.fn()
  }
}))

vi.mock('../../src/main/core/internalPlugins', () => ({
  isBundledInternalPlugin: vi.fn(() => false)
}))

vi.mock('../../src/main/managers/windowManager', () => ({
  default: { showPluginMarketDetail: vi.fn() }
}))

vi.mock('../../src/main/api/plugin/feature', () => ({
  pluginFeatureAPI: { loadDynamicFeatures: vi.fn(() => []) }
}))

vi.mock('../../src/main/core/lmdb/lmdbInstance', () => ({
  default: { allDocs: vi.fn(() => []), get: vi.fn(() => null) }
}))

vi.mock('../../src/main/core/provider/providerManager', () => ({
  default: { cleanupForPlugin: vi.fn() }
}))

vi.mock('../../src/main/api/renderer/pluginDevProjects', () => ({
  PluginDevProjectsAPI: class {}
}))

vi.mock('../../src/main/api/renderer/pluginInstaller', () => ({
  PluginInstallerAPI: class {}
}))

vi.mock('../../src/main/api/renderer/pluginMarket', () => ({
  PluginMarketAPI: class {}
}))

import { PluginsAPI } from '../../src/main/api/renderer/plugins'

describe('PluginsAPI current plugin upgrade flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('collapses the running plugin and reopens the newly registered path after upgrade', async () => {
    const api = new PluginsAPI()
    const relaunchContext = {
      surface: 'main' as const,
      pluginName: 'demo',
      pluginPath: '/plugins/demo-old.asar',
      featureCode: 'demo',
      cmdType: 'text',
      param: { code: 'demo', type: 'text', payload: 'hello' },
      height: 420
    }
    const collapseCurrentPluginForUpgrade = vi.fn(() => relaunchContext)
    const reopenPluginAfterUpgrade = vi.fn().mockResolvedValue({ success: true })
    const installPluginFromMarket = vi.fn().mockResolvedValue({
      success: true,
      plugin: { name: 'demo', path: '/plugins/demo-new.asar', version: '2.0.0' }
    })
    const readInstalledPlugins = vi
      .spyOn(api as any, 'readInstalledPlugins')
      .mockReturnValueOnce([{ name: 'demo', path: '/plugins/demo-old.asar' }])
      .mockReturnValueOnce([{ name: 'demo', path: '/plugins/demo-new.asar' }])
    ;(api as any).pluginManager = {
      collapseCurrentPluginForUpgrade,
      reopenPluginAfterUpgrade
    }
    ;(api as any).installer = { installPluginFromMarket }

    const sender = {} as Electron.WebContents
    const result = await api.upgradeCurrentPluginFromMarket(
      'demo',
      '/plugins/demo-old.asar',
      sender
    )

    expect(result).toMatchObject({ success: true, plugin: { path: '/plugins/demo-new.asar' } })
    expect(collapseCurrentPluginForUpgrade).toHaveBeenCalledWith(
      'demo',
      '/plugins/demo-old.asar',
      sender
    )
    expect(installPluginFromMarket).toHaveBeenCalledWith({ name: 'demo' }, sender)
    expect(reopenPluginAfterUpgrade).toHaveBeenCalledWith(
      relaunchContext,
      '/plugins/demo-new.asar',
      true
    )
    expect(readInstalledPlugins).toHaveBeenCalledTimes(2)
  })

  it('restores the previous registered path when the market upgrade fails', async () => {
    const api = new PluginsAPI()
    const relaunchContext = {
      surface: 'main' as const,
      pluginName: 'demo',
      pluginPath: '/plugins/demo-old.asar',
      featureCode: 'demo',
      cmdType: 'text',
      param: { code: 'demo', type: 'text' },
      height: 420
    }
    const collapseCurrentPluginForUpgrade = vi.fn(() => relaunchContext)
    const reopenPluginAfterUpgrade = vi.fn().mockResolvedValue({ success: true })
    const installPluginFromMarket = vi
      .fn()
      .mockResolvedValue({ success: false, error: 'download failed' })
    vi.spyOn(api as any, 'readInstalledPlugins')
      .mockReturnValueOnce([{ name: 'demo', path: '/plugins/demo-old.asar' }])
      .mockReturnValueOnce([{ name: 'demo', path: '/plugins/demo-old.asar' }])
    ;(api as any).pluginManager = {
      collapseCurrentPluginForUpgrade,
      reopenPluginAfterUpgrade
    }
    ;(api as any).installer = { installPluginFromMarket }

    const sender = {} as Electron.WebContents
    const result = await api.upgradeCurrentPluginFromMarket(
      'demo',
      '/plugins/demo-old.asar',
      sender
    )

    expect(result).toEqual({ success: false, error: 'download failed' })
    expect(collapseCurrentPluginForUpgrade).toHaveBeenCalledWith(
      'demo',
      '/plugins/demo-old.asar',
      sender
    )
    expect(reopenPluginAfterUpgrade).toHaveBeenCalledWith(
      relaunchContext,
      '/plugins/demo-old.asar',
      false
    )
  })

  it('uses the original path to restore a collapsed surface when failure removes the registry entry', async () => {
    const api = new PluginsAPI()
    const relaunchContext = {
      surface: 'detached' as const,
      pluginName: 'demo',
      pluginPath: '/plugins/demo-old.asar',
      featureCode: 'demo',
      cmdType: 'text',
      param: { code: 'demo', type: 'text' },
      height: 420,
      detachedSnapshot: {
        windowId: 'detached-1',
        pluginName: 'demo',
        pluginPath: '/plugins/demo-old.asar',
        width: 800,
        viewHeight: 420
      }
    }
    const collapseCurrentPluginForUpgrade = vi.fn(() => relaunchContext)
    const reopenPluginAfterUpgrade = vi.fn().mockResolvedValue({ success: true })
    vi.spyOn(api as any, 'readInstalledPlugins')
      .mockReturnValueOnce([{ name: 'demo', path: '/plugins/demo-old.asar' }])
      .mockReturnValueOnce([])
    ;(api as any).pluginManager = {
      collapseCurrentPluginForUpgrade,
      reopenPluginAfterUpgrade
    }
    ;(api as any).installer = {
      installPluginFromMarket: vi
        .fn()
        .mockResolvedValue({ success: false, error: 'publish failed' })
    }

    const result = await api.upgradeCurrentPluginFromMarket(
      'demo',
      '/plugins/demo-old.asar',
      {} as Electron.WebContents
    )

    expect(result).toEqual({ success: false, error: 'publish failed' })
    expect(reopenPluginAfterUpgrade).toHaveBeenCalledWith(
      relaunchContext,
      '/plugins/demo-old.asar',
      false
    )
  })
})
