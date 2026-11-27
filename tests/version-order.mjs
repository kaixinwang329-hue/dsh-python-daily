/**
 * 版本比较的离线单测：锁住 PEP 440 轻量实现里的先后关系，
 * 重点是 dev 版本必须排在 a/b/rc 与正式版之前。
 */
import { compareVersions, isPrereleaseVersion, versionOfTitle } from '../src/version.mjs'

const ORDER_CASES = [
  ['1.0.dev6', '1.0', -1, 'dev 低于正式版'],
  ['1.0.dev6', '1.0a1', -1, 'dev 低于 a'],
  ['1.0.dev7', '1.0.dev6', 1, 'dev 内部按序号'],
  ['1.0a1.dev2', '1.0a1', -1, '预发布上的 dev 低于其宿主'],
  ['1.0a1', '1.0b2', -1, 'a 低于 b'],
  ['1.0b2', '1.0rc1', -1, 'b 低于 rc'],
  ['1.0rc1', '1.0', -1, 'rc 低于正式版'],
  ['1.0', '1.0.post1', -1, '正式版低于 post'],
  ['1.0.post1', '1.0.post2', -1, 'post 内部按序号'],
  ['1.0', '1.0', 0, '完全相同'],
  ['v1.2.3', '1.2.3', 0, '忽略 v 前缀'],
  ['2.0.0', '1.9.9', 1, '主版本优先'],
  ['1.10', '1.9', 1, '数字逐段比，不是字典序'],
  ['3.12.1', '3.12', 1, '多一段更高'],
  ['abc', '1.0', null, '解析不了返回 null'],
  ['1.0+ubuntu', '1.0', null, 'local version 不在支持范围'],
]

const PRE_CASES = [
  ['1.0.dev6', true],
  ['1.0a1', true],
  ['1.0rc1', true],
  ['1.0', false],
  ['1.0.post1', false],
]

const TOTAL = ORDER_CASES.length + PRE_CASES.length + 2
let failed = 0
function check(name, ok, detail) {
  if (!ok) failed += 1
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  ${detail}` : ''}`)
}

for (const [left, right, expected, label] of ORDER_CASES) {
  const actual = compareVersions(left, right)
  check(`排序 ${left} vs ${right}`, actual === expected, `${label}，实际 ${actual}`)
}

for (const [version, expected] of PRE_CASES) {
  check(`预发布判定 ${version}`, isPrereleaseVersion(version) === expected, `实际 ${isPrereleaseVersion(version)}`)
}

check('versionOfTitle 去掉包名前缀', versionOfTitle('requests', 'requests 2.34.2') === '2.34.2', versionOfTitle('requests', 'requests 2.34.2'))
check('versionOfTitle 保留纯版本号', versionOfTitle('requests', '2.34.2') === '2.34.2', '')

console.log(`\n${TOTAL - failed}/${TOTAL} 通过`)
process.exit(failed ? 1 : 0)
