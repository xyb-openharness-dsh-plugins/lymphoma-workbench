# 小铃铛 LymBell · 淋巴瘤患者与照护者工作台

状态（2026-10-17）：**第二阶段进行中：v0.2.0 已可本机运行**。G3 数据模型已落地（`schema/0001_initial.sql` + `SCHEMA-SPEC.md`），M1 数据层与 M2 主线闭环已完成，`npm start` 即可用；G1/G2 待逐页签认，M5 未接 DSH，未发布、**不是 Git 仓库**。UI 与原型的一致率 99.89%（[UI-PARITY.md](docs/UI-PARITY.md)）。

开发代号 `lymphoma-workbench`；包名临时占位 `@lymbell-dsh/lymphoma-workbench`；许可证 MIT（版权方「LymBell 社区贡献者」）。

## 先看什么

1. **跑起来**：`npm start` → 打开 <http://127.0.0.1:8788/>（数据落在本机 SQLite，界面与原型一致）。
2. **原型**：[`prototypes/v0.1/index.html`](prototypes/v0.1/index.html) —— 本机双击打开，零依赖、无网络请求，全部模拟数据，刷新重置。原型已冻结在 v0.1.0，是界面验收基准。
3. **决策台账**：[`docs/DESIGN-SESSION.md`](docs/DESIGN-SESSION.md) §2（D1–D28）与 §4（Q1–Q10 答复）——想改哪个决定，从这里看理由。
4. **规格**：[`docs/SPEC.md`](docs/SPEC.md)（范围、闸口、产品立场、**页面清单 10 项**、验收 A1–A33、不做清单）。
5. **领域**：[`docs/LYMPH-DOMAIN.md`](docs/LYMPH-DOMAIN.md)（分型、分期、预后评分、疗效评估、指标字典、与乳腺癌的差异）。
6. **场景**：[`docs/SCENARIOS.md`](docs/SCENARIOS.md)（S1–S12）。
7. **界面**：[`docs/UI-DESIGN.md`](docs/UI-DESIGN.md)（视觉系统、页面结构、交互规格、实测结论）。
8. **验证**：[`docs/PROTOTYPE-REVIEW.md`](docs/PROTOTYPE-REVIEW.md)（做了什么、测了什么、**没测什么**）。
9. **原生 Agent**：顶栏「对话」按钮随时开/关右侧会话窗口，左缘可拖拽调宽；Desktop 宿主内由 Desktop 管理会话（runtimeId `wb-dataelement-dsh-lymbell`），本机模式如实显示空态。
10. **开发计划**：[`docs/DEV-PLAN.md`](docs/DEV-PLAN.md)（M0–M2 已完成，M3/M4 部分）。
10. **数据模型**：[`docs/SCHEMA-SPEC.md`](docs/SCHEMA-SPEC.md)（实体、约束、写入语义、不做清单）。
11. **UI 一致性**：[`docs/UI-PARITY.md`](docs/UI-PARITY.md)（怎么量、本次结果、已知差异）。

## 为什么淋巴瘤工作台不能照搬乳腺癌

| 维度 | 乳腺癌 | 淋巴瘤 |
| --- | --- | --- |
| 起点 | 一个器官、一套分期 | **亚型决定一切**：>80 个亚型，治疗与随访各不同 |
| 分期 | TNM | **Lugano**（结内/结外/脾/肝/骨髓 + A/B 症状） |
| 疗效 | 影像大小 + 标志物 | **PET-CT + Deauville 5 分**（分类变量，不能画折线） |
| 治疗 | 手术 → 化疗 → 内分泌 | **方案组合 + 线数**（R-CHOP、ABVD、BTKi 长期吃、CAR-T） |
| 状态 | 术后康复、上肢 | **观察等待、维持治疗、移植、复发难治** |
| 风险 | 淋巴水肿、骨健康 | **肿瘤溶解、粒缺发热、HBV 再激活、PJP、IgG 低下** |

所以本项目的核心页不是「术后上肢」，而是**我的分型**与**疗效评估**；一图秀的中心不是"把 16 个指标画在一起"，而是"把治疗线、评估节点与可量化指标放回同一段时间"。

## 页面清单（10 项）

看板 · 我的分型 · 治疗历程 · 检查与指标 · 病情一图秀 · **营养支持** · **心理支持** · **照护与症状** · **复诊准备** · 临床试验

前 5 项是"我的病情"，中间 4 项是"今天能做的事"，最后 1 项是"还能问什么"。设置不占一级导航。理由见 [SPEC §4](docs/SPEC.md)、[DESIGN-SESSION D27](docs/DESIGN-SESSION.md)。

## 目录

```
docs/            规格、领域、场景、界面、决策台账、开发计划、数据模型、UI 一致性
prototypes/v0.1/ 零依赖 HTML 原型（验收基准，冻结在 v0.1.0）
public/          真实界面：style.css 与渲染函数沿用原型，数据来自 /api/*
knowledge/       2026 指南知识库：data/*.json → lymphoma-kb.sqlite（可重建）
lib/             版本生成物、面板布局参数、客户端占位
dsh/             migrate / store / kb / seed / paths / server（index.js 仍是占位）
schema/          0001_initial.sql + freeze-contract.md（只增不改）
scripts/         版本生成与校验、语法门、schema 冻结、医疗文案红线、渲染探针、UI 一致性
test/            38 条单测（版本 9 + 布局 7 + 数据层 13 + 服务端 9）
workspace/       本机业务库（lymbell.sqlite，已被 .gitignore 忽略）
```

## 指南知识库（2026）

`knowledge/lymphoma-kb.sqlite` 收了 **15 个来源 / 24 个亚型 / 36 条流程 / 177 个步骤 / 26 个可问的问题**，覆盖 NCCN B 细胞 v4.2026、霍奇金 v2.2026、T 细胞 v2.2026、CLL v2.2026，以及 CSCO 淋巴瘤 2026 与《中国淋巴瘤诊疗指南（2026 版）》。

```bash
npm run kb:build                     # 从 data/*.json 重建（构建前自检）
npm run kb:query -- --flow mcl-1l    # 看一条流程
npm run kb:query -- --search 中枢     # 全文搜
npm run kb:query -- --check          # 一致性自检
```

**边界**：库内是**条文索引**，不是患者端内容。`step` 不得直接渲染；患者端只出 `question` 里的问题。35/36 条流程标了 `verified=0`（未逐条核对原文，内容经公开解读页转述），对外使用前必须回原文核一遍。详见 [knowledge/README.md](knowledge/README.md)。


## 本机运行

```bash
npm start                 # 默认 http://127.0.0.1:8788/，业务库 ./workspace/lymbell.sqlite
npm start -- --port 9000  # 换端口
LYMBELL_DB=/path/to.db npm start
npm run db:seed -- --force   # 重置演示档案（5 套，只有 DEMO-1 完整）
```

首次启动会自动建库并写入演示档案。写进库的东西：体温、症状、进食、体重、会诊、给药、
新治疗线、问题、看法、待办、试验收藏。资料目录在「设置 → 工作区」里选，主目录 / 根目录 /
桌面根会被明确拒绝。

## 命令

```bash
npm run check            # 版本 → 语法（21 个脚本）→ schema 冻结 → 医疗文案红线 → 38 条单测 → 版本一致
npm run check:ui-parity  # 界面 vs 原型：27 视图结构一致率，门槛 98%（需本机 Chrome）
npm run probe:render     # 原型的 27 视图 × 3 宽度渲染探针（加 -- --negative 做负向对照）
npm test                 # 只跑单测
npm run check:version
npm run pack:check
```

`dsh/index.js` 与 `lib/client.js` 是**占位**：安装会直接抛错，M5 才实现。

## 产品立场（沿用乳腺工作台 D16，本项目 D3）

诊断、分期、疗效判读与处置全部归医生。工作台提供的是**边际信息**：把散落的病理、影像、化验与用药记录归拢、标出处、按时序摆好，让每次沟通有据可查。

- 用户的判断与担心按一条信息记录（`viewpoint`），标注「不是医生结论」，不进趋势、不进摘要事实区。
- 工作台**不判读**病理与影像，不把 Deauville 分数改成"好/坏"，不把 IPI 算成预后判断。
- 临床试验线索只做备忘，**不推荐、不排序、不预测获益**。

## 许可与免责

- 许可证 MIT；Logo 与品牌素材由项目发起人提供，公开使用与商用授权未在本次范围内确认（见 [assets/README.md](assets/README.md)）。
- 本项目**不是医疗器械**，不提供诊断、治疗或用药建议。界面里的"联系治疗团队""跟医生讨论"只是提示，不构成判断。
