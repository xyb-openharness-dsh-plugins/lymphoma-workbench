/* 小铃铛 LymBell · 疾病概要数据（36 号 v2）
 * 口径：docs/DISEASE-PRIMER.md；规范：starter docs/36-DISEASE-PRIMER.md。
 * 全部内容属第 ② 层（解释）：只写定义、文件、指南列举过的手段、已发生的变化。
 * 任何「你该怎么办」的判断都不在这里，固定出口是「这一句需要问你的医生」。
 *
 * 格式说明：本文件是 window.DISEASE_PRIMER 的纯字面量（无变量、无 IIFE），
 * 因为 starter 的 check-conformance 会用正则切 trend 段扫禁止词，
 * 也会被 HTML demo 直接 JSON 化读出。所以链接一律内联成字符串，不要抽成常量。
 *
 * 链接状态（2026-10-27 逐条用 primer-backfill verify-links.mjs 真浏览器验活）：
 * - NCCN 四份淋巴瘤指南 → 官方指南详情页，OK（全文需机构订阅，标「未取得原件」）；
 * - CSCO 2026 年版全文未公开 → 第三方整理的指南会更新要点，OK（已在 note 注明来源）；
 * - 中国淋巴瘤诊疗指南（2026版）→ 中华肿瘤杂志条目页，OK（含 DOI，全文 PDF 需订阅）；
 * - Lugano 2014 → JCO / PMC / Europe PMC 原文在当前网络返回 203 或 403（THIN/AUTH/CHALLENGE），
 *   未通过验活，按 §2.5 降为「未取得原件，据二次来源」；二次来源为中华肿瘤杂志 2026 版（OK）；
 * - WHO-HAEM5 → IARC 出版页，OK（正文需订阅，标「未取得原件」）；
 * - 「本项目」两行是一手项目记录，无对外链接，按 §2.5 写 nolink:true + note。
 * 复核命令：node scripts/check-primer-links.mjs --data prototypes/v0.1/primer-data.js
 */
window.DISEASE_PRIMER = {
  "brand": "小铃铛 LymBell",
  "name": "淋巴瘤",
  "en": "Lymphoma",
  "updated": "2026-10-27",
  "sections": [
    {
      "id": "definition",
      "title": "定义",
      "intro": "淋巴瘤是起源于淋巴细胞（B 细胞、T 细胞、NK 细胞）的恶性肿瘤的统称，按大类分霍奇金淋巴瘤（HL）与非霍奇金淋巴瘤（NHL）。"
        + "它不是一个病，而是一棵层级树——「我在树的哪一层」决定了后面所有记录的含义。",
      "points": [
        "分类口径是一棵层级树：霍奇金（经典型 cHL 的结节硬化型、混合细胞型、富于淋巴细胞型、淋巴细胞消减型，以及结节性淋巴细胞为主型 NLPHL）；非霍奇金里分成熟 B 细胞肿瘤、成熟 T/NK 细胞肿瘤、特殊部位（PCNSL、PTLD）与前体淋巴细胞（B-LBL / T-LBL）。本项目 docs/LYMPH-DOMAIN.md 记录的就是这条骨架。",
        "病理亚型是这棵树的叶子，也是所有记录的第一层背景：本项目「分型库」按 NCCN 有独立诊疗路径的亚型筛出 24 项（B 细胞 14 / T-NK 8 / 霍奇金 2）。亚型名首次出现给中文全称 + 英文 + 缩写。",
        "「分型」与「分期」不是一回事：分型看病理（形态、免疫表型、遗传学），分期看病灶分布，用的是 Lugano 2014。两者不互推——同一种分型可以出现在任何一期，同一期也可以是不同分型。",
        "诊断依据分四层：形态（HE 染色、组织架构）、免疫表型（CD20 / CD3 / CD10 / BCL2 / BCL6 / MUM1 / Ki-67 / EBER / PD-L1 等）、遗传学（FISH 看 MYC / BCL2 / BCL6，NGS 与 IG 重排）、临床（部位、症状、影像、骨髓）。本台逐项抄录报告结论，不做判读。",
        "双打击 / 三打击指 MYC 与 BCL2 和/或 BCL6 重排同时存在，属高级别 B 细胞淋巴瘤范畴；本台只记 FISH 结果，不解读。"
      ],
      "sources": [
        {
          "org": "WHO",
          "doc": "Haematolymphoid Tumours（造血与淋巴组织肿瘤分类）第 5 版 · WHO-HAEM5",
          "version": "第 5 版（IARC 出版页标 2024 年卷；中国淋巴瘤诊疗指南 2026 版转引为 2022 年第 5 版）",
          "original": false,
          "secondaryUrl": "https://publications.iarc.who.int/Book-And-Report-Series/Who-Classification-Of-Tumours/Haematolymphoid-Tumours-2024",
          "page": "页码待核",
          "note": "IARC 出版页，正文需订阅；本项目此前记录为「版本未核实」，现按出版页与 2026 版国内指南转引补记"
        },
        {
          "org": "Lugano / JCO",
          "doc": "Recommendations for Initial Evaluation, Staging, and Response Assessment of Hodgkin and Non-Hodgkin Lymphoma: The Lugano Classification",
          "version": "2014（J Clin Oncol 32(27):3059–3067）",
          "original": false,
          "secondaryUrl": "https://rs.yiigle.com/cmaid/1671095",
          "page": "页码待核",
          "note": "JCO / PMC / Europe PMC 原文在当前网络返回 203 或 403，未通过真浏览器验活；据《中国淋巴瘤诊疗指南（2026版）》转引"
        }
      ]
    },
    {
      "id": "evidence",
      "title": "医学资料规范和指南情况",
      "intro": "这台工作台里出现的每一条「该查什么、该怎么分期」，都应能追到下面某一份文件。"
        + "「原件」列每一行都可点：拿不到的（NCCN 全文需订阅、CSCO 全文未公开、中华肿瘤杂志 PDF 需订阅、"
        + "WHO 正文需订阅、Lugano 原文页在当前网络不可验证）指向官方出版信息页、指南详情页或可验证的二次来源，文字里照实写「未取得原件」。",
      "table": {
        "head": ["机构", "文件", "版本 / 年份", "原件", "本台的用途"],
        "rows": [
          [
            "NCCN",
            "NCCN Guidelines · B 细胞淋巴瘤",
            "4.2026（官网 2026-10-27 显示当前版本）",
            { "text": "未取得原件（全文需订阅）· 官方指南页", "url": "https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1480" },
            "B 细胞各亚型的流程与线序条目"
          ],
          [
            "NCCN",
            "NCCN Guidelines · 霍奇金淋巴瘤",
            "2.2026（官网 2026-10-27 显示当前版本）",
            { "text": "未取得原件（全文需订阅）· 官方指南页", "url": "https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1439" },
            "霍奇金亚型的流程条目"
          ],
          [
            "NCCN",
            "NCCN Guidelines · T 细胞淋巴瘤",
            "2.2026（官网 2026-10-27 显示当前版本）",
            { "text": "未取得原件（全文需订阅）· 官方指南页", "url": "https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1483" },
            "T/NK 各亚型的流程条目"
          ],
          [
            "NCCN",
            "NCCN Guidelines · CLL/SLL",
            "2.2027（官网 2026-10-27 显示当前版本；本项目此前记为 2.2026）",
            { "text": "未取得原件（全文需订阅）· 官方指南页", "url": "https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1478" },
            "CLL/SLL 的流程条目"
          ],
          [
            "CSCO",
            "CSCO 淋巴瘤诊疗指南",
            "2026 年版（2026-04-24—25 指南会发布）",
            { "text": "未取得原件（全文未公开）· 指南会更新要点", "url": "https://www.liangyihui.net/trial/166618" },
            "国内可及性与本土实践差异"
          ],
          [
            "中华医学会 / 中华肿瘤杂志",
            "中国淋巴瘤诊疗指南（2026版）",
            "2026 版（48(3):263–309，2026-03-23 在线发布）",
            { "text": "未取得原件（PDF 需订阅）· 期刊条目页", "url": "https://rs.yiigle.com/cmaid/1671095" },
            "国内口径的第二来源"
          ],
          [
            "Lugano / JCO",
            "Lugano 分类",
            "2014（2026 年仍在沿用）",
            { "text": "未取得原件（原文页返回 203/人机验证）· 据中华肿瘤杂志 2026 版转引", "url": "https://rs.yiigle.com/cmaid/1671095" },
            "分期与疗效评估的写法"
          ]
        ]
      },
      "points": [
        "指南给的是「通常怎么做」，不是「你该怎么做」。版本号必须写清：同一份指南隔一年，条目会变。",
        "本项目知识库 `flow.verified` 默认 0：36 条流程里 35 条未逐条核对原文。因此本台不引用具体条文、不给剂量与页码，只记「指南里存在这一类手段」。",
        "分型与分期分属两份口径：分型看病理分类，分期看 Lugano 2014。本台不把「某亚型」与「某期」写成一一对应。",
        "WHO 分类版本号此前在本项目 docs 与原型源码里查不到，曾按「版本未核实」处理；2026-10-27 按 IARC 出版页与《中国淋巴瘤诊疗指南（2026版）》的转引补记为第 5 版（WHO-HAEM5），蓝皮书正文仍未取得。"
      ],
      "sources": [
        {
          "org": "NCCN",
          "doc": "NCCN Guidelines · B 细胞 / 霍奇金 / T 细胞 / CLL-SLL",
          "version": "4.2026 / 2.2026 / 2.2026 / 2.2027",
          "original": false,
          "secondaryUrl": "https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1480",
          "page": "页码待核",
          "note": "链接指向 B 细胞淋巴瘤官方指南页，四份指南同在 NCCN 官网；全文需机构订阅"
        },
        {
          "org": "CSCO",
          "doc": "CSCO 淋巴瘤诊疗指南",
          "version": "2026 年版",
          "original": false,
          "secondaryUrl": "https://www.liangyihui.net/trial/166618",
          "page": "页码待核",
          "note": "第三方整理（据 2026 CSCO 指南会官方直播）；指南全文未公开发布页"
        },
        {
          "org": "中华医学会 / 中华肿瘤杂志",
          "doc": "中国淋巴瘤诊疗指南（2026版）",
          "version": "2026（48(3):263–309）",
          "original": false,
          "secondaryUrl": "https://rs.yiigle.com/cmaid/1671095",
          "page": "263–309",
          "note": "期刊条目页，DOI 10.3760/cma.j.cn112152-20250605-00260；全文 PDF 需订阅"
        },
        {
          "org": "Lugano / JCO",
          "doc": "Lugano Classification（J Clin Oncol 2014）",
          "version": "2014",
          "original": false,
          "secondaryUrl": "https://rs.yiigle.com/cmaid/1671095",
          "page": "页码待核",
          "note": "原文页（JCO / PMC / Europe PMC）在当前网络返回 203 或 403，未通过真浏览器验活；据《中国淋巴瘤诊疗指南（2026版）》转引"
        },
        {
          "org": "本项目",
          "doc": "knowledge/README.md（收录版本与核验状态）",
          "version": "2026",
          "original": true,
          "nolink": true,
          "note": "一手项目记录，无对外链接"
        }
      ]
    },
    {
      "id": "landscape",
      "title": "目前治疗全景概要",
      "intro": "下面按 Lugano 分期与线序列出指南里出现过的手段类别。这是「世界上大致有哪些办法」的地图，不是给你排的先后顺序，"
        + "也不含任何剂量、疗程与适用条件——那些必须由医生按你的病理分型、分期与体能状态决定。",
      "groups": [
        {
          "label": "局限期（Lugano I–II 期）",
          "points": [
            "系统治疗：以联合化疗方案为主，具体方案按亚型不同而不同；本台只记方案名与周期。",
            "受累部位放疗：在部分亚型与部分期别被列为治疗组成之一。",
            "观察：部分惰性亚型在特定情形下被列为「先不治疗、定期复查」的路径；是否适用由医生判断。"
          ]
        },
        {
          "label": "晚期（Lugano III–IV 期）",
          "points": [
            "系统治疗：化疗、靶向药、免疫治疗分别被列出，线序按亚型区分；本台不比较方案优劣。",
            "自体造血干细胞移植：在特定亚型与特定线序被列为选项之一。",
            "细胞治疗（如 CAR-T）：在特定亚型与特定线序被列出；是否国内可及需单独核实。"
          ]
        },
        {
          "label": "复发 / 难治",
          "points": [
            "二线及以后系统治疗：按亚型与既往用药选择，指南给的是候选清单，不是排序。",
            "移植与细胞治疗的再评估：是否进入候选由医生按年龄、体能、器官功能判断。",
            "临床研究：指南把「参加登记良好的临床试验」列为一项正式选项，而不是最后手段。"
          ]
        },
        {
          "label": "贯穿全程的两件事",
          "points": [
            "疗效评估：按 Lugano 2014 结合 Deauville 评分记录，本台只抄报告原文，不自行判读缓解与否。",
            "复查节奏：影像与随访间隔按医生安排执行，本台只把「约在哪天、做了没有」整理成时间线。"
          ]
        }
      ],
      "points": [
        "以上是文献与指南里列出的手段，按病期与线序排列，不代表任何一项适合你。选哪一个，这一句需要问你的医生。"
      ],
      "sources": [
        {
          "org": "NCCN",
          "doc": "NCCN Guidelines · B 细胞 / 霍奇金 / T 细胞 / CLL-SLL",
          "version": "4.2026 / 2.2026 / 2.2026 / 2.2027",
          "original": false,
          "secondaryUrl": "https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1480",
          "page": "页码待核",
          "note": "官方指南页；全文需机构订阅，本台不引用具体条文"
        },
        {
          "org": "CSCO",
          "doc": "CSCO 淋巴瘤诊疗指南",
          "version": "2026 年版",
          "original": false,
          "secondaryUrl": "https://www.liangyihui.net/trial/166618",
          "page": "页码待核",
          "note": "第三方整理（据 2026 CSCO 指南会官方直播）"
        }
      ]
    },
    {
      "id": "trend",
      "title": "发展趋势",
      "intro": "这一段只写已经发生的事：哪份文件换了版本、哪一天发布、本项目知识库收到哪一步。不写预测，不做评价，也不给任何倾向。",
      "points": [
        "2014-09：Lugano 分类在 J Clin Oncol 发表（32(27):3059–3067），2026 年仍在沿用；原文页（JCO / PMC / Europe PMC）在 2026-10-27 真浏览器验活时返回 203 或 403，本台未取得可验证原件。",
        "2026-03-23：《中国淋巴瘤诊疗指南（2026版）》在中华肿瘤杂志在线发布，48(3):263–309。",
        "2026-04-24—25：2026 CSCO 指南会在哈尔滨召开，《CSCO 淋巴瘤诊疗指南（2026年版）》在会上发布。",
        "2026-02-13：NCCN T 细胞淋巴瘤指南记为 v2.2026（本项目 knowledge/README.md 收录，未逐条核对原文）。",
        "2026-09-16：NCCN B 细胞淋巴瘤指南记为 v4.2026（本项目收录）；霍奇金指南同期记为 v2.2026。",
        "2026-10-27 查 NCCN 官网：四份淋巴瘤相关指南的当前版本为 B 细胞 4.2026、霍奇金 2.2026、T 细胞 2.2026、CLL/SLL 2.2027；CLL/SLL 已从本项目此前记录的 2.2026 换版。",
        "截至 2026-10：本项目知识库收录 15 个来源、24 个亚型、36 条流程；其中 35 条流程未逐条核对原文（flow.verified=0），核验状态随每条记录保存。"
      ],
      "sources": [
        {
          "org": "NCCN",
          "doc": "NCCN Guidelines · B 细胞 / 霍奇金 / T 细胞 / CLL-SLL（官网指南页，2026-10-27 查）",
          "version": "4.2026 / 2.2026 / 2.2026 / 2.2027",
          "original": false,
          "secondaryUrl": "https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1480",
          "page": "页码待核",
          "note": "官方指南页；全文需机构订阅"
        },
        {
          "org": "CSCO",
          "doc": "CSCO 淋巴瘤诊疗指南",
          "version": "2026 年版",
          "original": false,
          "secondaryUrl": "https://www.liangyihui.net/trial/166618",
          "page": "页码待核",
          "note": "第三方整理（据 2026 CSCO 指南会官方直播）"
        },
        {
          "org": "Lugano / JCO",
          "doc": "Lugano Classification（J Clin Oncol 2014）",
          "version": "2014",
          "original": false,
          "secondaryUrl": "https://rs.yiigle.com/cmaid/1671095",
          "page": "页码待核",
          "note": "原文页（JCO / PMC / Europe PMC）在当前网络返回 203 或 403，未通过真浏览器验活；据《中国淋巴瘤诊疗指南（2026版）》转引"
        },
        {
          "org": "本项目",
          "doc": "knowledge/README.md（来源数、亚型数、流程数与核验状态）",
          "version": "2026-10",
          "original": true,
          "nolink": true,
          "note": "一手项目记录，无对外链接"
        }
      ]
    }
  ]
}
