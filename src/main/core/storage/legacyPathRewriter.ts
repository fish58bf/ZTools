import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import type { ZToolsDataLayout } from '../appData/appDataPaths'

export interface LegacyPathRewriteResult<T> {
  value: T
  changed: boolean
}

/**
 * 递归重写数据中指向旧版 userData 的裸路径和 file URL。
 * @param value 可能包含旧路径的持久化数据
 * @param layout 旧版与 3.x 数据目录布局
 * @returns 重写后的值及是否发生变化
 */
export function rewriteLegacyStoragePaths<T>(
  value: T,
  layout: ZToolsDataLayout
): LegacyPathRewriteResult<T> {
  if (typeof value === 'string') {
    return rewriteLegacyStoragePath(value, layout) as LegacyPathRewriteResult<T>
  }

  if (Array.isArray(value)) {
    let changed = false
    const nextValue = value.map((item) => {
      const result = rewriteLegacyStoragePaths(item, layout)
      changed = changed || result.changed
      return result.value
    })
    return { value: (changed ? nextValue : value) as T, changed }
  }

  if (value && typeof value === 'object') {
    let changed = false
    const nextValue: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value)) {
      const result = rewriteLegacyStoragePaths(child, layout)
      changed = changed || result.changed
      nextValue[key] = result.value
    }
    return { value: (changed ? nextValue : value) as T, changed }
  }

  return { value, changed: false }
}

/**
 * 重写单个旧版 userData 路径，并保留原始值的裸路径或 file URL 形式。
 * @param value 待检查的字符串
 * @param layout 旧版与 3.x 数据目录布局
 * @returns 重写后的字符串及是否发生变化
 */
function rewriteLegacyStoragePath(
  value: string,
  layout: ZToolsDataLayout
): LegacyPathRewriteResult<string> {
  let localPath = value
  let isFileUrl = false

  // file URL 必须先解码，才能与包含空格的旧版 userData 路径比较。
  if (value.startsWith('file:')) {
    try {
      localPath = fileURLToPath(value)
      isFileUrl = true
    } catch {
      return { value, changed: false }
    }
  }

  const rebasedPath = rebaseLegacyLocalPath(localPath, layout)
  if (!rebasedPath) return { value, changed: false }

  return {
    value: isFileUrl ? pathToFileURL(rebasedPath).href : rebasedPath,
    changed: true
  }
}

/**
 * 将旧版 userData 内的本地路径映射到 3.x 数据根目录，并拒绝目录外路径。
 * @param localPath 待映射的本地文件路径
 * @param layout 旧版与 3.x 数据目录布局
 * @returns 映射后的路径；不属于旧目录时返回 null
 */
function rebaseLegacyLocalPath(localPath: string, layout: ZToolsDataLayout): string | null {
  const relativePath = path.relative(layout.legacyUserDataPath, localPath)

  // 防止相同字符串前缀或上级目录被误判为旧版数据目录内容。
  if (
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    return null
  }

  return path.join(layout.root, relativePath)
}
