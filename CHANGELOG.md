# 变更记录

## 2026-10-27 · v0.3.1 — 36 号 v2 补齐（指南可点+状态卡）

- **指南表已全部可点（§2.5）**：7 行「原件」列改为 `{text, url}` 对象，无纯文字行；sources 里 `original:false` 的 11 条均带 `secondaryUrl`，2 条一手项目记录按 `nolink:true` + note 放行。
- **链接逐条真浏览器验活（verify-links.mjs）**：NCCN 四份指南页、CSCO 指南会更新要点、中华肿瘤杂志条目页、IARC 出版页均 OK；Lugano 原文（JCO / PMC / Europe PMC）返回 203 或 403（THIN/AUTH/CHALLENGE），按「未取得原件，据中华肿瘤杂志 2026 版转引」记，未编 URL。
- **看板状态卡（§2.6）**：首卡补齐卡头（D+N · 距下次安排）/ 锚点派生天数 / 现状行 / 出口按钮排；无锚点时显示「待初始化」并给三步补录指引；状态词只取档案阶段原文，不推断。
- **浮窗四段（§2.1）**：definition → evidence → landscape → trend 齐全，趋势段仅已发生事实+日期，无禁止词。
- **模式层与排版**：`primer.js` / `primer.css` 同步 starter 最新版（含 §4.3 排版对齐修复）；`public/` 补入 primer 三件套并挂载顶栏「?」，`check` 末尾追加 `check-primer-links`。
- **验证**：探针 10/10 PASS（含 P9 三档排版对齐）；链接断言 20/20；`npm run check` 退出码 0。

## 未发布 — 2026-10-22（MinerU 统一口径）

- **显式提交 `model_version: 'pipeline'`**：原先不传该参数、吃 MinerU 服务端默认值，等于把口径交给上游；现在写死并导出 `MINERU_MODEL_DEFAULT`，显式传 vlm 仍可覆盖。
- **Token 优先级改为文件优先**：显式 > `.secrets/mineru.json` > `MINERU_TOKEN`（2026-10-22 跨仓统一）。
- 单测 68 条仍全绿。

## 2026-10-20 · 开发快照（包版本 0.3.0）

- 补齐宿主入口、身份/布局/桥接模块、构建生成客户端与独立页面API前缀适配；资料目录选择回调与虚构数据种子同步更新。真实Desktop视觉/业务验收仍待完成。
- `npm run check`：通过（退出码0）；tests=68, pass=68, fail=0。
- 详细范围见 [Git同步记录](docs/GIT-SYNC-2026-10-20.md)；本次未创建正式发布tag。
