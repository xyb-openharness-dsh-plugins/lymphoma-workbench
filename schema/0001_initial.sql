-- 小铃铛 LymBell · 业务库初始结构
-- 版本：v0.2.0（G3 于 2026-10-17 由用户以「继续下一步系统开发」放行）
-- 约定：
--   1. 本文件一旦执行即冻结，改结构只能新增 0002_*.sql。
--   2. 缺测一律 NULL，不用 0 / '' 顶替；"未检测"另立 result_state。
--   3. 分类变量（Deauville、Lugano、CTCAE）只存原值，不做数值趋势。
--   4. 分型与分期的更正只新增版本，不覆盖旧值（见两个 no_rewrite 触发器）。
--   5. 事件日期不得晚于当天；计划类日期（task.due_on、treatment_line.next_on）允许未来。

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- 工作区（单行）
-- ---------------------------------------------------------------------------
CREATE TABLE workspace (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  root_path      TEXT,                                    -- 资料目录绝对路径；未选为 NULL
  consent_mineru INTEGER NOT NULL DEFAULT 0 CHECK (consent_mineru IN (0, 1)),
  token_masked   TEXT,                                    -- 只存掩码，不存明文
  token_source   TEXT,                                    -- 'env' | 'file' | 'none'
  backup_at      TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- 档案
-- ---------------------------------------------------------------------------
CREATE TABLE profile (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  initial     TEXT NOT NULL,
  age         INTEGER CHECK (age IS NULL OR (age >= 0 AND age <= 130)),
  tag         TEXT,
  is_demo     INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0, 1)),
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
  created_at  TEXT NOT NULL
);

-- 分型断言：版本链。同一 profile 至多一条 is_current = 1。
CREATE TABLE subtype_assertion (
  id            INTEGER PRIMARY KEY,
  profile_id    TEXT NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  lineage       TEXT NOT NULL CHECK (lineage IN ('B', 'T', 'H')),
  name_zh       TEXT NOT NULL,
  name_en       TEXT,
  abbr          TEXT,
  who_class     TEXT,                                     -- 例如 WHO-HAEM5 · 成熟 B 细胞肿瘤
  diagnosed_on  TEXT,
  institution   TEXT,
  report_no     TEXT,
  note          TEXT,
  supersedes_id INTEGER REFERENCES subtype_assertion(id),
  is_current    INTEGER NOT NULL DEFAULT 1 CHECK (is_current IN (0, 1)),
  created_at    TEXT NOT NULL
);
CREATE UNIQUE INDEX ux_subtype_current ON subtype_assertion(profile_id) WHERE is_current = 1;
CREATE INDEX ix_subtype_profile ON subtype_assertion(profile_id, diagnosed_on);

CREATE TRIGGER trg_subtype_no_delete
BEFORE DELETE ON subtype_assertion
BEGIN
  SELECT RAISE(ABORT, 'subtype_assertion 只增不删：更正请新增版本');
END;

CREATE TRIGGER trg_subtype_no_rewrite
BEFORE UPDATE OF profile_id, lineage, name_zh, name_en, abbr, who_class,
                 diagnosed_on, institution, report_no, supersedes_id ON subtype_assertion
BEGIN
  SELECT RAISE(ABORT, 'subtype_assertion 内容不可改：更正请新增版本');
END;

-- 病理标记：IHC / FISH。未检测不补成阴性。
CREATE TABLE pathology_marker (
  id                 INTEGER PRIMARY KEY,
  profile_id         TEXT NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  assertion_id       INTEGER REFERENCES subtype_assertion(id),
  panel              TEXT NOT NULL CHECK (panel IN ('IHC', 'FISH')),
  marker             TEXT NOT NULL,
  result_text        TEXT,                                -- 报告原文，如「阳性（弥漫）」「未检测」
  result_state       TEXT NOT NULL DEFAULT 'reported'
                     CHECK (result_state IN ('reported', 'not_tested', 'insufficient')),
  comment            TEXT,
  ordinal            INTEGER NOT NULL DEFAULT 0,
  source_document_id TEXT REFERENCES document(id)
);

-- 分期（同样版本化）
CREATE TABLE staging (
  id              INTEGER PRIMARY KEY,
  profile_id      TEXT NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  lugano          TEXT,                                   -- 原样抄录，如 'II A'
  assessed_on     TEXT,
  bone_marrow     TEXT,                                   -- 原文，如「未受累」
  extranodal_note TEXT,
  supersedes_id   INTEGER REFERENCES staging(id),
  is_current      INTEGER NOT NULL DEFAULT 1 CHECK (is_current IN (0, 1)),
  created_at      TEXT NOT NULL
);
CREATE UNIQUE INDEX ux_staging_current ON staging(profile_id) WHERE is_current = 1;

CREATE TRIGGER trg_staging_no_delete
BEFORE DELETE ON staging
BEGIN
  SELECT RAISE(ABORT, 'staging 只增不删：更正请新增版本');
END;

CREATE TRIGGER trg_staging_no_rewrite
BEFORE UPDATE OF profile_id, lugano, assessed_on, bone_marrow, extranodal_note, supersedes_id ON staging
BEGIN
  SELECT RAISE(ABORT, 'staging 内容不可改：更正请新增版本');
END;

-- B 症状：present 为 NULL 表示「未记录」，不等同于「无」。
CREATE TABLE b_symptom (
  id         INTEGER PRIMARY KEY,
  staging_id INTEGER NOT NULL REFERENCES staging(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('fever', 'night_sweat', 'weight_loss')),
  present    INTEGER CHECK (present IS NULL OR present IN (0, 1)),
  note       TEXT,
  UNIQUE (staging_id, kind)
);

CREATE TABLE lesion (
  id                 INTEGER PRIMARY KEY,
  profile_id         TEXT NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  site               TEXT NOT NULL,
  long_axis_mm       REAL CHECK (long_axis_mm IS NULL OR long_axis_mm >= 0),
  suvmax             REAL CHECK (suvmax IS NULL OR suvmax >= 0),
  is_baseline        INTEGER NOT NULL DEFAULT 1 CHECK (is_baseline IN (0, 1)),
  measured_on        TEXT,
  source_document_id TEXT REFERENCES document(id),
  ordinal            INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE consultation (
  id                 INTEGER PRIMARY KEY,
  profile_id         TEXT NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  happened_on        TEXT,
  hospital           TEXT,
  conclusion_kind    TEXT NOT NULL CHECK (conclusion_kind IN ('consistent', 'changed', 'pending')),
  conclusion_text    TEXT,
  source_document_id TEXT REFERENCES document(id)
);

-- ---------------------------------------------------------------------------
-- 治疗：治疗线是一等公民（D24）
-- ---------------------------------------------------------------------------
CREATE TABLE treatment_line (
  id           INTEGER PRIMARY KEY,
  profile_id   TEXT NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  line_no      INTEGER NOT NULL CHECK (line_no >= 1),
  regimen_name TEXT,
  intent       TEXT,
  status       TEXT NOT NULL CHECK (status IN ('planned', 'active', 'completed', 'stopped')),
  started_on   TEXT,
  ended_on     TEXT,
  next_step    TEXT,
  next_on      TEXT,                                      -- 计划类日期，允许未来
  note         TEXT,
  UNIQUE (profile_id, line_no)
);

CREATE TABLE regimen_drug (
  id        INTEGER PRIMARY KEY,
  line_id   INTEGER NOT NULL REFERENCES treatment_line(id) ON DELETE CASCADE,
  name      TEXT NOT NULL,
  dose_text TEXT,                                         -- 原样抄录，不计算体表面积
  route     TEXT,
  note      TEXT,
  ordinal   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE cycle (
  id           INTEGER PRIMARY KEY,
  line_id      INTEGER NOT NULL REFERENCES treatment_line(id) ON DELETE CASCADE,
  n            INTEGER NOT NULL CHECK (n >= 1),
  planned_on   TEXT,
  planned_to   TEXT,                                      -- 周期条需要起止，只给单点画不出条
  actual_on    TEXT,
  actual_to    TEXT,
  delay_days   INTEGER CHECK (delay_days IS NULL OR delay_days >= 0),
  delay_reason TEXT,
  dose_adjust  TEXT,
  note         TEXT,
  UNIQUE (line_id, n),
  -- A9：有延迟就必须写原因，不许只改数字
  CHECK (delay_days IS NULL OR delay_days = 0 OR (delay_reason IS NOT NULL AND length(trim(delay_reason)) > 0))
);

CREATE TABLE response (
  id                 INTEGER PRIMARY KEY,
  line_id            INTEGER NOT NULL REFERENCES treatment_line(id) ON DELETE CASCADE,
  timepoint          TEXT,                                -- 基线 / 中期 / 结束治疗 / 随访
  assessed_on        TEXT,
  deauville          INTEGER CHECK (deauville IS NULL OR deauville BETWEEN 1 AND 5),
  lesion_mm          REAL CHECK (lesion_mm IS NULL OR lesion_mm >= 0),
  conclusion_text    TEXT,                                -- 报告原文
  clinician_label    TEXT,                                -- 医生记录的原话标签（CR/PR/SD/PD），不由工作台推断
  source_document_id TEXT REFERENCES document(id)
);

CREATE TABLE adverse_event (
  id                 INTEGER PRIMARY KEY,
  profile_id         TEXT NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  line_id            INTEGER REFERENCES treatment_line(id),
  happened_on        TEXT,
  term               TEXT NOT NULL,
  ctcaegrade         INTEGER CHECK (ctcaegrade IS NULL OR ctcaegrade BETWEEN 1 AND 5),
  note               TEXT,
  source_document_id TEXT REFERENCES document(id),
  ordinal            INTEGER NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------------
-- 指标与检验
-- ---------------------------------------------------------------------------
-- is_numeric = 0 的指标是分类变量，禁止进折线图（A11）。
CREATE TABLE metric_def (
  code       TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  unit       TEXT,
  category   TEXT NOT NULL,
  color      TEXT,
  decimals   INTEGER NOT NULL DEFAULT 1 CHECK (decimals BETWEEN 0 AND 3),
  note       TEXT,
  ordinal    INTEGER NOT NULL DEFAULT 0,                  -- 分类与指标在同一页里的排列顺序
  is_numeric INTEGER NOT NULL DEFAULT 1 CHECK (is_numeric IN (0, 1))
);

CREATE TABLE metric_point (
  id          INTEGER PRIMARY KEY,
  profile_id  TEXT NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  code        TEXT NOT NULL REFERENCES metric_def(code),
  measured_on TEXT NOT NULL,
  value_num   REAL,                                       -- 原文不是数（如 '<0.5'）时为 NULL
  value_text  TEXT,                                       -- 原文照抄
  source_text TEXT,
  method      TEXT
);
CREATE INDEX ix_metric_point ON metric_point(profile_id, code, measured_on);

CREATE TABLE lab_result (
  id          INTEGER PRIMARY KEY,
  profile_id  TEXT NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  measured_on TEXT NOT NULL,
  item        TEXT NOT NULL,
  value_text  TEXT,
  unit        TEXT,
  ref_range   TEXT,                                       -- 报告单原文，不参与着色判断
  source_text TEXT
);

CREATE TABLE infection_screen (
  id          INTEGER PRIMARY KEY,
  profile_id  TEXT NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  measured_on TEXT NOT NULL,
  item        TEXT NOT NULL,
  result_text TEXT,
  note        TEXT,
  source_text TEXT
);

CREATE TABLE fever_log (
  id          INTEGER PRIMARY KEY,
  profile_id  TEXT NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  happened_on TEXT NOT NULL,
  temp_c      REAL CHECK (temp_c IS NULL OR (temp_c >= 30 AND temp_c <= 45)),
  anc         REAL,
  note        TEXT,
  source_text TEXT
);

CREATE TABLE symptom_log (
  id          INTEGER PRIMARY KEY,
  profile_id  TEXT NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  happened_on TEXT NOT NULL,
  term        TEXT NOT NULL,
  grade       INTEGER CHECK (grade IS NULL OR grade BETWEEN 0 AND 5),
  status      TEXT,
  note        TEXT,
  source_text TEXT
);

-- 生育力保存节点（D23：并入全程病情；只记时间点与是否咨询过，不评估生育能力）
CREATE TABLE fertility_note (
  id                 INTEGER PRIMARY KEY,
  profile_id         TEXT NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  happened_on        TEXT NOT NULL,
  title              TEXT NOT NULL,
  detail             TEXT,
  status             TEXT,
  source_document_id TEXT REFERENCES document(id)
);

CREATE TABLE nutrition_log (
  id          INTEGER PRIMARY KEY,
  profile_id  TEXT NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  happened_on TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('intake', 'taste', 'oral')),
  note        TEXT,
  source_text TEXT
);

-- ---------------------------------------------------------------------------
-- 本人记录
-- ---------------------------------------------------------------------------
-- 看法不是结论（D16）：默认私密，读时 fail-closed。
CREATE TABLE viewpoint (
  id          INTEGER PRIMARY KEY,
  profile_id  TEXT NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  recorded_on TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('patient', 'caregiver')),
  text        TEXT NOT NULL,
  is_private  INTEGER NOT NULL DEFAULT 1 CHECK (is_private IN (0, 1))
);

CREATE TABLE question (
  id          INTEGER PRIMARY KEY,
  profile_id  TEXT NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  created_on  TEXT NOT NULL,
  text        TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('fact', 'view')),
  selected    INTEGER NOT NULL DEFAULT 1 CHECK (selected IN (0, 1)),
  source_text TEXT,
  ordinal     INTEGER NOT NULL DEFAULT 0
);

-- 待办：due_on 是计划，允许未来。
CREATE TABLE task (
  id         INTEGER PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  due_on     TEXT NOT NULL,
  title      TEXT NOT NULL,
  note       TEXT,
  done       INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
  done_on    TEXT
);

-- ---------------------------------------------------------------------------
-- 资料与试验线索
-- ---------------------------------------------------------------------------
CREATE TABLE document (
  id          TEXT PRIMARY KEY,
  profile_id  TEXT NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  doc_type    TEXT,
  reported_on TEXT,
  status      TEXT NOT NULL CHECK (status IN ('archived', 'reviewed')),
  local_path  TEXT,                                       -- 相对资料目录，不存绝对路径
  page_count  INTEGER,
  sha256      TEXT
);

CREATE TABLE saved_trial (
  id         INTEGER PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  trial_key  TEXT NOT NULL,                               -- 跨库引用：来源 + 登记号
  saved_on   TEXT NOT NULL,
  note       TEXT,
  UNIQUE (profile_id, trial_key)
);

-- ---------------------------------------------------------------------------
-- 读模型
-- ---------------------------------------------------------------------------
CREATE VIEW v_profile_current AS
SELECT p.id,
       p.name,
       p.initial,
       p.age,
       p.tag,
       p.is_demo,
       (SELECT name_zh    FROM subtype_assertion WHERE profile_id = p.id AND is_current = 1) AS subtype,
       (SELECT abbr       FROM subtype_assertion WHERE profile_id = p.id AND is_current = 1) AS subtype_abbr,
       (SELECT name_en    FROM subtype_assertion WHERE profile_id = p.id AND is_current = 1) AS subtype_en,
       (SELECT lineage    FROM subtype_assertion WHERE profile_id = p.id AND is_current = 1) AS lineage,
       (SELECT diagnosed_on FROM subtype_assertion WHERE profile_id = p.id AND is_current = 1) AS diagnosed_on,
       (SELECT lugano     FROM staging           WHERE profile_id = p.id AND is_current = 1) AS stage
FROM profile p
WHERE p.is_archived = 0;

PRAGMA user_version = 1;
