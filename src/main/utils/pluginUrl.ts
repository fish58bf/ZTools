import path from 'path'
import { pathToFileURL } from 'url'

/**
 * RFC 3986 scheme 语法：ALPHA *( ALPHA / DIGIT / "+" / "-" / "." )。
 * 这里要求 scheme 至少 2 个字符，从而把 Windows 盘符（`C:\...`）排除在 scheme 之外。
 */
const URL_SCHEME_PATTERN = /^([a-zA-Z][a-zA-Z0-9+.-]+):/

/** 相对 URL 拆分后的三段 */
export interface PluginUrlParts {
  /** 路径部分，不含 `?` 与 `#`；未提供路径时为空字符串 */
  pathname: string
  /** 查询串，含前导 `?`；无查询时为空字符串 */
  search: string
  /** 哈希串，含前导 `#`；无哈希时为空字符串 */
  hash: string
}

/**
 * 提取 URL 的 scheme 并转为小写。
 *
 * 相对路径返回空字符串，因此 `http-api.html`、`https-test.html` 这类以 http
 * 开头的相对文件名不会被误判为网络地址。
 *
 * @param url 待检测的 URL 或相对路径
 * @returns 小写 scheme；无 scheme 时返回空字符串
 */
export function getUrlScheme(url: string): string {
  const matched = URL_SCHEME_PATTERN.exec(url)
  return matched ? matched[1].toLowerCase() : ''
}

/**
 * 按 WHATWG URL 规范的顺序拆分相对 URL：先切 `#`，再切 `?`。
 *
 * 顺序不可颠倒——先切 `#` 才能让 hash 内部的 `?`（`index.html#/detail?x=2`）不被
 * 误判成 query；后切 `?` 才能让 query 值里的 `?`、`/`、`..` 原样保留。
 *
 * @param url 相对 URL，例如 `index.html?id=1#/detail`
 * @returns 拆分后的 pathname / search / hash
 */
export function splitPluginUrl(url: string): PluginUrlParts {
  const hashIndex = url.indexOf('#')
  const hash = hashIndex === -1 ? '' : url.slice(hashIndex)
  const beforeHash = hashIndex === -1 ? url : url.slice(0, hashIndex)

  const searchIndex = beforeHash.indexOf('?')
  const search = searchIndex === -1 ? '' : beforeHash.slice(searchIndex)
  const pathname = searchIndex === -1 ? beforeHash : beforeHash.slice(0, searchIndex)

  return { pathname, search, hash }
}

/**
 * 把插件传入的 url 解析为可交给 `loadURL` 的绝对 file URL，支持 query 与 hash。
 *
 * - 带 scheme 的绝对 URL 原样透传，同时修正了两斜杠形式 `file://host/x.html`
 *   被旧实现误当相对路径的问题
 * - 相对路径：只对 path 部分做 `path.join` + 百分号编码，query / hash 通过 URL
 *   setter 写回，既不会被 `path.join` 规范化，也不会重复编码已有的 `%XX`
 *
 * @param pluginPath 插件根目录绝对路径（zpx 安装时可能是 `.asar` 实体路径）
 * @param url 相对路径或绝对 URL，可带 `?query` 与 `#hash`
 * @returns 可直接交给 `loadURL` 的最终 URL
 * @throws 当 url 不含路径部分（空串 / 仅 `?a=1` / 仅 `#/a`）时抛错
 */
export function resolvePluginWindowUrl(pluginPath: string, url: string): string {
  // 带 scheme 的绝对 URL 原样透传
  if (getUrlScheme(url)) {
    return url
  }

  const { pathname, search, hash } = splitPluginUrl(url)
  if (!pathname) {
    throw new Error(`createBrowserWindow: url 必须包含 html 文件路径，收到 "${url}"`)
  }

  // 必须用 path.join 而非 path.resolve：join 保持「前导 / 不重置到文件系统根」的既有语义
  const fileUrl = pathToFileURL(path.join(pluginPath, pathname))

  // URL setter 会编码空格与中文等非法字符，但不会重复编码已有的 %XX，
  // 也不会规范化 query / hash 内部的 `..` 与 `/`
  if (search) {
    fileUrl.search = search
  }
  if (hash) {
    fileUrl.hash = hash
  }

  return fileUrl.href
}
