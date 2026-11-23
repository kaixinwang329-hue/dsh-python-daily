/**
 * client.js 的离线冒烟：不打开浏览器，用 stub React 把整页渲染成树，
 * 检查①模块形态②槽位注册③中英文案键是否对齐④首屏文案能不能出来。
 */

import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')

let entry = null
const fakeWindow = {
  __ModuleLoader__: {
    load(candidate) {
      entry = candidate
    },
  },
}

new Function('window', source)(fakeWindow)
if (!entry || typeof entry.factory !== 'function') {
  console.error('FAIL: 没有调用 window.__ModuleLoader__.load({ factory })')
  process.exit(1)
}

const stubReact = {
  Fragment: Symbol('Fragment'),
  createElement(type, props, ...children) {
    return { type, props: props ?? {}, children: children.flat() }
  },
  useState(initial) {
    return [typeof initial === 'function' ? initial() : initial, () => {}]
  },
  useCallback(fn) {
    return fn
  },
  useEffect() {},
  useMemo(fn) {
    return fn()
  },
  useRef(value) {
    return { current: value }
  },
}

const moduleValue = entry.factory((id) => {
  if (id === 'react') return stubReact
  throw new Error(`client.js 不该 require：${id}`)
})

const results = []
function check(name, ok, detail) {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  ${detail}` : ''}`)
}

check('模块形态 name/inject/apply', moduleValue && moduleValue.name === 'python-daily' && Array.isArray(moduleValue.inject) && typeof moduleValue.apply === 'function', JSON.stringify({ name: moduleValue?.name, inject: moduleValue?.inject }))

const dicts = {}
const registrations = []
const disposers = []

let currentLang = 'zh'

const fakeCtx = {
  effect(fn) {
    const dispose = fn()
    if (typeof dispose === 'function') disposers.push(dispose)
    return () => {}
  },
  locale: {
    register(namespace, lang, dict) {
      dicts[lang] = dict
      return () => {}
    },
    bind(namespace) {
      return (key) => {
        const dict = dicts[currentLang] ?? {}
        return dict[key] ?? dicts.zh?.[key] ?? key
      }
    },
    subscribe() {
      return () => {}
    },
  },
  slots: {
    inject(slot, register) {
      const dispose = register()
      return () => {
        if (typeof dispose === 'function') dispose()
      }
    },
    register(meta, component) {
      registrations.push({ meta, component })
      return () => {}
    },
  },
}

moduleValue.apply(fakeCtx)

const main = registrations.find((row) => row.meta.name === 'main')
const side = registrations.find((row) => row.meta.name === 'sidebar.panellist')
check('注册了 main 整页', Boolean(main && main.meta.key === 'python-daily'), JSON.stringify(main?.meta ?? null))
check('注册了侧栏入口', Boolean(side && side.meta.id === 'python-daily' && side.meta.order === 20), JSON.stringify(side?.meta ?? null))

function collectText(node, bucket, depth) {
  if (depth > 40) return
  if (node === null || node === undefined || node === false || node === true) return
  if (typeof node === 'string' || typeof node === 'number') {
    bucket.push(String(node))
    return
  }
  if (Array.isArray(node)) {
    for (const child of node) collectText(child, bucket, depth)
    return
  }
  if (typeof node === 'object') {
    if (typeof node.type === 'function') {
      // 自己把函数组件展开渲染，stub React 不做协调
      collectText(node.type(node.props ?? {}), bucket, depth + 1)
      return
    }
    collectText(node.children, bucket, depth)
    return
  }
}

function render(component, props) {
  const tree = component(props)
  const bucket = []
  collectText(tree, bucket, 0)
  return { tree, text: bucket.join(' ') }
}

let pageView = null
try {
  pageView = render(main.component, {})
  check('整页首屏能渲染', true, `${pageView.text.length} 字`)
} catch (error) {
  check('整页首屏能渲染', false, error.message)
}

if (pageView) {
  check('首屏带标题', /Python 每日情报/.test(pageView.text), '')
  check('首屏带三个 tab', /今日/.test(pageView.text) && /历史/.test(pageView.text) && /设置/.test(pageView.text), '')
  check('首屏加载态', /正在读取|加载中/.test(pageView.text), pageView.text.slice(0, 80))
}

try {
  const icon = render(side.component, { size: 16, active: true })
  check('侧栏图标能渲染', Boolean(icon.tree), '')
} catch (error) {
  check('侧栏图标能渲染', false, error.message)
}

const zhKeys = Object.keys(dicts.zh ?? {})
const enKeys = Object.keys(dicts.en ?? {})
const missingInEn = zhKeys.filter((key) => !(key in (dicts.en ?? {})))
const missingInZh = enKeys.filter((key) => !(key in (dicts.zh ?? {})))
check('中英文案键对齐', missingInEn.length === 0 && missingInZh.length === 0, `zh ${zhKeys.length} / en ${enKeys.length} 缺 en:${missingInEn.join(',') || '无'} 缺 zh:${missingInZh.join(',') || '无'}`)

const usedKeys = new Set()
for (const hit of source.matchAll(/\b(?:t|translate)\(\s*'([a-zA-Z0-9_]+)'\s*\)/g)) usedKeys.add(hit[1])
const missingUsed = [...usedKeys].filter((key) => !(key in (dicts.zh ?? {})))
check('代码里用到的文案键都有词条', missingUsed.length === 0, missingUsed.join(',') || `${usedKeys.size} 个键`)

const extraKeys = zhKeys.filter((key) => !usedKeys.has(key))
console.log(`\n提示：词条里有 ${extraKeys.length} 个键没被直接 t('x') 用到（可能是动态拼键或预留）：${extraKeys.join(', ') || '无'}`)

for (const dispose of disposers) {
  try {
    dispose()
  } catch {
    /* ignore */
  }
}

const failed = results.filter((row) => !row.ok)
console.log(`\n${results.length - failed.length}/${results.length} 通过`)
process.exit(failed.length ? 1 : 0)
