# 小铃铛 LymBell · 数据模型规格 SCHEMA-SPEC v0.2

日期：2026-10-17。状态：**已作为 G3 产物落地**（用户 2026-10-17 指示「sqlite 完成后继续下一步系统开发」放行）。
结构以 `schema/0001_initial.sql` 为准；本文解释**为什么这么定**，以及写入时必须守的语义。

上级文档：[SPEC §5](SPEC.md) · [DEV-PLAN §1](DEV-PLAN.md) · [LYMPH-DOMAIN](LYMPH-DOMAIN.md) · [DESIGN-SESSION](DESIGN-SESSION.md)（D17–D28）。

---

## 1. 开宗明义：三件事先答清楚

| 必须回答的问题 | 本模型的答案 |
| --- | --- |
| 分型改了以后，旧的还在吗？ | 在。`subtype_assertion` / `staging` 各是一条版本链：更正只 `INSERT` 新行并把旧行 `is_current` 置 0，**不 UPDATE 内容、不 DELETE**（两个 `no_rewrite` / `no_delete` 触发器挡着）。 |
| 「未检测」和「阴性」怎么区分？ | `pathology_marker.result_state` 三态：`reported` / `not_tested` / `insufficient`。`result_text` 存原文（「未检测」），**不补成阴性**（A4）。 |
| 用户说「我担心一停药就回来」存哪？ | `viewpoint`，`is_private` 默认 1（私密默认 fail-closed，D39 同款）；渲染时恒带「这不是医生结论」，不进趋势、不进导出事实区。 |

**权威是领域模型，不是页面。** 页面只用来证明模型漏了什么（见 §6 的"界面字段对照"），不反过来决定表结构。
本模型里没有 Tab 名、没有折叠/缩放/选中这类界面状态列。

---

## 2. 存储选型与约定

| 项 | 约定 | 理由 |
| --- | --- | --- |
| 引擎 | SQLite（`node:sqlite` 的 `DatabaseSync`），单文件 | 本机优先；与宿主插件同进程，无外部服务 |
| 主键 | `profile` / `document` 用 `TEXT`（如 `p1`、`d1`）；其余 `INTEGER` 自增 | 跨库引用稳定；导出合并时可去重 |
| 时间 | 日期 `TEXT 'YYYY-MM-DD'`；时刻 ISO-8601 文本 | 与原型、导出同格式，避免时区歧义 |
| 布尔 | `INTEGER 0/1` + `CHECK (x IN (0,1))` | SQLite 无原生 bool |
| 枚举 | `TEXT` + `CHECK ... IN (...)` | 比关联表轻，取值集中在本文件 |
| 单位 | 值旁必带 `unit`（或 `value_text` 保原文），不依赖指标默认单位 | 同一指标可能换单位，旧值不悄悄换算 |
| 删除 | 业务数据不物理删除（分型/分期有触发器禁止 DELETE） | 来源与导出要能回溯 |
| 未来日期 | 只有 `task.due_on`、`treatment_line.next_on` 允许晚于当天；其余事件一律不得未来 | 借用 D40 的两把尺子 |

---

## 3. 实体关系

```
workspace（单行）   profile ─┬─ subtype_assertion（版本链）─┬─ pathology_marker
                            │                             └─ lesion
                            ├─ staging（版本链）── b_symptom
                            ├─ consultation
                            ├─ treatment_line ─┬─ regimen_drug
                            │                  ├─ cycle
                            │                  └─ response
                            ├─ adverse_event
                            ├─ metric_point ── metric_def（is_numeric 决定是否可画趋势）
                            ├─ lab_result / infection_screen / fever_log / symptom_log / nutrition_log
                            ├─ document（原件，含 sha256）
                            ├─ viewpoint / question / task
                            └─ saved_trial（只记线索，不记药物说明，D22）
```

一条链要记住：**治疗线是容器，不是属性。** 方案、周期、评估都挂在 `line_id` 上；切到第 2 线没数据时，上一线的任何东西都不会出现在读模型里（A32）。

---

## 4. 关键实体与判定

### 4.1 分型：`subtype_assertion`

- `lineage` ∈ `B / T / H`（B 细胞 / T-NK 细胞 / 霍奇金）。
- 同一档案至多一条 `is_current = 1`（部分唯一索引约束）。
- 更正：插入新行 → 旧行 `is_current = 0` → 新行 `supersedes_id` 指向旧行。两步在同一事务里完成。
- 不做的事：`lineage` 不决定页面；24 个亚型属于知识库 `subtype` 表，**不在业务库复制一份**（避免两处漂移）。

### 4.2 病理标记：`pathology_marker`

| 字段 | 含义 |
| --- | --- |
| `panel` | `IHC` / `FISH` |
| `result_text` | 报告原文（「阳性（弥漫）」/「阴性」/「未检测」） |
| `result_state` | `reported` / `not_tested` / `insufficient` |
| `source_document_id` | 指向原件，满足 A3（每项可回原文） |

### 4.3 疗效：`response`

- `deauville` 只接受 1–5 或 NULL。**不从 SUV 反推分数**（D19）。
- `clinician_label` 存医生原话标签（CR/PR/SD/PD），工作台不推断、不改写。
- `deauville` 是分类变量：禁止出现在折线图里（A11），只在节点/格子呈现。

### 4.4 指标：`metric_def` + `metric_point`

- `metric_def.is_numeric = 0` → 分类变量，不进一图秀曲线。
- `metric_point.value_num` 为 NULL 而 `value_text` 非空时，表示原文不是数（如 `<0.5`），**界面显示原文、不画点**。
- 归一化只用于同屏回顾（各序列按自身 min–max），读数不能跨指标比较（A15）。

### 4.5 本人记录：`viewpoint` / `question` / `task`

- `question.kind`：`fact`（想问的事）/ `view`（我的看法）。导出时分两区，看法区首行带声明（A23）。
- `task.due_on` 允许未来；`done = 1` 时写 `done_on`。
- 看法与担心不参与任何判断，也不是结论（D16）。

### 4.6 试验线索：`saved_trial`

- 只存 `trial_key`（来源 + 登记号）与收藏日期，**不存药物机制、研发阶段、疗效数据**（D22）。
- 不排序、不评分、不记匹配度（AGENTS：线索不是推荐）。

---

## 5. 写入语义（store 必须守）

1. **只增不覆盖**：分型、分期的更正走版本链；任何 `UPDATE` 只允许改 `is_current`。
2. **缺测是 NULL**：`temp_c`、`deauville`、`grade` 缺了就留 NULL，不写 0。
3. **延迟必须有原因**：`cycle.delay_days > 0` 时 `delay_reason` 不能为空（建表 CHECK 已挡，A9）。
4. **事件日期不得未来**：除 §2 列出的两个计划类字段，其余一律校验；越界拒绝写入并给可读原因。
5. **导入不克隆**：同一 `(profile_id, sha256)` 的原件重复导入不新增；解析失败不产候选（沿用 A2 语义）。
6. **私密默认**：读 `viewpoint` 用 `includePrivate = false` 起步，本人页面与导出时显式放开（D39）。
7. **不写派生结论**：任何"风险分组""预后分层""推荐方案"都不落库——它们本来也不该存在。

---

## 6. 界面字段对照（证明模型够用，也只用于此）

| 界面位置 | 读哪些表 |
| --- | --- |
| 看板 · 当前分型 | `v_profile_current`（subtype / stage）+ 当前 `treatment_line` |
| 看板 · 接下来 | `task`（未完成、按 `due_on` 排序） |
| 看板 · 最近变化 | `metric_point` 末两次 + `metric_def` |
| 我的分型 | `subtype_assertion`（当前）+ 分类树位置 + `consultation` |
| 病理与分子 | `pathology_marker`（IHC/FISH） |
| 分期与病灶 | `staging` + `b_symptom` + `lesion` |
| 治疗历程 | `treatment_line` + `regimen_drug` + `cycle` + `response` |
| 检查与指标 | `lab_result` / `infection_screen` / `metric_point` |
| 病情一图秀 | `metric_point`（仅 `is_numeric = 1`）+ `treatment_line` 的周期条 |
| 就诊准备 | `question` + `viewpoint` + 选定的关键记录 |
| 临床试验 | 知识库 `trial` + 业务库 `saved_trial` |

---

## 7. 明确不做

- 不做预后评分表（IPI / FLIPI / MIPI / PIT / IPS 一律不进库，D18）。
- 不做药物字典（D22）。
- 不做治疗推荐与匹配度字段。
- 不做入排标准落库（AGENTS：入排不在库里）。
- 不做症状与用药的因果字段（A14：只记时间关系）。
