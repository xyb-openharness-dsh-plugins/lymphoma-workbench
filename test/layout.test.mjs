import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PANEL,
  HOST_LIMITS,
  AGENT_PANE,
  WIDE_TABLE_MIN_PX,
  businessPanePx,
  needsFullRowCard,
  assertPanelConfig,
  clampAgentWidth,
} from '../lib/layout.js'

test('面板参数：customFrame / 业务在左 65% / 原生会话在最右', () => {
  assert.equal(PANEL.businessSide, 'left')
  assert.equal(PANEL.businessWidth, 0.65)
  assert.equal(PANEL.customFrame, true)
  assert.ok(Object.isFrozen(PANEL))
})

test('会话面板宽度取 35%，可拖 25%–45%，与业务 65% 互补', () => {
  assert.equal(AGENT_PANE.default, 0.35)
  assert.equal(AGENT_PANE.min, 0.25)
  assert.equal(AGENT_PANE.max, 0.45)
  assert.ok(Math.abs((1 - AGENT_PANE.default) - PANEL.businessWidth) < 1e-9)
  assert.equal(clampAgentWidth(0.1), AGENT_PANE.min)
  assert.equal(clampAgentWidth(0.9), AGENT_PANE.max)
  assert.equal(clampAgentWidth('x'), AGENT_PANE.default)
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

test('越界配置被拦下：错误的方向 / 缺 customFrame / 宽度 / 不互补', () => {
  assert.ok(assertPanelConfig({ businessSide: 'top', businessWidth: 0.65, customFrame: true }).length > 0)
  // customFrame 关掉就没有地方放「AI 对话」入口，必须拦下
  assert.ok(assertPanelConfig({ businessSide: 'left', businessWidth: 0.65, customFrame: false }).length > 0)
  assert.ok(assertPanelConfig({ businessSide: 'left', businessWidth: 0.2, customFrame: true }).length > 0)
  assert.ok(assertPanelConfig({ businessSide: 'left', businessWidth: 0.7, customFrame: true }).length > 0)
  assert.ok(assertPanelConfig({ businessSide: 'left', businessWidth: 0.65, customFrame: true }).length === 0)
  // 业务 0.6 与会话默认 0.35 不互补
  assert.ok(assertPanelConfig({ businessSide: 'left', businessWidth: 0.6, customFrame: true }).length > 0)
  assert.equal(HOST_LIMITS.max, 0.7)
})
