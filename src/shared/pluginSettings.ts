export const ENABLED_MAIN_PUSH_PLUGINS_KEY = 'enabled-main-push-plugin'

export type PluginConfigEntry = string | { pluginName?: string | null }

/** 解析配置列表，兼容旧式 { pluginName, source } 和新式 string */
export function normalizeConfigList(data: unknown): string[] {
  if (!Array.isArray(data)) return []
  return data
    .map((item: PluginConfigEntry) => (typeof item === 'string' ? item : (item?.pluginName ?? '')))
    .filter((name): name is string => Boolean(name))
}

export function isMainPushPluginEnabled(pluginName: string, enabledPluginNames: string[]): boolean {
  return enabledPluginNames.includes(pluginName)
}

export function removePluginNameFromSettingList(data: string[], pluginName: string): string[] {
  return data.filter((name) => name !== pluginName)
}
