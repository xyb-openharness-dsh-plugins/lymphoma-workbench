/**
 * DSH 工作台插件入口 —— **M0 占位，不是可用实现**。
 *
 * 现状（2026-10-17）：
 * - 没有 HTTP 路由、没有数据库、没有界面；
 * - 没有 cordis.patch.yml，也**从未在 DSH Desktop 里装过**；
 * - 安装它会立刻在 apply() 报错，这是故意的：宁可装不上，也不要"装上了但什么都不做"。
 *
 * 真实接入按 docs/DEV-PLAN.md 的 M5 完成。
 */
export const name = 'lymphoma-workbench-main'

export const inject = ['webServer', 'connection']

export function apply() {
  throw new Error(
    '小铃铛淋巴瘤工作台尚未接入 DSH（计划 M5）。当前是 M0 工程占位，请不要安装到 Desktop。',
  )
}
