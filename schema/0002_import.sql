-- 小铃铛 LymBell · 报告导入与草稿核对（M2 第二段）
-- 约定（沿 A2 与乳腺侧已验证的写入语义）：
--   1. 原件去重按 (profile_id, sha256)；重复导入**不重置**解析状态，只在缺日期时补一次报告日期。
--   2. 解析失败不产候选：parse_job 留在列表里带原因，原件留着可重试。
--   3. 候选是待核对项，不是事实：UNIQUE(import_id, field, value_text) 合并同值；
--      冲突 / 缺单位 / 非数字 / 低把握度在**读取时**算，不落库。
--   4. 接受只写 metric_point（source_text 记原件出处）；接受 ≠ 临床审核。
--   5. 日期均可空、不回填：取值顺序 候选自带 > 本次传入 > 材料报告日期；
--      三者都没有报 DATE_REQUIRED，imported_at 永不顶替。
--   6. 与 0001 的 document（人工归档的资料清单）分工：import_file 只管"送解析的原件"。

CREATE TABLE import_file (
  id           TEXT PRIMARY KEY,
  profile_id   TEXT NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  filename     TEXT NOT NULL,
  mime         TEXT,
  bytes        INTEGER,
  sha256       TEXT NOT NULL,                 -- 去重与"原件未变"判断
  storage_path TEXT NOT NULL,                 -- 相对资料目录/库目录，不存绝对路径
  status       TEXT NOT NULL DEFAULT 'stored'
               CHECK (status IN ('stored', 'parsed', 'parse_failed')),
  imported_at  TEXT NOT NULL,
  parsed_at    TEXT,
  report_date  TEXT,                          -- 材料报告/采样日期（可空，不回填）
  page_count   INTEGER,
  UNIQUE (profile_id, sha256)
);
CREATE INDEX idx_import_profile ON import_file(profile_id, imported_at DESC);

CREATE TABLE parse_job (
  id          TEXT PRIMARY KEY,
  import_id   TEXT NOT NULL REFERENCES import_file(id) ON DELETE CASCADE,
  status      TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  engine      TEXT,
  started_at  TEXT NOT NULL,
  finished_at TEXT,
  error_code  TEXT,                            -- 失败也必须留在列表里，可重试
  error_text  TEXT
);
CREATE INDEX idx_parse_import ON parse_job(import_id, started_at DESC);

CREATE TABLE candidate (
  id          TEXT PRIMARY KEY,
  import_id   TEXT NOT NULL REFERENCES import_file(id) ON DELETE CASCADE,
  record_id   INTEGER,                         -- 接受后回填 metric_point.rowid
  field       TEXT NOT NULL,                   -- metric:ldh / metric:anc / metric:wt …
  value_text  TEXT NOT NULL,                   -- 原文照抄（不等式、非数字保留字面值）
  value_num   REAL,                            -- 原文不是数（如 '<0.5'）时为 NULL
  unit        TEXT,
  method      TEXT,
  page_ref    TEXT,
  occurred_on TEXT,                            -- 候选自带日期（可空）
  confidence  REAL,
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'accepted', 'rejected')),
  decided_at  TEXT,
  UNIQUE (import_id, field, value_text)
);
CREATE INDEX idx_candidate_status ON candidate(status);

PRAGMA user_version = 2;
