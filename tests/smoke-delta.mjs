/**
 * 增量检测专项测试：
 * 预先塞一份「昨天的基线」进 state.json（旧 PEP 状态 + 旧包版本），
 * 再跑一次 refresh，确认插件能识别出「状态变更」和「包发新版」这两类条目。
 */

import { mkdirSync, mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const sandboxHome = mkdtempSync(join(tmpdir(), 'python-daily-delta-'))
process.env.DSH_HOME = sandboxHome
// 真实数据目录现在默认在 D 盘，测试必须把它按到沙箱里，否则会读到真数据。
process.env.PYTHON_DAILY_DATA_DIR = join(sandboxHome, 'python-daily')

const dataDir = join(sandboxHome, 'python-daily')
mkdirSync(dataDir, { recursive: true })

// 种子用的是公开且稳定的事实：PEP 484 从 2014 年起就是 Final（PEP 8 是 Active，别拿它当种子）；
// requests 基线写成 0.0.1，任何真实版本都算「发新版」。测试自己不再联网取种子。
const SEED_PEP = 484
const pepStatus = {}
pepStatus[String(SEED_PEP)] = 'Draft' // 基线里写 Draft，真实状态是 Final → 应当报一条状态变更

const yesterday = new Date(Date.now() - 86_400_000).toISOString()
writeFileSync(
  join(dataDir, 'state.json'),
  JSON.stringify(
    {
      version: 1,
      lastRunAt: yesterday,
      lastRun: { at: yesterday, trigger: 'schedule', ok: true, succeeded: 4, failed: 0, counts: { total: 0 } },
      cursors: { blog: yesterday, releases: yesterday, peps: yesterday, packages: yesterday },
      days: {},
      seen: { pepStatus, packages: { requests: '0.0.1' } },
    },
    null,
    2,
  ),
  'utf8',
)

writeFileSync(
  join(dataDir, 'config.json'),
  JSON.stringify({ enabled: true, hour: 9, minute: 0, maxPerSection: 8, keepDays: 30, includePrerelease: true, packages: ['requests'], reportsDir: '' }, null, 2),
  'utf8',
)

const { apply } = await import('../index.js')

let handler = null
const fakeCtx = {
  effect(fn) {
    const dispose = fn()
    return typeof dispose === 'function' ? dispose : () => {}
  },
  webServer: {
    register(route) {
      handler = route.handler
      return () => {}
    },
  },
}
apply(fakeCtx)
if (typeof handler !== 'function') throw new Error('路由没注册上')

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
    body: '',
    writeHead(status) {
      res.status = status
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

const results = []
function check(name, ok, detail) {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  ${detail}` : ''}`)
}

const refresh = await call('POST', '/python-daily/refresh', '{}')
const payload = JSON.parse(refresh.body)
const digest = payload?.result?.digest ?? payload?.digest
check('refresh 成功返回 digest', Boolean(digest), refresh.status + '')

const pepsSection = digest?.sections?.peps ?? []
const packagesSection = digest?.sections?.packages ?? []

const changeItem = pepsSection.find((item) => String(item.id).startsWith(`pep-chg:${SEED_PEP}:`))
check('识别出 PEP 状态变更', Boolean(changeItem), changeItem ? `${changeItem.change?.from} → ${changeItem.change?.to}` : JSON.stringify(pepsSection.map((i) => i.id)))
const toStatus = changeItem?.change?.to ?? ''
check('状态变更条目带 change 字段', Boolean(toStatus) && toStatus !== 'Draft', JSON.stringify(changeItem?.change ?? null))

const pkgItem = packagesSection.find((item) => String(item.id).startsWith('pkg:requests:'))
check('识别出包发新版', Boolean(pkgItem), pkgItem ? pkgItem.title : JSON.stringify(packagesSection.map((i) => i.id)))
const realVersion = pkgItem ? String(pkgItem.id).slice('pkg:requests:'.length) : null
check('包条目版本号合法', Boolean(realVersion && /^\d+(?:\.\d+)+/.test(realVersion)), `real=${realVersion}`)

const report = await call('GET', `/python-daily/report?date=${digest?.date}`)
const markdown = report.body
check('日报渲染出「旧 → 新」', Boolean(toStatus) && markdown.includes(`~~Draft~~ → **${toStatus}**`), '')
check('日报含包板块条目', markdown.includes('requests'), '')

// 状态基线要落盘，否则明天还会重复报同一条变更
const saved = JSON.parse(readFileSync(join(dataDir, 'state.json'), 'utf8'))
check('PEP 基线已更新为最新状态', Boolean(toStatus) && saved?.seen?.pepStatus?.[String(SEED_PEP)] === toStatus, String(saved?.seen?.pepStatus?.[String(SEED_PEP)]))
check('包基线已更新为新版本', Boolean(realVersion) && saved?.seen?.packages?.requests === realVersion, String(saved?.seen?.packages?.requests))

// 再跑一次：同一个变更不应该重复出现（基线已推进）
const second = await call('POST', '/python-daily/refresh', '{}')
const secondPayload = JSON.parse(second.body)
const secondDigest = secondPayload?.result?.digest ?? secondPayload?.digest
const repeat = (secondDigest?.sections?.peps ?? []).filter((item) => String(item.id).startsWith(`pep-chg:${SEED_PEP}:`))
check('二次运行不重复报同一变更', repeat.length === 1, `出现 ${repeat.length} 次（应保留当天已收录的 1 条）`)

const failed = results.filter((row) => !row.ok)
console.log(`\n${results.length - failed.length}/${results.length} 通过`)
try {
  rmSync(sandboxHome, { recursive: true, force: true })
} catch {
  /* ignore */
}
process.exit(failed.length ? 1 : 0)
