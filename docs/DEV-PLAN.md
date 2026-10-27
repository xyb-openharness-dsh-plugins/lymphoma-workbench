# 开发计划

日期：2026-10-17。只定**顺序、产物与判定标准**，不复述规格。

## 0. 一句话

先把「分型 → 治疗线 → 疗效 → 带去门诊」这条主线做成真实可用的，再补支持模块，最后接 DSH。**不并行开工，不先做界面美化。**

## 1. 里程碑

| 阶段 | 做什么 | 产物 | 完成判定 | 依赖 |
| --- | --- | --- | --- | --- |
| **M0 工程底座** | 目录、`package.json`、脚本、静态检查、版本校验 | `package.json`、`scripts/`、`lib/`、`test/` 骨架 | ✅ **2026-10-17 完成**：`npm run check` 一条命令跑通（版本 → 语法 → 文案红线 → 15 条单测 → 版本一致） | 无 |
| **G1 业务流程** | 模块、场景、边界、不做清单 | SPEC §3–§6 + SCENARIOS | 用户逐条确认并留痕（Q1–Q10 已答，D17–D26） | 本阶段 |
| **G2 HTML demo** | 10 页 27 视图逐页走查 | `prototypes/v0.1/` 或 v0.2 | 用户确认范围与交互；A1–A33 过 | G1 |
| **G3 数据模型** | 实体、字段、约束、写入语义 | `SCHEMA-SPEC.md`、`DATA-FLOW-SPEC.md` | 用户签认；三问有答 | G2 |
| **M1 数据层** | 迁移、store、契约校验、种子数据 | `schema/0001_initial.sql`、`dsh/migrate.js`、`dsh/store.js` | ✅ **2026-10-17 完成**：建表可重跑；分类变量不被当数值（`metric_def.is_numeric`）；更正链有触发器挡着；"未检测"存 `result_state` 而非阴性 | G3 |
| **M2 主线闭环** | 分型 → 治疗线 → 周期 → 评估 → 一图秀 → 就诊准备导出 | `public/` + `dsh/server.js` | ✅ **2026-10-17 完成**：`npm start` 可跑，27 视图渲染 0 异常；写入进库；UI 一致率 99.89%（见 `UI-PARITY.md`）。**未做**：报告导入（MinerU）、导出文件落盘（当前只有预览与复制） | M1 |
| **M3 支持模块** | 感染、血象、营养、心理与生活（含生育节点）完整交互 | 同上 | ⏳ **部分**：体温 / 症状 / 进食 / 体重 / 会诊 / 给药 / 新治疗线均已能记；红框文案未改写。**未做**：按亚型的支持内容、生育节点自动进时间线 | M2 |
| **M4 设置与就绪** | 工作区选择、MinerU 接入、临床库空态、顶栏两状态 | `dsh/server.js`、`dsh/paths.js` | ⏳ **部分**：资料目录拒绝主目录/根/桌面根（A28）；Token 只存掩码不回显（A29）；临床库已接。**未做**：MinerU 真正解析、备份与恢复 | M2 |
| **M5 接入 DSH** | `cordis.patch.yml`、`dsh/index.js`、`dsh/host.js`、`src/client.js`→`lib/client.js`、`lib/identity.js`、`workbench.json` | 可安装包 | ✅ **2026-10-20 完成 V1（装机）**：0.3.0 包装进 Desktop，**列表里出现 `xyb-openharness-dsh-plugins/lymphoma-workbench`**，宿主配置目录 `harness/lymphoma-workbench/lymbell.sqlite` 已建立，日志无 import 错误。**V2（容器内页面）待用户在界面打开确认**——本机用 curl 直连接口一律 401，那正是授权闸在工作，不代表页面不可用 | M3、M4 |
| **M6 发布** | 推 Git、市场投稿 | tag + 市场记录 | V3 业务验证过；市场可查可装 | M5 |

## 2. M0 已完成（2026-10-17）

| 文件 | 作用 |
| --- | --- |
| `package.json` | `type: module`、`main: ./dsh/index.js`、`engines.node >= 22.5`、`files` 白名单 |
| `VERSION` → `lib/version.js` | 生成物；`build`/`commit` 来自 git，无 git 写 local，不猜 |
| `scripts/build-version.mjs` | 渠道由 `LYMBELL_CHANNEL` 指定（prototype/beta/stable） |
| `scripts/check-version.mjs` | 核对 5 处：原型 app.js、页面 title、页面全部版本字面量、`lib/version.js`、`package.json` |
| `scripts/check-wording.mjs` | 医疗表述红线：建议治疗 / 可能复发 / 预后良好 / 治愈率 / 确诊为… 等，命中即失败 |
| `knowledge/trials/collect.mjs` | 2026 淋巴瘤临床试验采集（`npm run kb:trials:collect`）：CT.gov API / Veeva 本地底册 / CDE（unified MCP）/ ChiCTR（sidecar），写 `knowledge/data/trials/*.json` |
| `scripts/probe-render.mjs` | 渲染探针（手动，`npm run probe:render [-- --negative]`）：27 视图 × 3 宽度查 h1 / 溢出 / JS 异常。依赖本机 Chrome，故不进 `npm run check` |
| `lib/layout.js` + `test/layout.test.mjs` | 面板 0.65 参数唯一来源；宽表最小宽度 417px 判定 |
| `test/version.test.mjs` | 8 条：版本一致、SemVer、`v` 前缀、渠道、build/commit 格式、冻结、包版本、原型版本 |
| `dsh/index.js` / `lib/client.js` | **占位**：安装直接抛错，避免"装上但不做事" |
| `schema/README.md` | 冻结说明：G3 前不接受 `.sql` |
| `knowledge/` | 2026 指南知识库：`data/*.json` 为源、`schema.sql` 定结构、`build.mjs` 重建、`query.mjs` 查询；产物 `lymphoma-kb.sqlite` 已被 `.gitignore` 忽略 |

真实执行结果（本机 Node v22.22.2）：

```
✓ 已生成 lib/version.js：v0.1.0（build local · prototype）
# tests 15 / # pass 15 / # fail 0
✓ 版本号一致：v0.1.0（共核对 5 处）
```

**M0 明确没做**：没建表、没写业务组件、没装依赖、没建 Git 仓库、没有 `cordis.patch.yml`、**没有在 DSH Desktop 里装过**。

## 3. 原型 v0.1.0 已完成

- 10 个一级页 / 27 个视图 / 5 套演示画像。
- 一图秀：多序列、时间窗、缩放、治疗周期条、评估节点、点选详情。
- 指标卡真 3D 翻转；Deauville 5 卡；周期表（计划/实际）。
- 分型库：24 项亚型（B 14 / T-NK 8 / 霍奇金 2），B/T/H 筛选。
- 一级页 10 项：营养支持 / 心理支持 / 照护与症状 / 复诊准备 取代原「副作用与支持」「随访与就诊」（D27）。
- 看板按任务优先重排：定调条 + 4 入口 + 关键变化 + 接下来 + 右侧三类卡片（D28）。
- 治疗历程：治疗线切换 + 第 2 线空态。
- 观察等待：惰性画像的看板专属大卡。
- 就诊准备两区 + Markdown 预览 + 复制。
- 设置面板三 tab（工作区 / 文档解析 / 临床数据库）。
- **不做**：药物卡片（D22）、预后评分计算（D18）、SPD 自动计算（D25）。
- 实测：27 视图 × 3 档宽度 = 81 次渲染，0 异常、0 页面级横向溢出；负向对照注入 2000px 后读到 1064px 溢出，检测有效。

## 4. 开发期四条硬约束

1. **G3 前不建表**。建表后只增不改；改历史迁移会被 `scripts/check-schema.mjs` 拦下。
2. **版本号只有一处数字**。改版本先改 `VERSION`，再跑 `npm run build:version`。
3. **UI 以确认后的原型为准**。文案、空态、错误文案都是验收的一部分，不得"顺手优化"。
4. **不编造**。没跑的验证写"未验证"，没有的地址不写。

## 5. 风险

| 风险 | 表现 | 应对 |
| --- | --- | --- |
| 亚型覆盖膨胀 | 每个亚型都要特例 | 亚型只作为数据；不为亚型写页面 |
| 分类变量被画成趋势 | Deauville 连成线 | A11 写死；图表只接受数值型 |
| 预后评分越界 | 自动算 IPI + 风险分组 | D18 写死：无计算入口，只记医生原值 |
| 试验模块变成推荐 | 排序、评分、"更适合" | 不排序；固定免责 |
| 药物资料扩权 | 从"列药名"扩成药物说明，抄到二手文案 | D22 写死：不做药物说明，指向说明书与研究方案 |
| MinerU 联网 | Token、限流、超时 | 先做未配置/失败/超时三态 |

## 5b. M1–M2 已完成（2026-10-17）

| 文件 | 作用 |
| --- | --- |
| `schema/0001_initial.sql` + `schema/freeze-contract.md` | 24 张表/视图；哈希进冻结合同，`check-schema` 拦改动 |
| `dsh/migrate.js` | 按编号执行、记录 checksum、已执行文件被改即失败 |
| `dsh/store.js` | 读模型（bootstrap 一次给全）+ 写入；`assertNotFuture` / `assertPlanDate` 两把尺子 |
| `dsh/kb.js` | 只读知识库：24 个亚型分型库、按亚型取试验线索（不排序不评分） |
| `dsh/seed.js` | 演示档案 5 套（只有 p1 完整），`npm run db:seed [-- --force]` |
| `dsh/paths.js` | 资料目录校验：主目录 / 根目录 / 桌面根 / 下载根 / 系统目录一律拒绝 |
| `dsh/server.js` | 零依赖 http：静态托管 `public/` + 16 个 `/api/*` 路由，只监听 127.0.0.1 |
| `scripts/dev-server.mjs` | `npm start`（默认 8788，可用 `--port` / `LYMBELL_DB` 覆盖） |
| `public/` | 界面：`style.css` 与渲染函数沿用原型，数据全部来自 `/api/bootstrap` |
| `scripts/check-ui-parity.mjs` | UI 一致性：27 视图 × 可选宽度，结构一致率门槛 98% |
| `scripts/check-syntax.mjs` | 语法门：`dsh/ lib/ scripts/ public/ knowledge/` 共 21 个脚本 |
| `test/store.test.mjs`、`test/server.test.mjs` | 23 条：迁移幂等、契约、私密默认、治疗线独立、接口 400/403 |

真实执行结果：

```
✓ 语法检查通过（21 个脚本）
✓ schema 冻结合同通过（1 个迁移文件，哈希一致）
✓ 医疗表述检查通过（7 个实现文件，0 处越界）
# tests 38 / # pass 38 / # fail 0
✓ 版本号一致：v0.2.0（共核对 7 处）
渲染 81 次（27 视图 × 3 档宽度）· 结构一致率均值 99.89% · 无溢出 · 0 异常
```

## 5c. M2 第二段 + 原生 Agent（2026-10-18）

| 能力 | 实现 | 状态 |
| --- | --- | --- |
| 报告导入 | `dsh/import.js` + `schema/0002_import.sql`（import_file / parse_job / candidate，哈希已冻结） | ✅ 单测 11 条 |
| MinerU 解析 | `dsh/mineru.js` + `lib/zip.js` + `dsh/labparse.js`（淋巴瘤字典 9 项指标，按位置对齐） | ✅ 假客户端单测；✅ **2026-10-18 真云端已跑**：真实 24 页 PD-L1 IHC 报告全链 30s 成功（上传→轮询→zip→full.md 58KB/232 块，16 张表还原为 HTML 表格），报告日期读到采样日期，字典 0 命中符合预期（IHC 不是 9 项化验单）。**仍未验证**：多页化验单的真云表格对齐、无文字层扫描件 OCR、限流/断网重试 |
| 草稿核对 | 「检查与指标 → 报告导入」子页：导入 → 解析 → 逐条收下/放弃 → 写 metric_point | ✅ 界面可用 |
| 开启前弹窗提醒 | 勾选「开启云端解析」先弹三条提醒（① 数据会上传云端 ② 建议先手动隐藏个人信息 ③ 为什么不能自动脱敏——认漏一处就是泄露），点「我已了解」才写 consent；取消勾选仍直接生效 | ✅ CDP 冒烟 9 项全过（`scripts/probe-consent.mjs` 手动跑） |
| 原生 Agent 面板 | 顶栏「对话」=调起按钮，右侧会话窗口，左缘分隔条可拖拽（业务区默认 65%） | ✅ CDP 实测开关/拖拽/持久化 |
| Desktop 适配 1.2.2 | `lib/client.js`：runtimeId `wb-xyb-openharness-dsh-plugins-lymphoma-workbench`（与仓库身份一致）、legacyWorkbenchIds `[lymbell, wb-dataelement-dsh-lymbell]`（旧身份可迁移）、register/isActive/ownsSession 契约、会话-项目绑定（`.desktop-session-projects.json`，无会话退 localStorage） | ⚠️ 契约+降级已实现；**真机 Desktop 未验证（P2 不得写装机通过）** |

边界：开场白只填原生草稿不自动发送（autoSend:false）；standalone 模式如实显示空态，不伪造 AI。

**M5 已落地（2026-10-20，v0.3.0）**：`dsh/index.js` 不再是占位——`name`/`inject`/`apply` 委托给零依赖的
`dsh/host.js`（可单测），`Config`（Schemastery schema）单独留在入口。业务库落在宿主分配的目录里，
资料目录仍由用户在界面上选（存在库里，不靠宿主恢复指针）。前缀规则：接口 `/api/lymphoma-workbench/api/*`、
页面 `/api/lymphoma-workbench/ui/*`，内部一律剥成独立启动时的形状，路由判断不因宿主分叉。
页面基址由服务端注入 `WB_API_BASE` 占位符，前端不自己判断跑在哪。

**客户端入口有两个，别合成一个**（这次踩出来的）：
- `lib/client.js` —— 给**宿主**加载，必须是 `window.__ModuleLoader__.load({...})` 包装。
  宿主的 renderer 不认原生 ESM，给它 ESM 会报 `Unexpected token 'export'`，
  宿主还会据此把整个包移出 web profile（plugin-recovery 实测会移除并留恢复备份）。
  源码在 `src/client.js`，由 `npm run build:client` 注入常量后生成。
- `lib/bridge.js` —— 给**页面**以原生 ESM 引入（`${apiBase}/bridge.js`），是 Desktop 1.2.2 的桥接。

**面板形态**：customFrame（2026-10-27 起，此前是标准分栏）。`src/client.js` 负责整页框架：
顶栏（品牌 + 版本 + 「AI 对话」按钮 + 收起）× 业务 iframe × 宿主原生会话栏（`conversation` prop）
+ 可拖分隔条。业务 UI 仍在 iframe 里指向自己的页面，见 `docs/UI-DESIGN.md` §6。

## 6. 与闸口的关系

- 本文件不构成闸口通过。G1 待签认、G2/G3 未审（见 SPEC §0）。
- M5 前必须过一次**空库启动**：删掉数据目录后能进空态，不崩、不静默建目录。
