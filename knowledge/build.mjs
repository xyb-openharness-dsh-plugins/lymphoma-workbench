#!/usr/bin/env node
/**
 * 构建淋巴瘤指南知识库（SQLite）。
 *
 *   npm run kb:build
 *
 * 整库重建，不做增量更新：每次从 knowledge/data/*.json 重新生成，
 * 这样库里的每一行都能追溯到 JSON 与 source。
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, 'data');
const DB_PATH = join(HERE, 'lymphoma-kb.sqlite');
const SCHEMA = join(HERE, 'schema.sql');

const readJson = (name) => JSON.parse(readFileSync(join(DATA, name), 'utf8'));

const sources = readJson('sources.json');
const subtypes = readJson('subtypes.json');
const flows = [
  ...readJson('flows-general.json'),
  ...readJson('flows-b.json'),
  ...readJson('flows-th.json'),
];
const extras = readJson('extras.json');
const questions = extras.questions;
const metrics = extras.metric_defs;

/* ---------- 临床试验快照（可选）：有就入库，没有不报错 ---------- */

const TRIALS_DIR = join(DATA, 'trials');
const trialSnaps = existsSync(TRIALS_DIR)
  ? readdirSync(TRIALS_DIR)
      .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
      .sort()
      .map((f) => JSON.parse(readFileSync(join(TRIALS_DIR, f), 'utf8')))
  : [];

const TRIAL_STATUS = new Set(['ok', 'partial', 'unavailable', 'failed']);

/* ---------- 构建前自检：宁可构建失败，也不要写进半条数据 ---------- */

const problems = [];
const sourceIds = new Set(sources.map((s) => s.id));
const subtypeIds = new Set(subtypes.map((s) => s.id));
const flowIds = new Set();

for (const s of sources) {
  if (!['guideline', 'guideline_summary', 'consensus', 'review'].includes(s.tier)) {
    problems.push(`来源 ${s.id} 的 tier 非法：${s.tier}`);
  }
  if (!s.accessed_on) problems.push(`来源 ${s.id} 缺 accessed_on`);
}

for (const f of flows) {
  if (flowIds.has(f.id)) problems.push(`流程 id 重复：${f.id}`);
  flowIds.add(f.id);
  if (!sourceIds.has(f.source_id)) problems.push(`流程 ${f.id} 的 source 不存在：${f.source_id}`);
  if (f.subtype_id && !subtypeIds.has(f.subtype_id)) {
    problems.push(`流程 ${f.id} 的 subtype 不存在：${f.subtype_id}`);
  }
  if (!Array.isArray(f.steps) || f.steps.length === 0) problems.push(`流程 ${f.id} 没有步骤`);

  const seqs = new Set();
  for (const st of f.steps ?? []) {
    if (seqs.has(st.seq)) problems.push(`流程 ${f.id} 的 seq 重复：${st.seq}`);
    seqs.add(st.seq);
    if (st.source_id && !sourceIds.has(st.source_id)) {
      problems.push(`流程 ${f.id} 第 ${st.seq} 步的 source 不存在：${st.source_id}`);
    }
    if (!st.source_id && !f.source_id) problems.push(`流程 ${f.id} 第 ${st.seq} 步没有出处`);
    if (!st.locator) problems.push(`流程 ${f.id} 第 ${st.seq} 步缺 locator`);
    if (!['诊断', '分期', '分层', '决策', '治疗', '评估', '随访', '支持'].includes(st.phase)) {
      problems.push(`流程 ${f.id} 第 ${st.seq} 步 phase 非法：${st.phase}`);
    }
    if (!['action', 'decision', 'checkpoint', 'note'].includes(st.kind)) {
      problems.push(`流程 ${f.id} 第 ${st.seq} 步 kind 非法：${st.kind}`);
    }
  }
}

for (const q of questions) {
  if (q.subtype_id && !subtypeIds.has(q.subtype_id)) {
    problems.push(`问题指向不存在的 subtype：${q.subtype_id}`);
  }
  if (q.source_id && !sourceIds.has(q.source_id)) {
    problems.push(`问题的 source 不存在：${q.source_id}`);
  }
}

for (const m of metrics) {
  if (m.source_id && !sourceIds.has(m.source_id)) {
    problems.push(`口径 ${m.id} 的 source 不存在：${m.source_id}`);
  }
}

const trialIds = new Set();
for (const snap of trialSnaps) {
  if (!snap.source_id) problems.push('试验快照缺少 source_id');
  if (!TRIAL_STATUS.has(snap.status)) problems.push(`来源 ${snap.source_id} 的 status 非法：${snap.status}`);
  if (!Array.isArray(snap.records)) problems.push(`来源 ${snap.source_id} 的 records 不是数组`);

  for (const t of snap.records ?? []) {
    if (!t.id) problems.push(`来源 ${snap.source_id} 有记录缺 id`);
    if (trialIds.has(t.id)) problems.push(`试验 id 重复：${t.id}`);
    trialIds.add(t.id);
    if (!t.title) problems.push(`试验 ${t.id} 没有标题`);
    if (!Array.isArray(t.conditions)) problems.push(`试验 ${t.id} 的 conditions 不是数组`);
    if (t.source_id !== snap.source_id) problems.push(`试验 ${t.id} 的 source 与快照不一致`);
    if (t.year_basis == null) problems.push(`试验 ${t.id} 缺 year_basis（年份依据）`);
  }
}

if (problems.length) {
  console.error('构建前自检未通过：');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

/* ---------- 重建库 ---------- */

if (existsSync(DB_PATH)) unlinkSync(DB_PATH);
mkdirSync(HERE, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON');
db.exec(readFileSync(SCHEMA, 'utf8'));

const now = new Date().toISOString();

db.exec('BEGIN');

try {
  const metaStmt = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)');
  metaStmt.run('built_at', now);
  metaStmt.run('db_version', '1');
  metaStmt.run('subtypes', String(subtypes.length));
  metaStmt.run('flows', String(flows.length));
  metaStmt.run('steps', String(flows.reduce((n, f) => n + f.steps.length, 0)));
  metaStmt.run('questions', String(questions.length));
  metaStmt.run('sources', String(sources.length));
  metaStmt.run(
    'scope',
    '2026 年公开淋巴瘤指南的诊疗流程条文索引。NCCN B 细胞 v4.2026 / 霍奇金 v2.2026 / T 细胞 v2.2026 / CLL v2.2026；CSCO 淋巴瘤 2026；中国淋巴瘤诊疗指南 2026 版。'
  );
  metaStmt.run(
    'disclaimer',
    '本库是条文索引，不是临床决策依据。内容多经公开解读页转述，verified=0 表示未逐条核对指南原文。工作台不据此推荐方案、不判读影像、不给预后结论。'
  );

  const srcStmt = db.prepare(
    'INSERT INTO source (id, org, title, version, published_on, accessed_on, url, lang, tier, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  for (const s of sources) {
    srcStmt.run(s.id, s.org, s.title, s.version ?? null, s.published_on ?? null, s.accessed_on, s.url ?? null, s.lang, s.tier, s.note ?? null);
  }

  const subStmt = db.prepare(
    'INSERT INTO subtype (id, code, name_zh, name_en, lineage, nccn_group, ordinal, grade_text, dept_text, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  for (const s of subtypes) {
    subStmt.run(s.id, s.code, s.name_zh, s.name_en ?? null, s.lineage, s.nccn_group ?? null,
      s.ordinal ?? 0, s.grade_text ?? null, s.dept_text ?? null, s.note ?? null);
  }

  const flowStmt = db.prepare(
    'INSERT INTO flow (id, subtype_id, title, intent, scope, source_id, verified, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const stepStmt = db.prepare(
    'INSERT INTO step (flow_id, seq, phase, kind, title, detail, branch, evidence, source_id, locator) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );

  for (const f of flows) {
    flowStmt.run(f.id, f.subtype_id ?? null, f.title, f.intent, f.scope, f.source_id, f.verified ? 1 : 0, f.note ?? null);
    for (const st of f.steps) {
      stepStmt.run(
        f.id,
        st.seq,
        st.phase,
        st.kind,
        st.title,
        st.detail,
        st.branch ?? null,
        st.evidence ?? null,
        st.source_id ?? null,
        st.locator
      );
    }
  }

  const qStmt = db.prepare('INSERT INTO question (subtype_id, phase, text, why, source_id) VALUES (?, ?, ?, ?, ?)');
  for (const q of questions) {
    qStmt.run(q.subtype_id ?? null, q.phase ?? null, q.text, q.why ?? null, q.source_id ?? null);
  }

  const mStmt = db.prepare(
    'INSERT INTO metric_def (id, name_zh, name_en, category, definition, usable_as, must_not, source_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  for (const m of metrics) {
    mStmt.run(m.id, m.name_zh, m.name_en ?? null, m.category, m.definition, m.usable_as, m.must_not, m.source_id ?? null);
  }

  /* ---- 临床试验 ---- */

  const tsStmt = db.prepare(
    'INSERT INTO trial_source (id, org, label, url, access, note) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const runStmt = db.prepare(
    'INSERT INTO trial_run (source_id, fetched_at, status, window_basis, api_total, fetched, note, snapshot) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const trialStmt = db.prepare(
    `INSERT INTO trial (
      id, source_id, source_record_id, primary_registry, registry_no, title, brief_title,
      conditions, interventions, phase, status, status_cn, enrollment, start_date,
      primary_completion_date, last_update, sponsor, study_type, is_china, site_count,
      china_sites, year_2026, year_basis, matched_by, url, raw_json, fetched_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const ftsStmt = db.prepare('INSERT INTO trial_fts (trial_id, title, conditions, interventions) VALUES (?, ?, ?, ?)');

  for (const snap of trialSnaps) {
    tsStmt.run(
      snap.source_id,
      snap.org ?? '',
      snap.label ?? snap.source_id,
      snap.url ?? null,
      snap.access ?? null,
      snap.note ?? null
    );
    runStmt.run(
      snap.source_id,
      snap.fetched_at ?? now,
      snap.status,
      snap.window?.basis ?? null,
      snap.counts?.api_total ?? null,
      snap.records?.length ?? 0,
      snap.note ?? null,
      `data/trials/${snap.source_id}.json`
    );

    for (const t of snap.records ?? []) {
      trialStmt.run(
        t.id,
        t.source_id,
        t.source_record_id,
        t.primary_registry ?? null,
        t.registry_no ?? null,
        t.title,
        t.brief_title ?? null,
        JSON.stringify(t.conditions ?? []),
        JSON.stringify(t.interventions ?? []),
        t.phase ?? null,
        t.status ?? null,
        t.status_cn ?? null,
        Number.isInteger(t.enrollment) ? t.enrollment : null,
        t.start_date ?? null,
        t.primary_completion_date ?? null,
        t.last_update ?? null,
        t.sponsor ?? null,
        t.study_type ?? null,
        t.is_china ? 1 : 0,
        Number.isInteger(t.site_count) ? t.site_count : null,
        JSON.stringify(t.china_sites ?? []),
        t.year_2026 === 0 ? 0 : 1,
        t.year_basis ?? 'unknown',
        t.matched_by ?? null,
        t.url ?? null,
        t.raw_json ? JSON.stringify(t.raw_json) : t.raw ? JSON.stringify(t.raw) : null,
        snap.fetched_at ?? now
      );
      ftsStmt.run(
        t.id,
        t.title ?? '',
        (t.conditions ?? []).join(' '),
        (t.interventions ?? []).join(' ')
      );
    }
  }

  metaStmt.run('trials', String(trialIds.size));
  metaStmt.run('trial_sources', String(trialSnaps.length));
  metaStmt.run(
    'trial_scope',
    '2026 年登记的淋巴瘤相关临床试验索引：ClinicalTrials.gov（2026 年有更新）、Veeva CTV 本地底册、CDE（CTR2026 前缀）、ChiCTR（2026 注册）。'
  );
  metaStmt.run(
    'trial_disclaimer',
    '试验表只是登记信息的本地索引：不排序、不评分、不推荐。状态与入排以来源原文为准；某条不在库里不等于不存在，来源终态为 unavailable 的渠道没有查到。'
  );

  db.exec('COMMIT');
} catch (err) {
  db.exec('ROLLBACK');
  console.error('写入失败，已回滚：', err.message);
  process.exit(1);
}

/* ---------- 构建后校验 ---------- */

const one = (sql) => db.prepare(sql).get();
const counts = {
  sources: one('SELECT COUNT(*) AS n FROM source').n,
  subtypes: one('SELECT COUNT(*) AS n FROM subtype').n,
  flows: one('SELECT COUNT(*) AS n FROM flow').n,
  steps: one('SELECT COUNT(*) AS n FROM step').n,
  questions: one('SELECT COUNT(*) AS n FROM question').n,
  metric_defs: one('SELECT COUNT(*) AS n FROM metric_def').n,
  trials: one('SELECT COUNT(*) AS n FROM trial').n,
  trial_sources: one('SELECT COUNT(*) AS n FROM trial_source').n,
};

const orphanSteps = one(
  'SELECT COUNT(*) AS n FROM step st LEFT JOIN flow f ON f.id = st.flow_id WHERE f.id IS NULL'
).n;
const noLocator = one("SELECT COUNT(*) AS n FROM step WHERE locator IS NULL OR locator = ''").n;
const uncovered = db
  .prepare(
    'SELECT s.code FROM subtype s LEFT JOIN flow f ON f.subtype_id = s.id WHERE f.id IS NULL ORDER BY s.lineage, s.code'
  )
  .all();

if (orphanSteps || noLocator) {
  console.error(`校验失败：孤儿步骤 ${orphanSteps} 条，缺 locator ${noLocator} 条`);
  process.exit(1);
}

db.exec('PRAGMA optimize');

const kb = counts.metric_defs;
console.log('知识库构建完成');
console.log(`  文件      ${DB_PATH}`);
console.log(`  来源      ${counts.sources}`);
console.log(`  亚型      ${counts.subtypes}`);
console.log(`  流程      ${counts.flows}`);
console.log(`  步骤      ${counts.steps}`);
console.log(`  问题      ${counts.questions}`);
console.log(`  口径      ${kb}`);
console.log(`  临床试验  ${counts.trials} 条 · ${counts.trial_sources} 个来源`);
console.log(`  孤儿步骤  ${orphanSteps}`);
console.log(`  缺出处    ${noLocator}`);
if (uncovered.length) {
  console.log(`  尚无专属流程的亚型（${uncovered.length}）：${uncovered.map((r) => r.code).join(' / ')}`);
}
console.log(`  构建时间  ${now}`);
