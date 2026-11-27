/**
 * python-daily —— 每日 Python 情报（host 半端）
 *
 * 每天定时抓五路信息，合并成一期「当日日报」：
 *   1. 官方博客：Python Insider（Blogger JSON feed）
 *   2. 版本发布：python.org Downloads API v2
 *   3. PEP 动态：peps.python.org/api/peps.json（新建 + 状态变更）
 *   4. PyPI 生态：对被关注的热门包查 releases XML，按 PEP 440 比版本
 *   5. GitHub 项目：GitHub 搜索 API，窗口内新建的 Python 仓库按星标排
 *
 * 产出：
 *   - <数据目录>/reports/YYYY-MM-DD.md   人类可读的 Markdown 日报
 *   - <数据目录>/state.json              各源游标、去重基线、历史日报
 *   - <数据目录>/config.json             用户设置（也可从侧栏页面里改）
 *   - /api/python-daily/*               给 client.js 那份侧栏页面用的 JSON 接口
 *
 * 这个文件不 import 任何 @deepseek-ai/* 包：desktop profile 的 autoInstallPeers
 * 是关的，裸 import 宿主包会让整条插件静默不激活，所以配置 schema、工具定义
 * 这些一律自己手写。只依赖 Node 内置模块 + 全局 fetch。
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { homedir } from 'node:os'
import { compareVersions, isPrereleaseVersion, versionOfTitle } from './src/version.mjs'

export const name = 'python-daily'
export const inject = ['webServer']

const PLUGIN_ID = 'python-daily'
// 注意两件事：
// 1. 不能用 /api/ 开头——那个前缀被 DSH 的 connection 路由占着（会先被它 401 掉），
//    插件自己的接口得像 dshmarket 一样挂在自己的名字下。
// 2. 前缀末尾不能带斜杠：路由匹配是「等于本路径，或以本路径 + / 开头」，
//    写成 /python-daily/ 反而只匹配到它自己。
const ROUTE_PREFIX = '/python-daily'
const USER_AGENT = 'dsh-python-daily/2.0 (personal digest)'
const BOOT_DELAY_MS = 5_000
const CHECK_INTERVAL_MS = 60_000
const RETRY_AFTER_MS = 15 * 60_000
const LOG_ROTATE_BYTES = 256 * 1024
const MAX_DAYS_KEPT = 400

const SOURCE_KEYS = ['blog', 'releases', 'peps', 'packages', 'github']
const FALLBACK_DAYS = { blog: 7, releases: 7, peps: 14, packages: 3, github: 7 }

const SECTION_SPECS = [
  { key: 'blog', zh: '官方博客', en: 'Official blog', hint: 'Python Insider' },
  { key: 'releases', zh: '版本发布', en: 'Releases', hint: 'python.org' },
  { key: 'peps', zh: 'PEP 动态', en: 'PEP updates', hint: 'peps.python.org' },
  { key: 'packages', zh: 'PyPI 更新', en: 'PyPI updates', hint: '被关注的包' },
  { key: 'github', zh: 'GitHub 项目', en: 'GitHub projects', hint: '新建的 Python 仓库', sort: 'stars' },
]
const SECTION_BY_KEY = Object.fromEntries(SECTION_SPECS.map((spec) => [spec.key, spec]))

const DEFAULT_PACKAGES = [
  'requests',
  'httpx',
  'aiohttp',
  'pydantic',
  'fastapi',
  'django',
  'flask',
  'sqlalchemy',
  'numpy',
  'pandas',
  'polars',
  'scikit-learn',
  'jupyterlab',
  'pytest',
  'ruff',
  'mypy',
  'uv',
  'poetry',
  'openai',
  'anthropic',
]

const DEFAULT_CONFIG = {
  enabled: true,
  hour: 9,
  minute: 0,
  maxPerSection: 8,
  keepDays: 30,
  includePrerelease: true,
  packages: DEFAULT_PACKAGES,
  reportsDir: '',
}

/* ------------------------------------------------------------------ 路径 */

function dshHome() {
  const fromEnv = String(process.env.DSH_HOME ?? '').trim()
  return fromEnv || join(homedir(), '.dsh')
}

/**
 * 数据放哪儿，优先级从高到低：
 *   1. 环境变量 PYTHON_DAILY_DATA_DIR（绝对路径）
 *   2. $DSH_HOME/python-daily/data-dir.txt 里写的一个绝对路径（搬家不用改环境变量）
 *   3. $DSH_HOME/python-daily（默认，跟着 DSH 自己的目录走，跨平台）
 * 状态、日志、日报、设置全在这个目录里，删掉就等于清零重来。
 */
const DATA_DIR_MARKER = 'data-dir.txt'

// 不缓存结果：宿主热重载时模块实例可能仍留在 ESM 缓存里，缓存住就会一直用旧目录。
function dataDir() {
  const home = join(dshHome(), PLUGIN_ID)
  const fromEnv = String(process.env.PYTHON_DAILY_DATA_DIR ?? '').trim()
  if (fromEnv && isAbsolute(fromEnv)) {
    return fromEnv
  }
  try {
    const marker = String(readFileSync(join(home, DATA_DIR_MARKER), 'utf8')).trim()
    if (marker && isAbsolute(marker)) {
      return marker
    }
  } catch {
    /* 没有标记文件就走默认目录 */
  }
  return home
}

function configFile() {
  return join(dataDir(), 'config.json')
}

function stateFile() {
  return join(dataDir(), 'state.json')
}

function logFile() {
  return join(dataDir(), 'log.txt')
}

function reportsDirOf(config) {
  const custom = String(config?.reportsDir ?? '').trim()
  if (!custom) return join(dataDir(), 'reports')
  return isAbsolute(custom) ? custom : join(dataDir(), custom)
}

function reportFileOf(config, date) {
  return join(reportsDirOf(config), `${date}.md`)
}

function ensureDir(dir) {
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    /* 建目录失败交给后续写入报错 */
  }
}

/* ------------------------------------------------------------ 小工具 */

function messageOf(error) {
  if (!error) return '未知错误'
  if (typeof error === 'string') return error
  return String(error.message ?? error)
}

function readJson(file, fallback) {
  try {
    if (!existsSync(file)) return fallback
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(file, value) {
  try {
    ensureDir(dirname(file))
    const temp = `${file}.tmp`
    writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
    renameSync(temp, file)
    return true
  } catch (error) {
    log(`写文件失败 ${file}: ${messageOf(error)}`)
    return false
  }
}

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`
  if (process.env.PYTHON_DAILY_DEBUG === '1') console.log(`[python-daily] ${message}`)
  try {
    const file = logFile()
    ensureDir(dirname(file))
    if (existsSync(file) && statSync(file).size > LOG_ROTATE_BYTES) {
      const tail = readFileSync(file, 'utf8').split('\n').slice(-200).join('\n')
      writeFileSync(file, `${tail.replace(/\n+$/, '')}\n`, 'utf8')
    }
    appendFileSync(file, `${line}\n`, 'utf8')
  } catch {
    /* 日志写不进去不影响任何功能 */
  }
}

/* ------------------------------------------------------------------ 时间 */

const pad2 = (value) => String(value).padStart(2, '0')

/** 本地时区的 YYYY-MM-DD */
function keyOfDay(input) {
  const at = input instanceof Date ? input : new Date(input)
  return `${at.getFullYear()}-${pad2(at.getMonth() + 1)}-${pad2(at.getDate())}`
}

function fmtStamp(input) {
  const at = input instanceof Date ? input : new Date(input)
  if (!Number.isFinite(at.getTime())) return '—'
  return `${at.getFullYear()}-${pad2(at.getMonth() + 1)}-${pad2(at.getDate())} ${pad2(at.getHours())}:${pad2(at.getMinutes())}`
}

function startOfDay(input) {
  const at = new Date(input)
  at.setHours(0, 0, 0, 0)
  return at
}

const PEP_MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 }

/** PEP 的 created 形如 "13-Jun-2000"；解析成本地中午，避免时区把日期挪一天 */
function parsePepDate(value) {
  const text = String(value ?? '').trim()
  if (!text) return null
  const matched = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(text)
  if (matched) {
    const month = PEP_MONTHS[matched[2].toLowerCase()]
    if (month === undefined) return null
    const at = new Date(Number(matched[3]), month, Number(matched[1]), 12, 0, 0, 0)
    return Number.isFinite(at.getTime()) ? at : null
  }
  const parsed = new Date(text)
  return Number.isFinite(parsed.getTime()) ? parsed : null
}

function pepUrl(number) {
  return `https://peps.python.org/pep-${String(number).padStart(4, '0')}/`
}

/* ------------------------------------------------------------------ 文本 */

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
}

function decodeCodePoint(raw) {
  const code = Number(raw)
  if (!Number.isInteger(code) || code <= 0 || code > 0x10ffff) return ' '
  try {
    return String.fromCodePoint(code)
  } catch {
    return ' '
  }
}

/** 把 Blogger 那种 HTML 正文压成一行纯文本，给摘要用 */
function decodeText(input) {
  const text = String(input ?? '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|blockquote|pre)>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => decodeCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => decodeCodePoint(dec))
    .replace(/&([a-zA-Z]+);/g, (matched, text2) => NAMED_ENTITIES[text2.toLowerCase()] ?? matched)
  return text.replace(/\s+/g, ' ').trim()
}

function trimText(input, limit) {
  const text = String(input ?? '').replace(/\s+/g, ' ').trim()
  if (!Number.isFinite(limit) || text.length <= limit) return text
  return `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}…`
}

function escapeInline(input) {
  return String(input ?? '').replace(/([\\[\]])/g, '\\$1')
}

/* ------------------------------------------------------------------ 配置 */

function normalizePackages(input) {
  const result = []
  const seen = new Set()
  for (const raw of Array.isArray(input) ? input : []) {
    const name = String(raw ?? '').trim().toLowerCase()
    if (!name || seen.has(name)) continue
    if (!/^[a-z0-9][a-z0-9._-]{0,99}$/.test(name)) continue
    seen.add(name)
    result.push(name)
    if (result.length >= 40) break
  }
  return result.length ? result : DEFAULT_PACKAGES
}

function sanitizeConfig(input, base) {
  const raw = input && typeof input === 'object' ? input : {}
  const next = { ...(base ?? DEFAULT_CONFIG) }
  if (typeof raw.enabled === 'boolean') next.enabled = raw.enabled
  const hour = Number(raw.hour)
  if (Number.isInteger(hour) && hour >= 0 && hour <= 23) next.hour = hour
  const minute = Number(raw.minute)
  if (Number.isInteger(minute) && minute >= 0 && minute <= 59) next.minute = minute
  const maxPerSection = Number(raw.maxPerSection)
  if (Number.isInteger(maxPerSection) && maxPerSection >= 3 && maxPerSection <= 30) next.maxPerSection = maxPerSection
  const keepDays = Number(raw.keepDays)
  if (Number.isInteger(keepDays) && keepDays >= 1 && keepDays <= 365) next.keepDays = keepDays
  if (typeof raw.includePrerelease === 'boolean') next.includePrerelease = raw.includePrerelease
  if (Array.isArray(raw.packages)) next.packages = normalizePackages(raw.packages)
  if (typeof raw.reportsDir === 'string') next.reportsDir = raw.reportsDir.trim().slice(0, 400)
  return next
}

function loadConfig() {
  const stored = readJson(configFile(), null)
  return sanitizeConfig(stored ?? {}, DEFAULT_CONFIG)
}

function saveConfig(input) {
  const next = sanitizeConfig(input, loadConfig())
  writeJson(configFile(), next)
  return next
}

/* ------------------------------------------------------------------ 状态 */

function emptyState() {
  return {
    version: 1,
    lastRunAt: null,
    lastRun: null,
    cursors: {},
    days: {},
    seen: { pepStatus: {}, packages: {} },
  }
}

function loadState() {
  const stored = readJson(stateFile(), null)
  const state = emptyState()
  if (!stored || typeof stored !== 'object') return state
  if (typeof stored.lastRunAt === 'string') state.lastRunAt = stored.lastRunAt
  if (stored.lastRun && typeof stored.lastRun === 'object') state.lastRun = stored.lastRun
  if (stored.cursors && typeof stored.cursors === 'object') state.cursors = stored.cursors
  if (stored.days && typeof stored.days === 'object') state.days = stored.days
  const seen = stored.seen && typeof stored.seen === 'object' ? stored.seen : {}
  if (seen.pepStatus && typeof seen.pepStatus === 'object') state.seen.pepStatus = seen.pepStatus
  if (seen.packages && typeof seen.packages === 'object') state.seen.packages = seen.packages
  return state
}

function saveState(state) {
  const keys = Object.keys(state.days ?? {}).sort((a, b) => b.localeCompare(a)).slice(0, MAX_DAYS_KEPT)
  const trimmedDays = {}
  for (const key of keys) trimmedDays[key] = state.days[key]
  writeJson(stateFile(), { ...state, days: trimmedDays })
}

function pruneDays(state, keepDays) {
  const cutoff = startOfDay(new Date())
  cutoff.setDate(cutoff.getDate() - Math.max(1, keepDays) + 1)
  const cutoffKey = keyOfDay(cutoff)
  let removed = 0
  for (const key of Object.keys(state.days ?? {})) {
    if (key < cutoffKey) {
      delete state.days[key]
      removed += 1
    }
  }
  return removed
}

function listDays(state) {
  const entries = Object.entries(state?.days ?? {})
  entries.sort((left, right) => right[0].localeCompare(left[0]))
  return entries.slice(0, 200).map(([date, digest]) => ({
    date,
    total: digest?.counts?.total ?? 0,
    trigger: digest?.trigger ?? 'auto',
    generatedAt: digest?.generatedAt ?? null,
    failures: Array.isArray(digest?.failures) ? digest.failures.length : 0,
  }))
}

function windowFor(state, key, fallbackDays, now) {
  const cursor = state?.cursors?.[key]
  if (typeof cursor === 'string' && cursor) {
    const at = new Date(cursor)
    if (Number.isFinite(at.getTime()) && at.getTime() < now.getTime()) return at
  }
  return new Date(now.getTime() - fallbackDays * 86_400_000)
}

/* ------------------------------------------------------------------ 网络 */

/** 把 fetch 的底层原因（DNS/TLS/超时）带出来，光看 "fetch failed" 没法排查。 */
function describeFetchError(error) {
  const cause = error?.cause
  const detail = [cause?.code, cause?.message, cause?.errno].filter(Boolean).join(' / ')
  const who = cause?.hostname ? ` @${cause.hostname}` : ''
  const base = error?.message || String(error)
  if (base === 'fetch failed' && detail) return `fetch failed (${detail}${who})`
  return detail && !base.includes(detail) ? `${base} (${detail}${who})` : base
}

function isRetryableNetworkError(error) {
  if (!error) return false
  const name = String(error.name || '')
  const message = String(error.message || '')
  // 超时也值得再试一次：家用网络偶尔就是慢（PyPI 的 aiohttp JSON 有 9MB）。
  if (name === 'TimeoutError' || /timed?\s?out|aborted due to timeout/i.test(message)) return true
  if (name === 'AbortError') return false
  return /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up|other side closed|terminated/i.test(
    message,
  )
}

async function fetchTextOnce(url, timeoutMs, init) {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      'user-agent': USER_AGENT,
      accept: 'application/json, application/atom+xml, application/rss+xml, text/xml;q=0.9, */*;q=0.8',
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      ...(init?.headers ?? {}),
    },
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    const hint = response.status === 403 || response.status === 429 ? '（接口限流，可在环境变量里加 GITHUB_TOKEN 提高额度）' : ''
    throw new Error(`HTTP ${response.status} ${url}${hint}${body ? `: ${trimText(body, 160)}` : ''}`)
  }
  return await response.text()
}

/**
 * 抓一段文本。家用网络上偶尔会撞上 DNS 冷启动（Node 报 "fetch failed"），
 * 而重试一次几乎必然成功，所以这里对网络层错误重试一次再放弃。
 */
async function fetchText(url, timeoutMs = 20_000, init) {
  try {
    return await fetchTextOnce(url, timeoutMs, init)
  } catch (error) {
    if (!isRetryableNetworkError(error)) throw new Error(describeFetchError(error))
    await new Promise((resolve) => setTimeout(resolve, 1_500))
    try {
      return await fetchTextOnce(url, timeoutMs, init)
    } catch (retryError) {
      throw new Error(describeFetchError(retryError))
    }
  }
}

async function fetchJson(url, timeoutMs = 20_000, init) {
  const body = await fetchText(url, timeoutMs, init)
  try {
    return JSON.parse(body)
  } catch {
    throw new Error(`返回的不是 JSON：${url}`)
  }
}

/* ------------------------------------------------------------------ 采集 */

/** RSS/Atom 里的一个标签内容：先去 CDATA 再去 HTML */
function pickTag(block, tag) {
  const matcher = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')
  const found = String(block ?? '').match(matcher)
  if (!found) return ''
  return decodeText(found[1].replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, ''))
}

/** blog.python.org 实际返回的是 RSS 2.0（alt=json 也照样给 XML），所以自己拆 */
function parseRssItems(xml) {
  const blocks = String(xml ?? '').match(/<item\b[\s\S]*?<\/item>/gi) ?? []
  const items = []
  for (const block of blocks) {
    const link = pickTag(block, 'link')
    if (!link) continue
    const tags = []
    for (const hit of block.matchAll(/<category\b[^>]*>([\s\S]*?)<\/category>/gi)) {
      const tag = decodeText(hit[1].replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, ''))
      if (tag && !tags.includes(tag)) tags.push(tag)
    }
    items.push({
      title: pickTag(block, 'title'),
      link,
      published: pickTag(block, 'pubDate') || pickTag(block, 'updated'),
      summary: pickTag(block, 'description') || pickTag(block, 'summary') || pickTag(block, 'content'),
      tags,
    })
  }
  return items
}

/** 官方博客：Python Insider 的 RSS 源，不需要 key */
async function fetchBlog(since, options = {}) {
  const url = 'https://blog.python.org/feeds/posts/default?alt=json&max-results=40'
  const xml = await fetchText(url, 25_000)
  const rows = parseRssItems(xml)
  const all = []
  for (const row of rows) {
    const href = String(row.link ?? '').trim()
    if (!/^https?:\/\//.test(href)) continue
    const at = row.published ? new Date(row.published) : null
    if (!at || !Number.isFinite(at.getTime())) continue
    const title = trimText(row.title, 160)
    if (!title) continue
    all.push({
      id: `blog:${href}`,
      kind: 'blog',
      title,
      url: href,
      date: at.toISOString(),
      meta: fmtStamp(at),
      summary: trimText(row.summary, 320),
      tags: row.tags.filter((tag) => tag.length <= 24).slice(0, 4),
    })
  }
  all.sort(compareItems)
  // 博客更新稀疏：首次运行窗口里空着的话，给最近 3 篇当见面礼，别让第一屏是空的
  const items = all.filter((item) => new Date(item.date) >= since)
  const picked = items.length || !options.firstRun ? items : all.slice(0, 3)
  return { items: picked.slice(0, 12), note: items.length || !options.firstRun ? '' : '首次运行，先看最近 3 篇' }
}

/** CPython / Python 新版本：python.org 的 Downloads API v2 */
async function fetchReleases(since, config) {
  const url = 'https://www.python.org/api/v2/downloads/release/?is_published=true'
  const payload = await fetchJson(url, 25_000)
  const rows = Array.isArray(payload) ? payload : []
  const from = startOfDay(since)
  const items = []
  for (const row of rows) {
    if (!row || row.is_published === false) continue
    const dateText = String(row.release_date ?? '').trim()
    // python.org 给的是完整时间戳（2026-11-18T02:31:14Z），旧接口给过纯日期，两种都吃
    const at = dateText ? new Date(dateText.includes('T') ? dateText : `${dateText}T12:00:00`) : null
    if (!at || !Number.isFinite(at.getTime()) || at < from) continue
    const preRelease = row.pre_release === true
    if (preRelease && !config.includePrerelease) continue
    const slug = String(row.slug ?? row.version ?? '').trim()
    const name = String(row.name ?? '').trim() || (slug ? `Python ${slug}` : '')
    if (!slug || !name) continue
    const tags = [preRelease ? '预发布' : '正式版']
    if (row.is_latest === true) tags.push('最新')
    items.push({
      id: `release:${slug}`,
      kind: 'releases',
      title: name.startsWith('Python') ? name : `Python ${name}`,
      url: String(row.release_page ?? 'https://www.python.org/downloads/'),
      date: at.toISOString(),
      meta: fmtStamp(at),
      summary: '',
      tags,
    })
  }
  items.sort(compareItems)
  return { items: items.slice(0, 12) }
}

/** PEP：新建（created 落在窗口内）+ 状态变更（与上一份基线比对） */
async function fetchPeps(since, state) {
  const url = 'https://peps.python.org/api/peps.json'
  const payload = await fetchJson(url, 30_000)
  const source = payload && typeof payload === 'object' ? payload : {}
  const previous = state?.seen?.pepStatus ?? {}
  const statuses = {}
  const fresh = []
  const changed = []
  for (const [key, pep] of Object.entries(source)) {
    const number = Number(pep?.number ?? key)
    if (!Number.isInteger(number) || number <= 0) continue
    const status = String(pep?.status ?? '').trim()
    const created = parsePepDate(pep?.created)
    const authors = Array.isArray(pep?.authors) ? pep.authors.join(', ') : String(pep?.authors ?? '')
    const id = String(number)
    statuses[id] = status
    const base = {
      kind: 'peps',
      number,
      title: `PEP ${number}: ${trimText(decodeText(pep?.title ?? ''), 120)}`,
      url: pepUrl(number),
      summary: trimText([status && `状态 ${status}`, authors].filter(Boolean).join(' · '), 200),
    }
    if (created && created >= startOfDay(since)) {
      fresh.push({
        ...base,
        id: `pep-new:${number}`,
        date: created.toISOString(),
        meta: fmtStamp(created),
        tags: ['新建', status].filter(Boolean),
      })
      continue
    }
    const before = previous[id]
    if (before && status && before !== status) {
      changed.push({
        ...base,
        id: `pep-chg:${number}:${status}`,
        date: null,
        meta: '',
        change: { from: before, to: status },
        tags: ['状态变更'],
      })
    }
  }
  fresh.sort(compareItems)
  changed.sort((left, right) => right.number - left.number)
  return { items: [...fresh, ...changed].slice(0, 14), statuses }
}

/**
 * 某个包最新的一版。
 *
 * 首选 PyPI 的 releases.xml：十几 KB、还自带发布时间，几十个包扫一遍也就几秒。
 * 退路才是 /pypi/<name>/json —— 大包（aiohttp 9.4MB、numpy 3.8MB）在这台机器上
 * 要几十秒，走它必然超时。
 *
 * 注意 feed 是按「上传时间」排的，第一条不一定是版本号最大的那条
 * （django 打 5.2 LTS 补丁时，5.2.19 会比 6.1.3 更晚出现），所以这里取「稳定版里最大的」。
 */
async function latestReleaseOf(name) {
  const feedUrl = `https://pypi.org/rss/project/${encodeURIComponent(name)}/releases.xml`
  let feedError = ''
  try {
    const xml = await fetchText(feedUrl, 15_000)
    const rows = []
    for (const row of parseRssItems(xml)) {
      const version = versionOfTitle(name, row?.title)
      if (!version) continue
      const at = row?.published ? new Date(row.published) : null
      rows.push({
        version,
        url: String(row?.link ?? '').trim() || `https://pypi.org/project/${name}/${version}/`,
        at: at && Number.isFinite(at.getTime()) ? at : null,
        summary: trimText(row?.summary, 200),
      })
    }
    const stable = rows.filter((row) => !isPrereleaseVersion(row.version))
    const pool = stable.length ? stable : rows
    let best = null
    for (const row of pool) {
      if (!best) {
        best = row
        continue
      }
      const order = compareVersions(row.version, best.version)
      if (order === 1) best = row
    }
    if (best) return best
    feedError = 'RSS 里没有可用的版本号'
  } catch (error) {
    feedError = messageOf(error)
  }

  const payload = await fetchJson(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`, 20_000)
  const info = payload?.info ?? {}
  const version = String(info.version ?? '').trim()
  const uploads = (Array.isArray(payload?.urls) ? payload.urls : [])
    .map((file) => String(file?.upload_time_iso_8601 ?? '').trim())
    .filter(Boolean)
    .sort()
  const latestUpload = uploads.length ? uploads[uploads.length - 1] : null
  const at = latestUpload ? new Date(latestUpload) : null
  return {
    version,
    url: version ? `https://pypi.org/project/${name}/${version}/` : `https://pypi.org/project/${name}/`,
    at: at && Number.isFinite(at.getTime()) ? at : null,
    summary: trimText(info.summary ?? '', 200),
    note: feedError,
  }
}

/** PyPI：只报「版本号变了」的包；第一次见到某个包只记基线，不当作更新 */
async function fetchPackages(config, state) {
  const names = [...new Set(Array.isArray(config.packages) ? config.packages : DEFAULT_PACKAGES)].slice(0, 40)
  const previous = state?.seen?.packages ?? {}
  const versions = { ...previous }
  const items = []
  const failures = []
  let cursor = 0
  const workerCount = Math.max(1, Math.min(6, names.length))

  const probe = async (name) => {
    const latest = await latestReleaseOf(name)
    const version = String(latest?.version ?? '').trim()
    if (!version) return
    const before = previous[name]
    if (!before || before === version) {
      versions[name] = version
      return
    }
    // feed 只覆盖最近 40 次上传：万一基线比 feed 里最大的还新（老的正式版已经滑出去了），
    // 那这条多半是维护分支的回补，别当升级报，也别把基线往回退。
    const order = compareVersions(version, before)
    if (order !== null && order <= 0) return
    versions[name] = version
    const at = latest.at ?? null
    items.push({
      id: `pkg:${name}:${version}`,
      kind: 'packages',
      title: `${name} ${version}`,
      url: latest.url,
      date: at ? at.toISOString() : null,
      meta: at ? fmtStamp(at) : '',
      change: { from: before, to: version },
      summary: latest.summary ?? '',
      tags: ['PyPI'],
    })
  }

  const worker = async () => {
    while (cursor < names.length) {
      const name = names[cursor]
      cursor += 1
      try {
        await probe(name)
      } catch (error) {
        failures.push({ name, error: messageOf(error) })
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()))

  // 并发跑完再串行补一轮：偶尔一两个会被网络掐掉，补测时不会再有并发竞争。
  if (failures.length) {
    const retryList = failures.splice(0, failures.length)
    for (const entry of retryList) {
      try {
        await probe(entry.name)
      } catch (error) {
        failures.push({ name: entry.name, error: messageOf(error) })
      }
    }
  }

  items.sort(compareItems)
  if (failures.length) log(`PyPI 查询有 ${failures.length} 个失败：${failures.slice(0, 3).map((f) => `${f.name}: ${f.error}`).join(' / ')}`)
  return { items: items.slice(0, 16), versions, note: failures.length ? `${failures.length} 个包查询失败` : '' }
}

/* ------------------------------------------------------- GitHub 项目 */

const GITHUB_SEARCH = 'https://api.github.com/search/repositories'

/** 星标数压成 1.2k 这种短写法，列表里不占地方 */
function formatStars(count) {
  const value = Number(count) || 0
  if (value >= 100_000) return `${Math.round(value / 1000)}k`
  if (value >= 10_000) return `${Math.round(value / 1000)}k`
  if (value >= 1_000) return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return String(value)
}

/** 有 token 就用（未登录的搜索接口只给 10 次/分钟），没有也能跑，一天一次远够 */
function githubHeaders() {
  const token = String(process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? '').trim()
  const headers = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
  }
  if (token) headers.authorization = `Bearer ${token}`
  return { headers }
}

/**
 * 两条路合起来用：
 *   1. 搜索接口 —— 窗口内新建的 Python 仓库，按星标排序。要 token 额度（未登录 10 次/分钟，
 *      出口 IP 共享时可能被占满），但它是「每天都真有一批新项目」的正主，先试它。
 *   2. Trending 页面 —— 今天涨星最多的 Python 仓库，不需要额度，但这条线路（github.com 的
 *      HTML）在这台机器上时不时连不上，所以只当退路/补充。
 * 两条路都给 id = gh:<owner/repo>，同一天重复刷不会重复收录。
 */
async function fetchGithub(since) {
  let searchError = null
  try {
    const created = await fetchGithubSearch(since)
    if (created.items.length) return created
  } catch (error) {
    searchError = error
    log(`GitHub 搜索接口失败，改用 Trending 页面：${messageOf(error)}`)
  }
  try {
    const trending = await fetchTrendingPython()
    if (trending.length) {
      return {
        items: trending.slice(0, 30),
        note: searchError ? '搜索接口不可用，这里显示今日热门项目' : '今天没有新建仓库，这里显示今日热门项目',
      }
    }
  } catch (error) {
    log(`GitHub Trending 也失败了：${messageOf(error)}`)
  }
  if (searchError) throw searchError
  return { items: [], note: '今天没有新建的 Python 仓库' }
}
function parseTrendingBlock(block) {
  const heading = String(block).match(/<h2[\s\S]*?<\/h2>/)?.[0] ?? ''
  const repo = heading.match(/href="\/([\w.-]+\/[\w.-]+)"/)?.[1] ?? ''
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return null
  const description = decodeText(String(block).match(/<p class="[^"]*\bcol-9\b[^"]*">([\s\S]*?)<\/p>/)?.[1] ?? '')
  const today = String(block).match(/([\d,]+)\s+stars?\s+today/i)
  return { repo, description, starsText: today?.[1] ?? '', stars: Number(String(today?.[1] ?? '').replace(/,/g, '')) || 0 }
}

async function fetchTrendingPython() {
  const html = await fetchText('https://github.com/trending/python?since=daily', 30_000)
  const items = []
  const seen = new Set()
  for (const block of html.split('<article class="Box-row">').slice(1)) {
    const parsed = parseTrendingBlock(block)
    if (!parsed || seen.has(parsed.repo)) continue
    seen.add(parsed.repo)
    items.push({
      id: `gh:${parsed.repo}`,
      kind: 'github',
      title: parsed.repo,
      url: `https://github.com/${parsed.repo}`,
      date: null,
      meta: parsed.starsText ? `今日 +${parsed.starsText} ★` : '今日热门',
      summary: trimText(parsed.description, 180),
      tags: ['GitHub'],
      stars: parsed.stars,
    })
  }
  items.sort((left, right) => right.stars - left.stars)
  return items
}

async function fetchGithubSearch(since) {
  const created = keyOfDay(since)
  const query = `language:python created:>=${created}`
  const search = new URLSearchParams({ q: query, sort: 'stars', order: 'desc', per_page: '50' })
  const payload = await fetchJson(`${GITHUB_SEARCH}?${search.toString()}`, 25_000, githubHeaders())
  const rows = Array.isArray(payload?.items) ? payload.items : []
  const items = []
  for (const row of rows) {
    if (!row || row.fork === true) continue
    const fullName = String(row.full_name ?? '').trim()
    const url = String(row.html_url ?? '').trim()
    const createdAt = new Date(row.created_at)
    if (!fullName || !/^https:\/\/github\.com\//.test(url)) continue
    // 搜索接口的 created:>= 只精确到天，拿回来再按真正的窗口起点滤一遍，免得跨天重复报。
    if (!Number.isFinite(createdAt.getTime()) || createdAt.getTime() < since.getTime()) continue
    const stars = Number(row.stargazers_count) || 0
    const topics = (Array.isArray(row.topics) ? row.topics : [])
      .map((topic) => String(topic ?? '').trim())
      .filter(Boolean)
      .slice(0, 3)
    items.push({
      id: `gh:${fullName}`,
      kind: 'github',
      title: fullName,
      url,
      date: createdAt.toISOString(),
      meta: `★ ${formatStars(stars)} · 创建于 ${fmtStamp(createdAt)}`,
      summary: trimText(row.description ?? '', 180),
      tags: ['GitHub', ...topics],
      stars,
    })
  }
  items.sort((left, right) => right.stars - left.stars)
  return { items: items.slice(0, 30), note: rows.length ? '' : '窗口内没有新建的 Python 仓库' }
}

const COLLECTORS = {
  blog: ({ windows, options }) => fetchBlog(windows.blog, options),
  releases: ({ windows, config }) => fetchReleases(windows.releases, config),
  peps: ({ windows, state }) => fetchPeps(windows.peps, state),
  packages: ({ config, state }) => fetchPackages(config, state),
  github: ({ windows }) => fetchGithub(windows.github),
}

/* -------------------------------------------------------------- 合并与统计 */

function compareItems(left, right) {
  const leftDate = left?.date ?? ''
  const rightDate = right?.date ?? ''
  if (leftDate !== rightDate) return rightDate.localeCompare(leftDate)
  return String(left?.title ?? '').localeCompare(String(right?.title ?? ''))
}

/** 板块自己的排序规则：默认按日期倒序，GitHub 那种按星标倒序更合理 */
function comparatorFor(spec) {
  if (spec?.sort === 'stars') {
    return (left, right) => {
      const diff = (Number(right?.stars) || 0) - (Number(left?.stars) || 0)
      return diff !== 0 ? diff : compareItems(left, right)
    }
  }
  return compareItems
}

function mergeItems(previous, incoming, limit, spec) {
  const byId = new Map()
  for (const item of [...(Array.isArray(previous) ? previous : []), ...incoming]) {
    if (!item || typeof item.id !== 'string' || !item.id) continue
    byId.set(item.id, { ...(byId.get(item.id) ?? {}), ...item })
  }
  const merged = [...byId.values()].sort(comparatorFor(spec))
  const cap = Math.max(1, Math.min(30, Number(limit) || DEFAULT_CONFIG.maxPerSection))
  return merged.slice(0, cap)
}

function countsOf(sections) {
  const counts = { total: 0 }
  for (const key of SOURCE_KEYS) {
    const count = Array.isArray(sections?.[key]) ? sections[key].length : 0
    counts[key] = count
    counts.total += count
  }
  return counts
}

/* -------------------------------------------------------------- 日报生成 */

function renderReport(config, digest) {
  const counts = digest.counts ?? countsOf(digest.sections)
  const lines = []
  lines.push(`# Python 每日情报 · ${digest.date}`)
  lines.push('')
  lines.push(
    `> 采集窗口 ${fmtStamp(digest.window?.from)} → ${fmtStamp(digest.window?.to)} ｜ 生成于 ${fmtStamp(digest.generatedAt)} ｜ 共 ${counts.total} 条`,
  )
  lines.push('')
  lines.push('| 板块 | 新增 |')
  lines.push('| --- | ---: |')
  for (const spec of SECTION_SPECS) lines.push(`| ${spec.zh} | ${counts[spec.key] ?? 0} |`)
  lines.push('')

  for (const spec of SECTION_SPECS) {
    const items = Array.isArray(digest.sections?.[spec.key]) ? digest.sections[spec.key] : []
    lines.push(`## ${spec.zh}${items.length ? `（${items.length}）` : ''}`)
    lines.push('')
    const note = String(digest.sources?.[spec.key]?.note ?? '').trim()
    if (note) {
      lines.push(`_${escapeInline(note)}_`)
      lines.push('')
    }
    if (!items.length) {
      lines.push('_本窗口内暂无新条目。_')
      lines.push('')
      continue
    }
    for (const item of items) {
      const meta = [item.meta, ...(item.tags ?? [])].filter(Boolean).join(' · ')
      const change = item.change ? `~~${escapeInline(item.change.from)}~~ → **${escapeInline(item.change.to)}**` : ''
      const tailText = [meta, change].filter(Boolean).join(' · ')
      lines.push(`- [${escapeInline(item.title)}](<${item.url}>)${tailText ? ` — ${tailText}` : ''}`)
      if (item.summary) lines.push(`  > ${item.summary}`)
    }
    lines.push('')
  }

  const failures = Array.isArray(digest.failures) ? digest.failures : []
  if (failures.length) {
    lines.push('## 采集异常')
    lines.push('')
    for (const failure of failures) lines.push(`- ${failure}`)
    lines.push('')
  }

  lines.push('---')
  lines.push(`由 python-daily 生成 · 数据目录 \`${dataDir()}\` · 日报目录 \`${reportsDirOf(config)}\``)
  lines.push('')
  return lines.join('\n')
}

function writeReport(config, digest) {
  const file = reportFileOf(config, digest.date)
  try {
    ensureDir(dirname(file))
    const temp = `${file}.tmp`
    writeFileSync(temp, renderReport(config, digest), 'utf8')
    renameSync(temp, file)
    return file
  } catch (error) {
    log(`写日报失败 ${file}: ${messageOf(error)}`)
    return null
  }
}

/* ------------------------------------------------------------------ 采集流程 */

let runningPromise = null
let nextRetryAt = 0

async function runCollection(trigger) {
  if (runningPromise) return runningPromise
  runningPromise = executeRun(trigger).finally(() => {
    runningPromise = null
  })
  return runningPromise
}

async function executeRun(trigger) {
  try {
    return await executeRunInner(trigger)
  } catch (error) {
    log(`采集整体失败：${messageOf(error)}`)
    nextRetryAt = Date.now() + RETRY_AFTER_MS
    return null
  }
}

async function executeRunInner(trigger) {
  const startedAt = new Date()
  const config = loadConfig()
  const state = loadState()
  const today = keyOfDay(startedAt)
  const previous = state.days?.[today] ?? null

  const windows = {}
  for (const key of SOURCE_KEYS) windows[key] = windowFor(state, key, FALLBACK_DAYS[key], startedAt)
  const windowFrom = new Date(Math.min(...SOURCE_KEYS.map((key) => windows[key].getTime())))

  const collected = {}
  const sources = {}
  const failures = []
  const firstRun = !state.lastRunAt

  await Promise.all(
    SOURCE_KEYS.map(async (key) => {
      try {
        const result = await COLLECTORS[key]({ windows, config, options: { firstRun }, state })
        collected[key] = result
        sources[key] = { ok: true, count: result.items.length, note: result.note ?? '' }
      } catch (error) {
        collected[key] = null
        sources[key] = { ok: false, count: 0, note: '', error: messageOf(error) }
        failures.push(`${SECTION_BY_KEY[key].zh}：${messageOf(error)}`)
        log(`采集失败 ${key}: ${messageOf(error)}`)
      }
    }),
  )

  const sections = {}
  for (const key of SOURCE_KEYS) {
    const incoming = Array.isArray(collected[key]?.items) ? collected[key].items : []
    sections[key] = mergeItems(previous?.sections?.[key] ?? [], incoming, config.maxPerSection, SECTION_BY_KEY[key])
  }

  const finishedAt = new Date()
  const digest = {
    date: today,
    trigger,
    firstAt: previous?.firstAt ?? startedAt.toISOString(),
    generatedAt: finishedAt.toISOString(),
    window: { from: windowFrom.toISOString(), to: finishedAt.toISOString() },
    sections,
    counts: countsOf(sections),
    sources,
    failures,
  }

  const succeeded = SOURCE_KEYS.filter((key) => sources[key].ok).length
  // 只有「今天已经有日报」或「这一轮至少抓到一个源」才落盘；
  // 反之全部失败就好聚好散，让 15 分钟后的重试还有机会补上今天的日报。
  const writeDigest = succeeded > 0 || Boolean(previous)

  if (writeDigest) {
    state.days[today] = digest
    const reportPath = writeReport(config, digest)
    digest.reportFile = reportPath
    writeJson(stateFile(), { ...state })
  }

  for (const key of SOURCE_KEYS) {
    if (sources[key].ok) state.cursors[key] = startedAt.toISOString()
  }
  if (collected.peps?.statuses) state.seen.pepStatus = collected.peps.statuses
  if (collected.packages?.versions) state.seen.packages = collected.packages.versions

  const pruned = pruneDays(state, config.keepDays)
  state.lastRunAt = finishedAt.toISOString()
  state.lastRun = {
    at: finishedAt.toISOString(),
    trigger,
    ok: succeeded > 0,
    succeeded,
    failed: SOURCE_KEYS.length - succeeded,
    errors: failures,
    counts: countsOf(sections),
    prunedDays: pruned,
    durationMs: finishedAt.getTime() - startedAt.getTime(),
  }
  saveState(state)

  if (succeeded === 0) {
    nextRetryAt = Date.now() + RETRY_AFTER_MS
    log(`本轮所有数据源都失败，${Math.round(RETRY_AFTER_MS / 60_000)} 分钟后重试`)
  } else {
    nextRetryAt = 0
    log(`采集完成（触发：${trigger}）：${countsOf(sections).total} 条，失败 ${SOURCE_KEYS.length - succeeded} 个源`)
  }

  return writeDigest ? digest : null
}

/* -------------------------------------------------------------- 自动定时 */

function nextRunDescriptor(config, state) {
  if (!config.enabled) return { enabled: false, due: false, at: null }
  const now = new Date()
  const today = keyOfDay(now)
  const done = Boolean(state?.days?.[today])
  const target = new Date(now)
  target.setHours(config.hour, config.minute, 0, 0)
  if (!done && target.getTime() <= now.getTime()) return { enabled: true, due: true, at: now.toISOString() }
  if (done || target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1)
  return { enabled: true, due: false, at: target.toISOString() }
}

async function tick() {
  if (runningPromise) return
  const config = loadConfig()
  if (!config.enabled) return
  const state = loadState()
  const now = new Date()
  const today = keyOfDay(now)
  if (state.days?.[today]) return
  if (Date.now() < nextRetryAt) return
  const dueAt = config.hour * 60 + config.minute
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const neverRan = !state.lastRunAt
  if (nowMinutes < dueAt && !neverRan) return
  const trigger = nowMinutes < dueAt ? 'first' : 'schedule'
  log(`自动采集开始（触发：${trigger === 'first' ? '首次启动' : '定时'}）`)
  await runCollection(trigger)
}

function startScheduler() {
  const check = () => {
    tick().catch((error) => log(`定时器异常：${messageOf(error)}`))
  }
  const boot = setTimeout(check, BOOT_DELAY_MS)
  boot.unref?.()
  const timer = setInterval(check, CHECK_INTERVAL_MS)
  timer.unref?.()
  return () => {
    clearTimeout(boot)
    clearInterval(timer)
  }
}

/* ------------------------------------------------------------------ HTTP */

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload ?? null)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  response.end(body)
}

function sendText(response, status, body, contentType) {
  const text = String(body ?? '')
  response.writeHead(status, {
    'content-type': contentType,
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(text),
  })
  response.end(text)
}

async function readJsonBody(request, limit = 128 * 1024) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > limit) throw new Error('请求体过大')
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (!text) return null
  return JSON.parse(text)
}

function isDateKey(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function buildStatePayload(extra = {}) {
  const config = loadConfig()
  const state = loadState()
  const now = new Date()
  const today = keyOfDay(now)
  return {
    ok: true,
    now: now.toISOString(),
    today,
    running: Boolean(runningPromise),
    config,
    paths: {
      dataDir: dataDir(),
      reportsDir: reportsDirOf(config),
      todayReport: reportFileOf(config, today),
      log: logFile(),
    },
    digest: state.days?.[today] ?? null,
    days: listDays(state),
    lastRun: state.lastRun ?? null,
    nextRun: nextRunDescriptor(config, state),
    ...extra,
  }
}

async function handleRequest(request, response) {
  const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1')
  const pathname = requestUrl.pathname
  const method = String(request.method ?? 'GET').toUpperCase()

  if (pathname !== ROUTE_PREFIX && !pathname.startsWith(`${ROUTE_PREFIX}/`)) {
    sendJson(response, 404, { ok: false, error: 'not found' })
    return
  }

  const tail = pathname.slice(ROUTE_PREFIX.length).replace(/^\/+/, '').replace(/\/+$/, '')

  try {
    if (method === 'GET' && (tail === '' || tail === 'state')) {
      sendJson(response, 200, buildStatePayload())
      return
    }

    if (method === 'GET' && tail === 'day') {
      const date = requestUrl.searchParams.get('date')
      if (!isDateKey(date)) {
        sendJson(response, 400, { ok: false, error: 'date 需要 YYYY-MM-DD' })
        return
      }
      const state = loadState()
      sendJson(response, 200, { ok: true, date, digest: state.days?.[date] ?? null })
      return
    }

    if (method === 'GET' && tail === 'report') {
      const date = requestUrl.searchParams.get('date') || keyOfDay(new Date())
      if (!isDateKey(date)) {
        sendJson(response, 400, { ok: false, error: 'date 需要 YYYY-MM-DD' })
        return
      }
      const config = loadConfig()
      const file = reportFileOf(config, date)
      if (!existsSync(file)) {
        sendJson(response, 404, { ok: false, error: `${date} 还没有日报文件` })
        return
      }
      sendText(response, 200, readFileSync(file, 'utf8'), 'text/markdown; charset=utf-8')
      return
    }

    if (method === 'POST' && tail === 'refresh') {
      const before = Date.now()
      const digest = await runCollection('manual')
      sendJson(
        response,
        200,
        buildStatePayload({ result: { ok: Boolean(digest), elapsedMs: Date.now() - before, digest } }),
      )
      return
    }

    if (tail === 'config' && method === 'GET') {
      const config = loadConfig()
      sendJson(response, 200, {
        ok: true,
        config,
        paths: {
          dataDir: dataDir(),
          reportsDir: reportsDirOf(config),
          log: logFile(),
        },
      })
      return
    }

    if (tail === 'config' && method === 'POST') {
      let body = null
      try {
        body = await readJsonBody(request)
      } catch (error) {
        sendJson(response, 400, { ok: false, error: messageOf(error) })
        return
      }
      const config = saveConfig(body ?? {})
      sendJson(response, 200, {
        ok: true,
        config,
        paths: {
          dataDir: dataDir(),
          reportsDir: reportsDirOf(config),
          log: logFile(),
        },
      })
      return
    }

    sendJson(response, 404, { ok: false, error: `未知路由 ${method} ${pathname}` })
  } catch (error) {
    log(`接口出错 ${method} ${pathname}: ${messageOf(error)}`)
    if (!response.headersSent) sendJson(response, 500, { ok: false, error: messageOf(error) })
  }
}

/* ------------------------------------------------------------------ 装配 */

export function apply(ctx) {
  ensureDir(dataDir())
  ensureDir(reportsDirOf(loadConfig()))

  ctx.effect(
    () => {
      const dispose = ctx.webServer.register({ kind: 'prefix', path: ROUTE_PREFIX, handler: handleRequest })
      return () => {
        try {
          dispose?.()
        } catch {
          /* 已注销 */
        }
      }
    },
    'python-daily: http routes',
  )

  ctx.effect(() => startScheduler(), 'python-daily: scheduler')

  log(`插件已激活，数据目录 ${dataDir()}`)
}
