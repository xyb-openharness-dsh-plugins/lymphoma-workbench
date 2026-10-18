import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { APP_INFO, version, displayVersion, channel, channelLabel, build, commit } from '../lib/version.js'

const root = new URL('../', import.meta.url)
const read = (p) => readFileSync(new URL(p, root), 'utf8')
const VERSION = read('VERSION').trim()

test('lib/version.js 的 version 与仓库根 VERSION 一致', () => {
  assert.equal(version, VERSION)
})

test('version 是合法 SemVer，且不带 v 前缀', () => {
  assert.match(version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/)
  assert.ok(!version.startsWith('v'), '数据里的版本号不加 v，显示时才加（VERSIONING §2）')
})

test('displayVersion 是 v + version', () => {
  assert.equal(displayVersion, `v${version}`)
})

test('channel 只能是 prototype / beta / stable，且有对应的人话标签', () => {
  assert.ok(['prototype', 'beta', 'stable'].includes(channel))
  assert.equal(typeof channelLabel, 'string')
  assert.ok(channelLabel.length > 0)
})

test('build 是 YYYY-MM-DD 或 local，commit 是短哈希或 local', () => {
  assert.match(build, /^(\d{4}-\d{2}-\d{2}|local)$/)
  assert.match(commit, /^([0-9a-f]{7,40}|local)$/)
})

test('APP_INFO 是冻结对象，字段与导出常量一致', () => {
  assert.ok(Object.isFrozen(APP_INFO))
  assert.equal(APP_INFO.version, version)
  assert.equal(APP_INFO.displayVersion, displayVersion)
  assert.equal(APP_INFO.channel, channel)
  assert.equal(APP_INFO.channelLabel, channelLabel)
})

test('package.json 的 version 与 VERSION 一致', () => {
  const pkg = JSON.parse(read('package.json'))
  assert.equal(pkg.version, VERSION)
})

/* 原型 v0.1 是验收基准，冻结在 0.1.0（D37 同款）：当前版本继续前进，原型不跟着漂。 */
const FROZEN_PROTOTYPE = '0.1.0'

test('原型 app.js 的 APP_INFO.version 冻结在 v0.1.0（不跟当前版本）', () => {
  const appJs = read('prototypes/v0.1/app.js')
  const m = appJs.match(/version:\s*'([^']+)'/)
  assert.ok(m, 'app.js 里找不到 APP_INFO.version')
  assert.equal(m[1], FROZEN_PROTOTYPE)
})

test('产品页面 public/index.html 的首屏版本与 VERSION 一致', () => {
  const html = read('public/index.html')
  const t = html.match(/<title>[^<]*?v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)<\/title>/)
  assert.ok(t, 'public/index.html 标题里找不到版本号')
  assert.equal(t[1], VERSION)
})
