import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PANEL,
  HOST_LIMITS,
  WIDE_TABLE_MIN_PX,
  businessPanePx,
  needsFullRowCard,
  assertPanelConfig,
} from '../lib/layout.js'

test('面板参数是 A 标准分栏：right / 0.65 / 非 customFrame', () => {
  assert.equal(PANEL.businessSide, 'right')
  assert.equal(PANEL.businessWidth, 0.65)
  assert.equal(PANEL.customFrame, false)
  assert.ok(Object.isFrozen(PANEL))
})

test('默认参数通过自检', () => {
  assert.deepEqual(assertPanelConfig(), [])
})

test('1440 窗口的 65% 业务区宽度', () => {
  assert.equal(businessPanePx(1440), 936)
})

test('1280 与 1200 的 65% 宽度', () => {
  assert.equal(businessPanePx(1280), 832)
  assert.equal(businessPanePx(1200), 780)
})

test('非法窗口宽度抛错，不用 0 或负数糊过去', () => {
  assert.throws(() => businessPanePx(0), TypeError)
  assert.throws(() => businessPanePx(-1), TypeError)
  assert.throws(() => businessPanePx('1440'), TypeError)
})

test('宽表判定：小于 417px 必须整行，等于及以上可放两列', () => {
  assert.equal(WIDE_TABLE_MIN_PX, 417)
  assert.equal(needsFullRowCard(313), true)
  assert.equal(needsFullRowCard(416), true)
  assert.equal(needsFullRowCard(417), false)
  assert.equal(needsFullRowCard(640), false)
})

test('越界配置被拦下：错误的方向 / customFrame / 宽度', () => {
  assert.ok(assertPanelConfig({ businessSide: 'top', businessWidth: 0.65, customFrame: false }).length > 0)
  assert.ok(assertPanelConfig({ businessSide: 'right', businessWidth: 0.65, customFrame: true }).length > 0)
  assert.ok(assertPanelConfig({ businessSide: 'right', businessWidth: 0.2, customFrame: false }).length > 0)
  assert.ok(assertPanelConfig({ businessSide: 'right', businessWidth: 0.7, customFrame: false }).length > 0)
  assert.ok(assertPanelConfig({ businessSide: 'right', businessWidth: 0.65, customFrame: false }).length === 0)
  assert.equal(HOST_LIMITS.max, 0.7)
})
