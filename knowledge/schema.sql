-- 小铃铛 LymBell · 淋巴瘤指南知识库
-- 用途：把 2026 年公开指南里的「诊疗流程」落成可查询的本地库。
-- 立场：这是条文索引，不是给患者的结论；不做推荐、不做分期判断、不替代临床。
-- 重建：npm run kb:build（整库重建，不增量改）

PRAGMA foreign_keys = ON;

-- 元信息：构建时间、口径、免责声明
CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 来源：每一条流程/步骤都必须能指回这里
CREATE TABLE source (
  id           TEXT PRIMARY KEY,
  org          TEXT NOT NULL,                -- NCCN / CSCO / 中华医学会…
  title        TEXT NOT NULL,
  version      TEXT,                         -- 4.2026 / 2026 版
  published_on TEXT,                         -- ISO 日期；不确定写 NULL，不猜
  accessed_on  TEXT NOT NULL,
  url          TEXT,
  lang         TEXT NOT NULL CHECK (lang IN ('en', 'zh')),
  tier         TEXT NOT NULL CHECK (tier IN ('guideline', 'guideline_summary', 'consensus', 'review')),
  note         TEXT
);

-- 亚型：与原型 24 项一一对应
CREATE TABLE subtype (
  id          TEXT PRIMARY KEY,
  code        TEXT NOT NULL,                 -- 原型里显示的缩写
  name_zh     TEXT NOT NULL,
  name_en     TEXT,
  lineage     TEXT NOT NULL CHECK (lineage IN ('B', 'T', 'H')),
  nccn_group  TEXT,                          -- B-Cell / CLL / T-Cell / Hodgkin
  ordinal     INTEGER NOT NULL DEFAULT 0,    -- 分型库里的排列顺序（B → T/NK → 霍奇金）
  grade_text  TEXT,                          -- 恶性程度：抄自用户提供的淋巴瘤分类表，属参考信息
  dept_text   TEXT,                          -- 常见就诊科室：同上
  note        TEXT
);

-- 流程：一条流程 = 一个亚型在一个阶段的诊疗路径
CREATE TABLE flow (
  id         TEXT PRIMARY KEY,
  subtype_id TEXT REFERENCES subtype (id),
  title      TEXT NOT NULL,
  intent     TEXT NOT NULL,                  -- 这条流程回答什么问题
  scope      TEXT NOT NULL,                  -- 适用人群/阶段
  source_id  TEXT NOT NULL REFERENCES source (id),
  verified   INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
  note       TEXT
);

-- 步骤：流程里的节点
CREATE TABLE step (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  flow_id   TEXT NOT NULL REFERENCES flow (id) ON DELETE CASCADE,
  seq       INTEGER NOT NULL,
  phase     TEXT NOT NULL CHECK (phase IN ('诊断', '分期', '分层', '决策', '治疗', '评估', '随访', '支持')),
  kind      TEXT NOT NULL CHECK (kind IN ('action', 'decision', 'checkpoint', 'note')),
  title     TEXT NOT NULL,
  detail    TEXT NOT NULL,
  branch    TEXT,                            -- 条件分支，如「Deauville 1–3 → 进入巩固」
  evidence  TEXT,                            -- 1 类 / 2A / Ⅰ级…（照抄来源，不换算）
  source_id TEXT REFERENCES source (id),
  locator   TEXT,                            -- 指南章节名；不编页码
  UNIQUE (flow_id, seq)
);

-- 可以带去问医生的问题：面向用户的唯一出口
CREATE TABLE question (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  subtype_id TEXT REFERENCES subtype (id),
  phase      TEXT,
  text       TEXT NOT NULL,
  why        TEXT,
  source_id  TEXT REFERENCES source (id)
);

-- 分期/评分口径：只解释定义，不提供打分器
CREATE TABLE metric_def (
  id          TEXT PRIMARY KEY,
  name_zh     TEXT NOT NULL,
  name_en     TEXT,
  category    TEXT NOT NULL CHECK (category IN ('分期', '疗效', '预后')),
  definition  TEXT NOT NULL,
  usable_as   TEXT NOT NULL,                 -- 工作台里可以怎么用
  must_not    TEXT NOT NULL,                 -- 明确不许怎么用
  source_id   TEXT REFERENCES source (id)
);

-- 方便查询
CREATE INDEX idx_step_flow ON step (flow_id, seq);
CREATE INDEX idx_flow_subtype ON flow (subtype_id);
CREATE INDEX idx_question_subtype ON question (subtype_id);
CREATE INDEX idx_source_tier ON source (tier);

-- 出处视图：一行看清某一步来自哪
CREATE VIEW v_step_source AS
SELECT
  f.id          AS flow_id,
  f.title       AS flow_title,
  s.id          AS subtype_id,
  s.name_zh     AS subtype_zh,
  st.seq,
  st.phase,
  st.kind,
  st.title      AS step_title,
  st.detail,
  st.branch,
  st.evidence,
  st.locator,
  src.org,
  src.title     AS source_title,
  src.version   AS source_version,
  src.tier,
  src.url
FROM step st
JOIN flow f     ON f.id = st.flow_id
LEFT JOIN subtype s ON s.id = f.subtype_id
LEFT JOIN source src ON src.id = COALESCE(st.source_id, f.source_id)
ORDER BY f.id, st.seq;

-- ============================================================
-- 临床试验登记（2026 年）
-- 与上面的指南条文分表：指南回答「流程是什么」，试验回答「有什么在招」。
-- 两者都能指回来源，但试验不写推荐、不写结论，只做登记信息的本地索引。
-- ============================================================

CREATE TABLE trial_source (
  id      TEXT PRIMARY KEY,              -- ctgov / veeva / cde / chictr / ictrp
  org     TEXT NOT NULL,
  label   TEXT NOT NULL,
  url     TEXT,
  access  TEXT,                          -- 接入方式（API / 本地库 / MCP / sidecar）
  note    TEXT
);

-- 每次采集的终态：拿不到就说拿不到，不把「没查」写成「没有」
CREATE TABLE trial_run (
  source_id   TEXT PRIMARY KEY REFERENCES trial_source (id),
  fetched_at  TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('ok', 'partial', 'unavailable', 'failed')),
  window_basis TEXT,
  api_total   INTEGER,
  fetched     INTEGER NOT NULL,
  note        TEXT,
  snapshot    TEXT                       -- knowledge/data/trials/<id>.json
);

CREATE TABLE trial (
  id                      TEXT PRIMARY KEY,          -- <source>:<记录号>
  source_id               TEXT NOT NULL REFERENCES trial_source (id),
  source_record_id        TEXT NOT NULL,
  primary_registry        TEXT,                      -- NCT / CTR / ChiCTR
  registry_no             TEXT,
  title                   TEXT NOT NULL,
  brief_title             TEXT,
  conditions              TEXT NOT NULL,             -- JSON 数组
  interventions           TEXT,                      -- JSON 数组
  phase                   TEXT,
  status                  TEXT,
  status_cn               TEXT,
  enrollment              INTEGER,
  start_date              TEXT,
  primary_completion_date TEXT,
  last_update             TEXT,
  sponsor                 TEXT,
  study_type              TEXT,
  is_china                INTEGER NOT NULL DEFAULT 0 CHECK (is_china IN (0, 1)),
  site_count              INTEGER,
  china_sites             TEXT,                      -- JSON 数组
  year_2026               INTEGER NOT NULL DEFAULT 1 CHECK (year_2026 IN (0, 1)),
  year_basis              TEXT,                      -- last_update / start / registration / unknown
  matched_by              TEXT,                      -- condition / keyword / title
  url                     TEXT,
  raw_json                TEXT,
  fetched_at              TEXT NOT NULL,
  UNIQUE (source_id, source_record_id)
);

CREATE INDEX idx_trial_source   ON trial (source_id);
CREATE INDEX idx_trial_registry ON trial (registry_no);
CREATE INDEX idx_trial_status   ON trial (status_cn);
CREATE INDEX idx_trial_china    ON trial (is_china);
CREATE INDEX idx_trial_phase    ON trial (phase);

-- 全文检索：trigram 对中文子串有效（unicode61 做不到）
CREATE VIRTUAL TABLE trial_fts USING fts5 (
  trial_id     UNINDEXED,
  title,
  conditions,
  interventions,
  tokenize = 'trigram'
);

CREATE VIEW v_trial AS
SELECT t.*, s.label AS source_label, s.access AS source_access
FROM trial t
JOIN trial_source s ON s.id = t.source_id;

-- 同一登记号出现在多个库（例如 NCT 同时进 CT.gov 与 Veeva）时先看见
CREATE VIEW v_trial_cross AS
SELECT
  registry_no,
  COUNT(DISTINCT source_id) AS source_count,
  GROUP_CONCAT(DISTINCT source_id) AS source_ids,
  MIN(title) AS title
FROM trial
WHERE registry_no IS NOT NULL AND registry_no <> ''
GROUP BY registry_no
HAVING source_count > 1;
