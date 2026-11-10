## 0.3.8（2026-11-11，AI 对话面板激活修复）

- 会话判定改用宿主归属 `ownedSession()`（`ownsSession(currentSession())`），不再用 `Boolean(conversation)`（customFrame 下没会话也会传隐藏容器 → 判断恒为真 → 点了没反应）。
- 创建路径改 `service.newSession(workspaceId)`，工作区取 `service.defaultWorkspace?.()?.workspaceId`；无可用工作区时由宿主提示选目录；不再用 `ensureSession({})`。
- 取消目录选择不留空会话并提示可重试；创建失败在工作台内显示原因；订阅会话变化触发重渲染；草稿仍只填不发。
- 版本与生成物同步 0.3.8；新增 `scripts/check-agent-pane-contract.mjs` 入 check 链。
- **界面加载与真机点击待人工**（需退出重开 DSH Desktop 后新建会话走查）。

## 0.3.6 — 2026-10-27

- 分隔线交互统一：AI 面板分隔线加宽抓取区，悬停显示本工作台同色系增亮色与拖动把手（⠿）；拖动改用指针捕获，越过业务 iframe 不再丢事件。

# 变更记录

## 2026-10-27 · v0.3.5 — 面板形态改为 customFrame：「AI 对话」进框架顶栏

用户截图指出「右上角还是没有 AI 对话按钮」，并要求照乳腺癌的做法改。根因是两件事叠在一起：

- **标准分栏（`customFrame: false`）根本没有地方放这个入口**。宿主自己画那条分栏，业务 UI 跑在 iframe 里，够不到宿主的会话栏 —— 页面顶栏的按钮只能显示「暂不可用」，点开还会在业务区内部再开一个自建面板，看起来就是「对话开在中间」。宿主会话栏也不可拖、不可收。
- 上一版把 `businessSide` 改成 `left` 只修正了左右方向，动不了「入口在哪」。

改动：

- **`lib/layout.js`**：`customFrame: true`；新增 `AGENT_PANE`（默认 0.35 / 可拖 0.25–0.45 / 步进 0.02 / 窄于 760px 转抽屉 / 抽屉上限 420px）与 `clampAgentWidth()`；`assertPanelConfig` 增加「customFrame 必须为 true」「businessWidth 与 AGENT_PANE.default 互补」两条判据。
- **`src/client.js` 重写为整页框架**（照乳腺癌实现）：`<header>`（品牌 + 版本 + 说明 + 右侧「AI 对话 / 收起 AI 对话 / ×」）+ 业务 iframe + **宿主原生会话栏**（`conversation` prop，始终挂载、只切 display）+ 可拖分隔条（`role="separator"`、←/→ 步进 2%、Home/End 到边界、`aria-valuenow`）。宽度与开合存 localStorage；无会话时点按钮走 `ensureSession({ folder })` 并把开场白**只填进草稿**；页面可用 `lymbell:agent-draft` 消息把当前页内容送进草稿（只填不发）。
- **`scripts/build-client.mjs`**：新增 `{{VERSION}}` `{{CUSTOM_FRAME}}` `{{BUSINESS_SIDE}}` `{{BUSINESS_WIDTH}}` `{{AGENT_*}}` `{{NARROW_BELOW}}` `{{DRAWER_MAX}}` 注入，并在生成前跑 `assertPanelConfig`，参数不合法就不出产物。
- **测试**：`test/layout.test.mjs` 增加会话宽度与互补断言；`test/host.test.mjs` 改为断言 customFrame 形态（`Panel({ conversation })`、`role: 'separator'`、会话区只切 display），原先把「不能声明 customFrame」写死的两条断言相应反转。
- **文档**：`docs/DESIGN-SESSION.md` 新增 D35 并给 D12/D26 标注已被取代；`docs/UI-DESIGN.md` §6 重写；`docs/DEV-PLAN.md` 面板形态段更新。
- **冒烟**：用假宿主（最小 React shim）把 `lib/client.js` 真跑了一遍 —— 根首元素是 `<header>`、`customFrame: true`、`businessSide: left`、无会话时按钮「AI 对话」/ 有会话时「收起 AI 对话」、面板宽度 35%、`aria-expanded` 跟随开合。`npm run check` 退出码 0（69/69）。

## 2026-10-27 · v0.3.4 — 修宿主分栏方向：业务区在左、原生会话在最右

用户装机后看到「AI 对话框在中间、工作台在右边」。根因不在页面 CSS，而在注册给宿主的分栏参数：

- **`businessSide: 'right' → 'left'`**（`lib/layout.js`）。此前整个分栏是镜像的——宿主的「新会话」占了左半边，工作台被推到右边。家族规范一直是 `left`（starter `docs/02-DSH-CONTRACT.md`、`prompts/ZERO-TO-DEV.md` §309「原生会话面板在最右，不许各仓自定」），本项目抄乳腺 D34 的旧值时抄错了方向。
- **同步改到的位置**：`src/client.js → lib/client.js`（`npm run build:client` 重新注入，产物里已是 `{"businessSide":"left","businessWidth":0.65}`）、`test/layout.test.mjs` 的锁值断言、`test/host.test.mjs` 的注入结果断言、`docs/UI-DESIGN.md`。
- **宿主模式下收起页面内的「AI 对话」入口**：页面跑在 iframe 里，够不到宿主的会话栏，原先按钮只会显示「暂不可用」，点开还会在业务区内部再开一个自建面板——那正是"对话框出现在中间"的来源。现在 `data-runtime="host"` 且桥接不可用时隐藏入口，由宿主负责那 35%；本机模式保持不变。
- **验证**：`npm run check` 退出码 0（68/68）；`lib/client.js` 注入值已核对为 `left`。

## 2026-10-27 · v0.3.3 — 「AI 对话」入口挪到真正右上角 + 旧缓存兜底

用户反馈「右上角缺少了 AI 对话按钮」。排查后发现按钮在 1440px 下确实渲染、也能点到，问题出在三处观感与健壮性：

- **位置不对**：入口排在版本号 chip 左侧，视觉上被挤在中间，不像「右上角」。改为顶栏最末一个控件（版本号之后），真正贴右边缘。
- **文案像坏了**：本机模式下关着面板时写「暂不可用」，看起来等于功能不可用。改为按 `data-runtime` 判断：本机模式显示「未打开」→ 打开后「本机模式」；`暂不可用` 只保留给「在宿主内但桥接不可用」这一种真实异常。
- **旧缓存会真的没有按钮**：`ensureEntry()` 兜底——`agent.js` 启动时若发现 `#ready-session` 不存在，就地在 `.top-actions` 末尾补一个完整入口（按钮 + 隐藏），旧版 HTML 被缓存时也不会整块消失。
- **验证**：初始「AI 对话 未打开」距右边缘 30px、命中可点；点开变「本机模式」且「隐藏」出现可点；隐藏后回到「未打开」；再次点开复现同样状态。旧页面模型（拦截响应删掉整块入口）下按钮被自动补到最右、可点、无杂散文本。

## 2026-10-27 · v0.3.2 — AI 对话面板：入口、状态与位置

- **顶栏「AI 对话」按钮接管开合**：按钮移到右上角（版本 chip 左侧），图标 + 文字；文案按 DSH-AGENT-PANE-INTEGRATION §1 四态区分——未打开 / 正在连接 / 已连接 / 本机模式 / 暂不可用，`aria-pressed` 同步开合。
- **修掉状态不刷新**：按钮原先只在 `app.js` 的 `render()` 里渲染，而开合由 `agent.js` 驱动 → 面板开着、按钮还写「未打开」。现在按钮归 `agent.js` 单一来源维护，`app.js` 不再覆盖它。
- **独立的隐藏控件**：按钮旁增加「隐藏」（仅展开时出现）。契约要求这是面板内部 × 之外的第二个收起入口，不能只靠面板里的关闭。
- **面板位置**：栅格顺序明确为「导航 · 工作台 · Agent」（`grid-column:3`），工作台始终是中间主列。
- **宽度基线**：原先按窗口宽 25%–45% 夹取整，1000px 时把主区压到 314px。改为以工作区可用宽为基准（默认 35%），并加「主区 ≥620px」保护；<1180px 装不下三列时转最右浮层，主区宽度不变。
- **浮层不再压住入口**：浮层从顶栏下沿开始（`--agent-top` 由 JS 量测，开合/缩放/字体加载后重测），并把顶栏抬到浮层之上做双保险；分隔条支持键盘（←/→ 16px，Home/End 到边界）并带 `role="separator"` + `aria-valuenow`。
- **顺带更正 v0.3.1 的记载**：Lugano 2014 原文在 PMC 公开可读（PMC4979083，HTTP 200，标题已核对），数据里按「已取得 · PMC 公开全文」记；v0.3.1 那条「返回 203/403、按未取得原件记」与实际数据和实测不符。另 `verify-links.mjs` 并不存在，实际用的是 `scripts/check-primer-links.mjs`。
- **验证**：1280/1440/1600px 三列模式下主区分别 620/727/887px；1180/1000/820px 转浮层且主区不被挤；六档宽度下「AI 对话」与「隐藏」均命中可点、开合一致；`npm run check` 退出码 0。

## 2026-10-27 · v0.3.1 — 36 号 v2 补齐（指南可点+状态卡）

- **指南表已全部可点（§2.5）**：7 行「原件」列改为 `{text, url}` 对象，无纯文字行；sources 里 `original:false` 的 11 条均带 `secondaryUrl`，2 条一手项目记录按 `nolink:true` + note 放行。
- **链接逐条 curl 验活**：NCCN 四份指南页、CSCO 指南会更新要点、中华肿瘤杂志条目页（rs.yiigle.com/cmaid/1671095）、IARC 出版页、PMC4979083 均 HTTP 200。
- **顺带更正两处事实**：NCCN CLL/SLL 官网当前版本已是 **2.2027**（此前记为 2.2026）；Lugano 2014 为 JCO 32(27):3059–3067，PMC 全文公开，按已取得记。
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
