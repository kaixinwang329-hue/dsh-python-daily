/**
 * python-daily 的离线冒烟测试：
 * 用一个假的 cordis ctx + 假的 req/res，把 host 半端的 apply 跑起来，
 * 再把 HTTP 接口挨个打一遍（refresh 会真的联网抓一次）。
 *
 * 关键点：DSH_HOME 指向临时目录，不污染真实的 $DSH_HOME/python-daily/。
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const sandboxHome = mkdtempSync(join(tmpdir(), 'python-daily-smoke-'))
process.env.DSH_HOME = sandboxHome
// 真实数据目录现在默认在 D 盘，测试必须把它按到沙箱里，否则会读到真数据。
process.env.PYTHON_DAILY_DATA_DIR = join(sandboxHome, 'python-daily')
process.env.PYTHON_DAILY_DEBUG = '0'

const { apply } = await import('../index.js')

/** 本地日期键，跟插件里的 keyOfDay 保持一致 */
function localDayKey(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const TODAY = localDayKey()
const OTHER_DAY = '2026-01-01' // 一定没有日报的日子，用来测 404 / digest null

let handler = null
const disposers = []

const fakeCtx = {
  effect(fn, _label) {
    const dispose = fn()
    if (typeof dispose === 'function') disposers.push(dispose)
    return () => {}
  },
  webServer: {
    register(route) {
      handler = route.handler
      return () => {
        handler = null
      }
    },
  },
}

apply(fakeCtx)
if (typeof handler !== 'function') {
  console.error('FAIL: 没有注册 HTTP 路由')
  process.exit(1)
}

function makeReq(method, url, bodyText) {
  const chunks = bodyText === undefined ? [] : [Buffer.from(bodyText, 'utf8')]
  return {
    method,
    url,
    headers: {},
    [Symbol.asyncIterator]() {
      let index = 0
      return {
        async next() {
          if (index >= chunks.length) return { value: undefined, done: true }
          const value = chunks[index]
          index += 1
          return { value, done: false }
        },
      }
    },
  }
}

function makeRes() {
  const res = {
    status: 0,
    headers: {},
    body: '',
    headersSent: false,
    writeHead(status, headers) {
      res.status = status
      res.headers = headers || {}
      res.headersSent = true
    },
    end(chunk) {
      if (chunk) res.body += String(chunk)
    },
  }
  return res
}

async function call(method, path, bodyText) {
  const res = makeRes()
  await handler(makeReq(method, path, bodyText), res)
  return res
}

function parse(res) {
  try {
    return JSON.parse(res.body)
  } catch {
    return null
  }
}

const results = []
function check(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  ${detail}` : ''}`)
}

// 1. GET state
{
  const res = await call('GET', '/python-daily/state')
  const data = parse(res)
  check('GET state 200', res.status === 200 && data && data.ok === true, `status=${res.status}`)
  check('state 带 config.disable?', data && data.config && data.config.hour === 9, JSON.stringify(data && data.config))
  check('state 带 paths', Boolean(data && data.paths && data.paths.dataDir), data && data.paths && data.paths.dataDir)
  check('sandbox 生效', data && String(data.paths.dataDir).startsWith(sandboxHome), data && data.paths.dataDir)
  check('今日 digest 为空', data && data.digest === null, String(data && data.digest))
}

// 2. GET day 参数校验
{
  const bad = await call('GET', '/python-daily/day?date=xx')
  check('GET day 校验日期 400', bad.status === 400, `status=${bad.status}`)
  const good = await call('GET', `/python-daily/day?date=${OTHER_DAY}`)
  const data = parse(good)
  check('GET day 200', good.status === 200 && data && data.digest === null, `status=${good.status}`)
}

// 3. GET report 未生成时 404
{
  const res = await call('GET', `/python-daily/report?date=${OTHER_DAY}`)
  check('GET report 404', res.status === 404, `status=${res.status}`)
}

// 4. POST config
{
  const res = await call(
    'POST',
    '/python-daily/config',
    JSON.stringify({ hour: 7, minute: 30, maxPerSection: 5, packages: ['requests', 'RuFf', 'requests', 'bad name!!'], enabled: true }),
  )
  const data = parse(res)
  check('POST config 200', res.status === 200 && data && data.ok === true, `status=${res.status}`)
  check('config.hour=7', data && data.config.hour === 7, JSON.stringify(data && data.config && { hour: data.config.hour, minute: data.config.minute }))
  check('config.minute=30', data && data.config.minute === 30, '')
  check('packages 去重小写', data && JSON.stringify(data.config.packages) === JSON.stringify(['requests', 'ruff']), JSON.stringify(data && data.config.packages))
  check('reportsDir 默认值', data && data.config.reportsDir === '', JSON.stringify(data && data.config.reportsDir))

  const bad = await call('POST', '/python-daily/config', '{not json')
  check('POST config 非法 JSON 400', bad.status === 400, `status=${bad.status}`)
}

// 5. POST refresh（真联网）
{
  const startedAt = Date.now()
  const res = await call('POST', '/python-daily/refresh', '{}')
  const data = parse(res)
  const elapsed = Date.now() - startedAt
  const digest = data && data.result && data.result.digest
  check('POST refresh 200', res.status === 200 && data && data.ok === true, `status=${res.status} ${elapsed}ms`)
  check('refresh 产出 digest', Boolean(digest), digest ? `date=${digest.date} total=${digest.counts.total}` : 'null')
  if (digest) {
    const counts = digest.counts
    check('sources 至少一个成功', Object.values(digest.sources || {}).some((row) => row.ok), JSON.stringify(digest.sources))
    check(
      '各板块字段完整',
      ['blog', 'releases', 'peps', 'packages', 'github'].every((key) => Array.isArray(digest.sections[key])),
      JSON.stringify(counts),
    )
    const first = (digest.sections.blog || [])[0] || (digest.sections.releases || [])[0] || (digest.sections.peps || [])[0]
    check('条目有 title/url/id', Boolean(first && first.title && first.url && first.id), first ? JSON.stringify({ title: first.title, url: first.url }) : 'empty')
    const ghFirst = (digest.sections.github || [])[0]
    check(
      'GitHub 条目带星标与仓库链接',
      !ghFirst || (/^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(ghFirst.url) && /★/.test(ghFirst.meta) && Boolean(ghFirst.id.startsWith('gh:'))),
      ghFirst ? `${ghFirst.title} ${ghFirst.meta}` : '窗口内暂无新仓库',
    )
  }
  check('state.payload 带 lastRun', Boolean(data && data.lastRun), JSON.stringify(data && data.lastRun && data.lastRun.counts))
}

// 6. GET report 现在应该有内容
{
  const res = await call('GET', `/python-daily/report?date=${TODAY}`)
  const looksMarkdown = /^# Python 每日情报/.test(res.body)
  const hasSections = /## 官方博客/.test(res.body) && /## PEP 动态/.test(res.body) && /## GitHub 项目/.test(res.body)
  check('GET report 200 markdown', res.status === 200 && looksMarkdown, `status=${res.status} len=${res.body.length}`)
  check('report 有五个板块', hasSections, '')
  if (!looksMarkdown) console.log(res.body.slice(0, 400))
}

// 7. 再次 GET state 看 today digest + days 列表
{
  const res = await call('GET', '/python-daily/state')
  const data = parse(res)
  check('state.digest 非空', Boolean(data && data.digest && data.digest.counts), JSON.stringify(data && data.digest && data.digest.counts))
  check('state.days 有今天', Boolean(data && data.days && data.days.length && data.days[0].date), JSON.stringify(data && data.days))
  check('nextRun 有值', Boolean(data && data.nextRun && data.nextRun.at), JSON.stringify(data && data.nextRun))
}

// 8. 未知路由 404
{
  const res = await call('GET', '/python-daily/nope')
  check('未知路由 404', res.status === 404, `status=${res.status}`)
}

// 9. 重复 refresh 不重复计数（同一天 merge，按 id 去重）
{
  const before = parse(await call('GET', '/python-daily/state'))
  const res = await call('POST', '/python-daily/refresh', '{}')
  const data = parse(res)
  const fresh = data && data.result && data.result.digest
  const beforeTotal = before && before.digest ? before.digest.counts.total : 0
  const afterTotal = fresh ? fresh.counts.total : -1
  const maxCap = (before && before.config.maxPerSection) || 8
  check('二次 refresh 幂等（不超过每天上限的 5 倍）', afterTotal >= 0 && afterTotal <= maxCap * 5, `before=${beforeTotal} after=${afterTotal}`)
}

for (const dispose of disposers) {
  try {
    dispose()
  } catch {
    /* ignore */
  }
}

const failed = results.filter((row) => !row.ok)
console.log(`\n${results.length - failed.length}/${results.length} 通过`)
try {
  rmSync(sandboxHome, { recursive: true, force: true })
} catch {
  /* ignore */
}
process.exit(failed.length ? 1 : 0)
