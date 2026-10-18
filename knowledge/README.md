# 淋巴瘤知识库（2026）

两份东西，一个库：

1. **指南条文**——2026 年公开的淋巴瘤诊疗指南，落成流程、步骤、可问的问题。
2. **临床试验登记**——2026 年登记的淋巴瘤相关试验，来自四个登记源。

- 产物：`knowledge/lymphoma-kb.sqlite`（构建生成，不要手改）
- 数据：`knowledge/data/*.json`（指南，人工维护）、`knowledge/data/trials/*.json`（试验快照，采集生成）
- 结构：`knowledge/schema.sql`
- 构建：`npm run kb:build`（整库重建）
- 查询：`npm run kb:query -- --flow mcl-1l` / `npm run kb:trials`

## 一句话边界

**这是条文索引，不是临床决策依据。** 它服务于三件事：核对指南怎么说、生成可以带去问医生的问题、给数据模型提供字段与枚举。它不用于给患者输出方案、不判读影像、不给预后结论。

## 收录的 2026 年版本

| 来源 | 版本 | 发布 | 层级 |
| --- | --- | --- | --- |
| NCCN B 细胞淋巴瘤 | **4.2026** | 2026-09-16 | 指南 |
| NCCN 霍奇金淋巴瘤 | **2.2026** | 未标注 | 指南 |
| NCCN T 细胞淋巴瘤 | **2.2026** | 2026-02-13 | 指南 |
| NCCN CLL/SLL | **2.2026** | 2026-03 | 指南 |
| CSCO 淋巴瘤诊疗指南 | **2026 年版** | 2026-04-25 | 指南 |
| 中国淋巴瘤诊疗指南 | **2026 版**（中华肿瘤杂志 48(3):263–309） | — | 指南 |
| Lugano 分类 | 2014（2026 年仍在沿用） | 2014-09 | 共识 |

NCCN B 细胞 v4.2026 的 MCL 更新是本轮最实质的变化：TP53 诊断时必检、TRIANGLE 成为 fit 且无 TP53 突变者的一线首选、一线后高敏 MRD 阴性可跳过自体移植。

## 证据层级：为什么每行都带 `tier`

| tier | 含义 | 能不能当结论用 |
| --- | --- | --- |
| `guideline` | 指南本体或官方详情页 / JNCCN 指南摘录 | 可引用，仍需看原文条款 |
| `guideline_summary` | 专业媒体对指南的解读 | **不能**，只能当线索 |
| `consensus` | 分期、疗效标准的共识文献 | 可引用定义 |
| `review` | 二手综述或报道 | **不能**，只能当线索 |

`flow.verified = 0` 表示这条流程**没有逐条核对过指南原文**。当前 36 条流程里 35 条是 0——因为 NCCN 与 CSCO 的全文需要账号或未公开，库内内容多经公开解读页转述。这不是瑕疵遮盖，而是明确标注：要拿去对外使用前，必须回原文核一遍，核完把 `verified` 改成 1。

## 结构

```
source       来源（15 条）：机构、标题、版本、发布日、取用日、URL、语言、层级
subtype      亚型（24 条）：与原型 SUBTYPES 一一对应，B 14 / T 8 / H 2
flow         流程（36 条）：一个亚型在一个阶段的一条路径
step         步骤（177 条）：诊断 / 分期 / 分层 / 决策 / 治疗 / 评估 / 随访 / 支持
question     可问的问题（26 条）：面向用户的唯一出口
metric_def   分期与评分口径（8 条）：Lugano、Deauville、Lugano 疗效、IPI、FLIPI、MIPI、PIT、IPS
v_step_source 视图：一步一行，直接看到出处与层级

trial          临床试验（2792 条）：登记号、标题、适应症、干预、期别、状态、中国站点
trial_source   试验来源（5 条）：机构、接入方式
trial_run      每个来源的采集终态：ok / partial / unavailable / failed + 说明
trial_fts      FTS5（trigram）全文索引：中文子串可搜
v_trial        试验 + 来源标签
v_trial_cross  同一登记号出现在多个库（当前 76 条）
```

`step.kind` 有四种：`action` 要做的事、`decision` 分支点、`checkpoint` 评估节点、`note` 易错点。

每条 step 都必须有 `locator`（指南章节名）。**不写页码**：库里的页码无法核实，写了就是假精度。

## 临床试验（2026）

`npm run kb:trials:collect` 从四个登记源采集，写 `knowledge/data/trials/<source>.json` 原始快照；`npm run kb:build` 把快照写进库。**快照与库都可重建**，库里每一行都能指回快照。

### 四个来源与各自口径

| 来源 | 接入方式 | 2026 口径 | 入库 |
| --- | --- | --- | --- |
| `ctgov` ClinicalTrials.gov | 官方 API v2 直连 | `LastUpdatePostDate ≥ 2026-01-01` | 2583 |
| `veeva` Veeva CTV | 本地底册 `~/.ctv-mcp/ctv.db` | `last_update_post_date` 或 `start_date` 在 2026 | 77 |
| `cde` 中国药物临床试验登记平台 | `unified_search_trials` 的 MCP 工具 `search_trials` | 关键词「淋巴瘤」+ CTR 号前缀 `CTR2026` | 50 |
| `chictr` ChiCTR | 本地 sidecar `:8848` | `createyear=2026` | 82 |
| `ictrp` WHO ICTRP | 同上（unified） | 无年份过滤 | **0（unavailable）** |

**为什么各源口径不同**：登记库的字段本来就不同。CT.gov 有 `LastUpdatePostDate`，ChiCTR 有注册年份，CDE 的列表页**没有日期列**，只能靠 CTR 号前缀（登记号按年递增）。这是数据源的形状，不是我们偷懒。

### 采集前置（两个外部服务）

```bash
# 1) ChiCTR sidecar（不常驻，用时再起；过阿里盾用 curl_cffi，不需要每次装浏览器）
cd ~/Downloads/chictr_trials && .venv/bin/python sidecar/chictr_sidecar.py
curl -sS http://127.0.0.1:8848/health          # 期望 {"ok": true}

# 2) CDE 会话 Cookie（会过期；过期后 collect 会报 CHALLENGE_REQUIRED）
cd ~/Downloads/unified_search_trials
node dist/src/cli/main.js configure --cookie-from-entry-page --config-dir ~/.unified-trial-mcp
```

Veeva 与 CT.gov 不需要前置：前者读本地底册，后者是公开 API。

### 命令

```bash
npm run kb:trials:collect                 # 采集四个源（ictrp 需 -- --source ictrp 单独跑）
npm run kb:trials:collect -- --source cde # 只采一个源
npm run kb:build                          # 快照 → SQLite
npm run kb:trials                         # 概况：按来源/状态/期别
npm run kb:query -- --trials cde          # 按来源列最近 20 条
npm run kb:query -- --trial CTR20260803   # 单条详情
npm run kb:query -- --trial-search 双抗    # 全文检索（trigram，中英文子串）
npm run kb:query -- --trial-sources       # 来源清单与采集终态
```

### 试验这块的红线

- **不排序、不评分、不推荐。** 库里有 `status`、`phase`，但没有"匹配度""推荐度"字段，也没有"你适合哪条"。要不要问、能不能入组，是治疗团队的事。
- **`unavailable` 不等于 0。** `trial_run.status` 记录每个源这次到底查没查到；`unavailable` 的源没有数据，不代表"没有试验"。ICTRP 当前就是这种情况。
- **CDE 的 2026 是"登记号年份"，不是"公示日期"。** CTR 号按年递增，前缀可靠；但库里 `start_date` 为空，因为列表页不提供。
- **ChiCTR 没有招募状态。** 列表页不返回，补状态要逐条拉详情（1.5s/条），本轮没做，`status` 留空而不是猜。
- **入排标准没有入库**（CT.gov 列表 API 不含，CDE 需拉详情）。所以这库只能回答"有什么在登记"，不能回答"我能不能进"。
- **检索命中要分两种看。** `trial.matched_by` 有两类：`condition`（适应症字段真的写了淋巴瘤/霍奇金/DLBCL 等）与 `text`（只是检索词在标题、摘要或入排里出现过）。当前 2404 条是前者，388 条是后者——后者里有 `GEP-NET`、`Chondrosarcoma` 这类明显不相关的试验，也有 `DLBCL` 缩写没被词表覆盖的真淋巴瘤试验。**导出前必须自己筛一遍**，库不做这个判断。
- **CT.gov 的 `lymphoma` 条件会带进 ALL、白血病混合试验。** 例如 `CAR-T Cell Therapy for ALL`。这不是错，因为登记条件本来就写在淋巴瘤下；用 `conditions` 字段自己筛。

### 已知缺口

- ICTRP 未接入（上游 python 服务返回 isError，本轮 0 条，如实记为 `unavailable`）。
- Veeva 底册是本地缓存副本（1434 条），淋巴瘤相关只有 77 条；零命中只代表本地索引未命中。
- 没有逐条回源核对试验状态；登记信息会变，导出前应回来源原文。
- 没有做跨源去重合并（只做了 `v_trial_cross` 视图标出同号），同一试验在多库仍占多行。

## 查询

```bash
npm run kb:build                    # 重建（构建前自检，失败不写库）

npm run kb:query                    # 概况
npm run kb:query -- --list          # 24 个亚型 + 流程数
npm run kb:query -- --flow dlbcl-1l # 一条流程的全部步骤
npm run kb:query -- --subtype mcl   # 一个亚型的流程与问题
npm run kb:query -- --search 中枢    # 全文搜步骤
npm run kb:query -- --questions chl # 可问的问题
npm run kb:query -- --metrics       # 分期/评分口径
npm run kb:query -- --sources       # 来源清单
npm run kb:query -- --check         # 一致性自检（不重建，含试验表）
```

直接查库也可以：

```bash
sqlite3 knowledge/lymphoma-kb.sqlite \
  "SELECT seq, phase, title FROM step WHERE flow_id='mcl-1l' ORDER BY seq;"
```

## 更新方法

1. 改 `data/*.json`（加流程、改步骤、补来源）。
2. `npm run kb:build`。构建前会自检：source 是否存在、seq 是否重复、phase/kind 是否合法、每步是否有 locator。任一条不过就**整库不写**。
3. `npm run kb:query -- --check`。
4. 如果是核对过原文，把该 flow 的 `verified` 改成 `1`，并在 `note` 写清核对人与日期。

新增亚型时，`subtype` 与 `flow` 要一起补；`--check` 会拦住「24 个亚型没有流程」的情况。

## 红线

- **不把 step 直接渲染给患者。** 患者端只能出 `question` 表里的问题，以及"指南提到过这个方向"这类中性表述。理由：step 里写着具体方案与推荐级别，直接展示就变成了方案推荐。
- **不复算评分。** `metric_def` 只解释定义，`must_not` 字段写死了不许做什么。
- **不把解读当原文。** `tier=guideline_summary` 与 `review` 的内容不得标成"指南推荐"。
- **不写页码、不写剂量。** 页码无法核实；剂量不属于本工作台的职责。
- **不覆盖旧版本。** 指南升版时新建 source 与新 flow，旧记录保留，用 `version` 区分。

## 已知缺口

- 35/36 条流程未核对原文（见上）。
- PTLD、B-LBL、ATLL、HSTCL、T-LGL/T-PLL 只搭了骨架，步骤少于核心亚型。
- 随访节奏来自 NCCN/ESMO 的二手综述，具体间隔仍需按亚型原文核对。
- NCCN T 细胞指南的官方详情页 URL 未留存；CSCO 2026 与 NCCN 全文未公开，条目均经解读页转述。
- 未收录儿童淋巴瘤、原发皮肤淋巴瘤、原发中枢神经系统淋巴瘤——这三类在 NCCN 里是独立指南，不在本库范围。
- 试验部分只覆盖 2026 年登记/更新的记录，不是历史全量；跨年检索要另跑采集。
