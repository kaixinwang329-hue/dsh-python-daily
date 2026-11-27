/**
 * PEP 440 的轻量解析与比较 —— 独立成模块，方便离线单测。
 * 只求把 dev / a / b / rc / 正式版 / post 的先后关系比对清楚，
 * 不追求实现完整规范（epoch、local version 都不支持，解析不了就返回 null）。
 */

/** 标题可能只是版本号（2.34.2），也可能带项目名（requests 2.34.2） */
export function versionOfTitle(name, title) {
  const text = String(title ?? '').trim()
  const lowered = text.toLowerCase()
  const prefix = `${String(name ?? '').toLowerCase()} `
  return (lowered.startsWith(prefix) ? text.slice(prefix.length) : text).trim()
}

export function parseVersion(raw) {
  const text = String(raw ?? '').trim().replace(/^v/i, '')
  const match = text.match(/^(\d+(?:\.\d+)*)(?:(a|b|rc)(\d+))?(?:\.?(dev|post)(\d+))?$/i)
  if (!match) return null
  const release = match[1].split('.').map((part) => Number(part))
  const preTag = String(match[2] ?? '').toLowerCase()
  const preNumber = Number(match[3] ?? 0)
  const postTag = String(match[4] ?? '').toLowerCase()
  const postNumber = Number(match[5] ?? 0)
  // dev 挂在版本号后面（1.0.dev6）：1.0.dev6 < 1.0a1 < 1.0
  const isDev = preTag === '' && postTag === 'dev'
  // 序：dev < a < b < rc < 正式版 < 正式版.postN
  const preRank = isDev ? 0 : preTag === 'a' ? 1 : preTag === 'b' ? 2 : preTag === 'rc' ? 3 : 4
  // dev 后缀永远排在其宿主版本之前（1.0a1.dev2 < 1.0a1）
  const postRank = postTag === 'dev' ? -1 : postTag === 'post' ? 1 : 0
  return {
    release,
    preRank,
    preNumber,
    postRank,
    postNumber,
    dev: isDev,
    prerelease: preTag !== '' || isDev,
  }
}

/** 返回 -1 / 0 / 1；解析不了就返回 null（调用方自己决定怎么办） */
export function compareVersions(left, right) {
  const a = parseVersion(left)
  const b = parseVersion(right)
  if (!a || !b) return null
  const size = Math.max(a.release.length, b.release.length)
  for (let index = 0; index < size; index += 1) {
    const x = a.release[index] ?? 0
    const y = b.release[index] ?? 0
    if (x !== y) return x < y ? -1 : 1
  }
  if (a.preRank !== b.preRank) return a.preRank < b.preRank ? -1 : 1
  if (a.preNumber !== b.preNumber) return a.preNumber < b.preNumber ? -1 : 1
  if (a.postRank !== b.postRank) return a.postRank < b.postRank ? -1 : 1
  if (a.postNumber !== b.postNumber) return a.postNumber < b.postNumber ? -1 : 1
  return 0
}

export function isPrereleaseVersion(version) {
  return parseVersion(version)?.prerelease === true
}
