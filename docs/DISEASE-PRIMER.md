# 疾病概要 · 淋巴瘤

> 本项目实例文件，由 `xyb-workbench-starter` 的 `templates/DISEASE-PRIMER.md` 复制而来。
> 规范：`docs/36-DISEASE-PRIMER.md`。四段固定，未整理也写「本台尚未整理」，**不许删段**。

- 项目 / 品牌：小铃铛 LymBell
- 病种：淋巴瘤（Lymphoma）
- 最后更新：2026-10-27
- 数据文件：`prototypes/v0.1/primer-data.js`（`window.DISEASE_PRIMER`，原型真相源）；产品副本 `public/primer-data.js` 由它同步而来，两边内容一致（md5 校验）
- README 对应段：`## 疾病概要`

## 1 定义（`definition`）

淋巴瘤是起源于淋巴细胞（B 细胞、T 细胞、NK 细胞）的恶性肿瘤的统称，按大类分霍奇金淋巴瘤（HL）与非霍奇金淋巴瘤（NHL）。它不是一个病，而是一棵层级树——「我在树的哪一层」决定了后面所有记录的含义。

- 分类骨架（`docs/LYMPH-DOMAIN.md`）：霍奇金（cHL 的 NSCHL / MCCHL / LRCHL / LDCHL，以及 NLPHL）；非霍奇金分成熟 B 细胞肿瘤、成熟 T/NK 细胞肿瘤、特殊部位（PCNSL、PTLD）、前体淋巴细胞（B-LBL / T-LBL）。
- 病理亚型是树的叶子：本项目「分型库」按 NCCN 有独立诊疗路径的亚型筛出 24 项（B 14 / T-NK 8 / 霍奇金 2）。亚型是数据行，不是代码分支。
- **分型 ≠ 分期**：分型看病理（形态、免疫表型、遗传学），分期看病灶分布，用的是 Lugano 2014。两者**不互推**——同一种分型可以出现在任何一期。
- 诊断依据四层：形态、免疫表型（CD20 / CD3 / CD10 / BCL2 / BCL6 / MUM1 / Ki-67 / EBER / PD-L1 等）、遗传学（FISH 看 MYC / BCL2 / BCL6，NGS、IG 重排）、临床（部位、症状、影像、骨髓）。
- 双打击 / 三打击指 MYC 与 BCL2 和/或 BCL6 重排同时存在，属高级别 B 细胞淋巴瘤范畴；本台只记 FISH 结果。

- 不写「预后差 / 恶性程度高」这类判读；不写「你属于某期」。
- 恶性程度分级（低/中/高）来自用户提供表，是**参考信息**，界面不据此给预后判断。

**来源**：WHO · Haematolymphoid Tumours 第 5 版（WHO-HAEM5）· [IARC 出版页](https://publications.iarc.who.int/Book-And-Report-Series/Who-Classification-Of-Tumours/Haematolymphoid-Tumours-2024) · 未取得原件（正文需订阅）· 页码待核 ｜ Lugano / JCO · Recommendations for Initial Evaluation, Staging, and Response Assessment of Hodgkin and Non-Hodgkin Lymphoma: The Lugano Classification · 2014（32(27):3059–3067）· [PMC 原文已取得](https://pmc.ncbi.nlm.nih.gov/articles/PMC4979083/) · 页码待核

> WHO 版本号此前记成「版本未核实」。2026-10-27 按 IARC 出版页 +《中国淋巴瘤诊疗指南（2026版）》正文的转引补记为第 5 版；蓝皮书正文仍未取得，不假装看过。

## 2 医学资料规范和指南情况（`evidence`）

| 机构 | 文件 | 版本 / 年份 | 原件 | 本台的用途 |
|---|---|---|---|---|
| NCCN | NCCN Guidelines · B 细胞淋巴瘤 | 4.2026（官网 2026-10-27 显示当前版本） | [未取得原件（全文需订阅）· 官方指南页](https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1480) | B 细胞各亚型的流程与线序条目 |
| NCCN | NCCN Guidelines · 霍奇金淋巴瘤 | 2.2026 | [未取得原件 · 官方指南页](https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1439) | 霍奇金亚型的流程条目 |
| NCCN | NCCN Guidelines · T 细胞淋巴瘤 | 2.2026 | [未取得原件 · 官方指南页](https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1483) | T/NK 各亚型的流程条目 |
| NCCN | NCCN Guidelines · CLL/SLL | **2.2027**（官网当前版本；此前记为 2.2026） | [未取得原件 · 官方指南页](https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1478) | CLL/SLL 的流程条目 |
| CSCO | CSCO 淋巴瘤诊疗指南 | 2026 年版（2026-04-24—25 指南会发布） | [未取得原件（全文未公开）· 指南会更新要点](https://www.liangyihui.net/trial/166618) | 国内可及性与本土实践差异 |
| 中华医学会 / 中华肿瘤杂志 | 中国淋巴瘤诊疗指南（2026版） | 2026 版（48(3):263–309，2026-03-23 在线发布） | [未取得原件（PDF 需订阅）· 期刊条目页](https://rs.yiigle.com/cmaid/1671095) | 国内口径的第二来源 |
| Lugano / JCO | Lugano 分类 | 2014（2026 年仍在沿用） | [已取得 · PMC 公开全文](https://pmc.ncbi.nlm.nih.gov/articles/PMC4979083/) | 分期与疗效评估的写法 |

链接全部为 `https://`，2026-10-27 逐条 curl 验活（HTTP 200）；复核命令 `node scripts/check-primer-links.mjs`。

- 一台一表，不合并。
- **原件列每一行都可点**：已取得公开全文的（Lugano 2014）指向原文；拿不到的指向官方出版信息页或指南详情页，文字照实写「未取得原件」。**不编 URL。**
- 分型与分期两套口径并存时两行都列（WHO 分类 vs Lugano），本表内不互推。
- NCCN CLL/SLL 官网当前是 **2.2027**，与本项目旧记录的 2.2026 不一致，按官网更正并在发展趋势段留痕。

**来源**：NCCN（4.2026 / 2.2026 / 2.2026 / 2.2027，[官方指南页](https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1480)，全文需机构订阅）· 页码待核 ｜ CSCO（2026 年版，第三方整理据 CSCO 指南会官方直播）· 页码待核 ｜ 中华医学会（2026 版，48(3):263–309，DOI 10.3760/cma.j.cn112152-20250605-00260）· 页码 263–309 ｜ Lugano / JCO（2014，[PMC 公开全文](https://pmc.ncbi.nlm.nih.gov/articles/PMC4979083/)）· 页码待核 ｜ 本项目 · `knowledge/README.md`（一手项目记录，无对外链接）

## 3 目前治疗全景概要（`landscape`）

按 **Lugano 分期 / 线序**分组，每组只列「指南列举过的手段类别」，不排序、不比优劣。

### 3.1 局限期（Lugano I–II 期）

- 系统治疗：以联合化疗方案为主，具体方案按亚型不同；本台只记方案名与周期。
- 受累部位放疗：在部分亚型与部分期别被列为治疗组成之一。
- 观察：部分惰性亚型在特定情形下被列为「先不治疗、定期复查」的路径。

### 3.2 晚期（Lugano III–IV 期）

- 系统治疗：化疗、靶向药、免疫治疗分别被列出，线序按亚型区分。
- 自体造血干细胞移植：在特定亚型与特定线序被列为选项之一。
- 细胞治疗（如 CAR-T）：在特定亚型与特定线序被列出；国内可及性需单独核实。

### 3.3 复发 / 难治与贯穿全程

- 二线及以后系统治疗：按亚型与既往用药选择，指南给的是候选清单，不是排序。
- 移植与细胞治疗的再评估：是否进入候选由医生按年龄、体能、器官功能判断。
- 临床研究：被列为正式选项，而不是最后手段。
- 疗效评估与复查节奏：按 Lugano 2014 + Deauville 记录报告原文；随访只整理「约在哪天、做了没有」。

**这一段末尾的固定出口（原话照抄，没有改写）：**

> 以上是文献与指南里列出的手段，按病期与线序排列，不代表任何一项适合你。选哪一个，这一句需要问你的医生。

**来源**：NCCN（4.2026 / 2.2026 / 2.2026 / 2.2027，[官方指南页](https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1480)，全文需机构订阅）· 页码待核 ｜ CSCO（2026 年版，[第三方整理据 CSCO 指南会官方直播](https://www.liangyihui.net/trial/166618)）· 页码待核

## 4 发展趋势（`trend`）

只写**已发生的事实**，每条都带日期或版本号。

1. **指南版本更替** —— 2026-02-13 NCCN T 细胞淋巴瘤 v2.2026（本项目收录，未逐条核原文）；2026-03-23《中国淋巴瘤诊疗指南（2026版）》在中华肿瘤杂志在线发布（48(3):263–309）；2026-04-24—25 CSCO 指南会在哈尔滨发布 2026 年版淋巴瘤指南；2026-09-16 NCCN B 细胞淋巴瘤 v4.2026，霍奇金 v2.2026；**2026-10-27 查 NCCN 官网：CLL/SLL 已从 2.2026 换版到 2.2027**（其余三份维持原版本）。
2. **监管批件** —— 本台尚未整理：本项目未逐条核验 NMPA 批件号与批准日期，不写。
3. **在研登记规模与阶段分布** —— 本台尚未整理：`knowledge/trials/` 有试验快照，但未做阶段分布统计，补齐前不写数字。
4. **分类体系更新** —— Lugano 分类 2014-09 在 JCO 发表（32(27):3059–3067），2026 年仍在沿用，PMC 全文公开可读；WHO 第 5 版（WHO-HAEM5）此前本项目记成「版本未核实」，2026-10-27 按 IARC 出版页与 2026 版国内指南转引补记。
5. **指南结构变化** —— 本台尚未整理：NCCN / CSCO 全文未取得，章节变化无从核对。

**来源**：NCCN（[官网指南页](https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1480)，2026-10-27 查，4.2026 / 2.2026 / 2.2026 / 2.2027）· 未取得原件 · 页码待核 ｜ CSCO（2026 年版，[指南会更新要点](https://www.liangyihui.net/trial/166618)）· 未取得原件 · 页码待核 ｜ Lugano / JCO（2014，[PMC 全文](https://pmc.ncbi.nlm.nih.gov/articles/PMC4979083/)）· 已取得 · 页码待核 ｜ 本项目 · `knowledge/README.md`（2026-10）· 一手项目记录

## 5 落地清单

- [x] `prototypes/v0.1/primer.css`（从 `assets/patterns/disease-primer.css` 复制，未改结构，颜色走项目令牌 + 兜底）
- [x] `prototypes/v0.1/primer.js`（从 `assets/patterns/disease-primer.js` 复制，未改逻辑）
- [x] `prototypes/v0.1/primer-data.js`（本文件四段转成 `window.DISEASE_PRIMER`）
- [x] `index.html` 三处引用：`<link rel="stylesheet" href="primer.css">` / `<script src="primer-data.js">` / `<script src="primer.js">`
- [x] 顶栏出现「?」（原型由模块自动插进 `.top-actions`；产品 `public/index.html` 手写 `.dp-trigger-inline` 按钮，位置更可控）
- [x] README 的 `## 疾病概要` 四段正文写好，小标题与数据文件一致
- [x] **§2.5 原件可点**：7 行表格「原件」列与 11 条 `original:false` 来源均带 `https` 链接；2 条一手项目记录标 `nolink:true` + note
- [x] **§2.6 看板状态卡**：原型与产品看板首卡四件齐全（卡头 / 锚点派生天数 / 现状行 / 出口按钮排）
- [x] 产品接入：`public/` 补入 primer 三件套 + 顶栏「?」，`check` 末尾追加链接闸门
- [x] `node scripts/probe-disease-primer.mjs --url http://127.0.0.1:8137/index.html` 全绿（10/10，含 P9 排版对齐）

## 6 验收（P1–P8）

实测命令（端口 8134，串行）：

```
cd lymphoma-workbench && NODE_OPTIONS= node scripts/probe-disease-primer.mjs \
  --port 8134 --url http://127.0.0.1:8134/prototypes/v0.1/index.html
```

| 编号 | 判据 | 结果 |
|---|---|---|
| P1 | 顶栏有可点「?」，aria-label 说明四段 | PASS（text="?"，label 含「定义」「趋势」） |
| P2 | 整页面板，四段齐全且顺序为 定义 → 指南 → 治疗全景 → 趋势 | PASS（definition › evidence › landscape › trend） |
| P3 | 面板宽高 ≥ 视口 90% | PASS（1249×829 / 视口 1280×860） |
| P4 | 打开压一条 history，`history.back()` 收起 | PASS（history.length=3，返回后 open=false） |
| P5 | 「返回」「关闭」两个独立可见入口 | PASS（back=true close=true same=false） |
| P6 | 关闭后焦点回触发按钮、滚动位置不变 | PASS（focusOnTrigger=true，scrollY 260→260） |
| P7 | Esc 只退一层 | PASS（open=false，URL 仍在本页） |
| P8 | 四段齐全、每段有来源、趋势段无禁止词 | PASS |
| P9 | 排版对齐：正文/列表/表格/来源行左基线一致，文本类右边界极差 ≤2px（1440/900/390 三档） | PASS |
| E0 | 页面无 JS 报错、无 console error | PASS |

合计 **10/10 PASS**（2026-10-27 用 starter 最新版探针实测，端口 8137）。另有 `node scripts/check-primer-links.mjs` 链接断言 20/20。

## 7 本项目教训

1. **「分型」与「分期」差点被写成一一对应**：初稿想写「DLBCL 通常是晚期」，这类句子在原文里没有依据，且把两套口径焊死。最终只写「分型看病理、分期看 Lugano，两者不互推」，并把「同一分型可出现在任何一期」写成显式一条。
2. **亚型列表是数据行，不是页面**：写定义时一度想按亚型各写一句「该怎么治」，那等于给 24 个亚型各写一份推荐。改成只写「亚型决定路径」，具体手段统一放在治疗全景段按分期/线序列。
3. **35/36 条流程未核原文**：知识库明明有内容，但 `flow.verified=0`。所以全文只写「指南里存在这一类手段」，不给剂量、不给页码、不写「指南推荐」。版本号与发布日期来自 `knowledge/README.md`，WHO 分类查不到版本就写「版本未核实」。
