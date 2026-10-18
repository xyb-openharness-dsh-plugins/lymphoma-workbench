#!/usr/bin/env node
/**
 * 查询淋巴瘤指南知识库。
 *
 *   node knowledge/query.mjs                     概况
 *   node knowledge/query.mjs --list              按谱系列出亚型与流程
 *   node knowledge/query.mjs --flow dlbcl-1l     看一条流程的全部步骤
 *   node knowledge/query.mjs --subtype mcl       看一个亚型的流程与问题
 *   node knowledge/query.mjs --search 中枢       全文搜步骤
 *   node knowledge/query.mjs --questions chl     看可问的问题
 *   node knowledge/query.mjs --metrics           看分期/评分口径
 *   node knowledge/query.mjs --sources           看来源与证据层级
 *   node knowledge/query.mjs --check             一致性自检（不重建）
 *   node knowledge/query.mjs --trials [来源]     2026 临床试验概况 / 按来源列最近
 *   node knowledge/query.mjs --trial NCT05011045 单条试验详情
 *   node knowledge/query.mjs --trial-search 双抗  试验全文检索（中英文子串）
 *   node knowledge/query.mjs --trial-sources     试验来源与采集终态
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const HERE = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(HERE, 'lymphoma-kb.sqlite');

if (!existsSync(DB_PATH)) {
  console.error('找不到知识库，先运行：npm run kb:build');
  process.exit(1);
}

const db = new DatabaseSync(DB_PATH);
const all = (sql, ...p) => db.prepare(sql).all(...p);
const one = (sql, ...p) => db.prepare(sql).get(...p);

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};

const line = (n = 62) => '─'.repeat(n);

const printFlow = (flowId) => {
  const f = one('SELECT * FROM flow WHERE id = ?', flowId);
  if (!f) {
    console.error(`没有这条流程：${flowId}（用 --list 看有哪些）`);
    process.exit(1);
  }
  const src = one('SELECT * FROM source WHERE id = ?', f.source_id);
  console.log(`\n${f.title}`);
  console.log(line());
  console.log(`流程 id   ${f.id}`);
  console.log(`适用      ${f.scope}`);
  console.log(`回答      ${f.intent}`);
  console.log(`主来源    ${src.org} · ${src.title}${src.version ? ` · ${src.version}` : ''}（${src.tier}）`);
  console.log(`核对状态  ${f.verified ? '已核对原文' : '未核对原文，仅据公开解读'}`);
  if (f.note) console.log(`备注      ${f.note}`);
  console.log(line());

  const steps = all('SELECT * FROM step WHERE flow_id = ? ORDER BY seq', flowId);
  for (const s of steps) {
    const tag = { action: '→', decision: '◇', checkpoint: '◆', note: '·' }[s.kind] ?? '·';
    console.log(`${tag} ${s.seq}. [${s.phase}] ${s.title}`);
    console.log(`   ${s.detail}`);
    if (s.branch) console.log(`   分支：${s.branch}`);
    if (s.evidence) console.log(`   证据：${s.evidence}`);
    console.log(`   出处：${s.locator}`);
    if (s.source_id && s.source_id !== f.source_id) {
      const ss = one('SELECT org FROM source WHERE id = ?', s.source_id);
      console.log(`        该步另据：${ss.org}`);
    }
  }
};

const printQuestions = (subtypeId) => {
  const rows = subtypeId
    ? all(
        `SELECT q.*, s.code FROM question q LEFT JOIN subtype s ON s.id = q.subtype_id
         WHERE q.subtype_id = ? OR q.subtype_id IS NULL ORDER BY q.subtype_id IS NULL, q.id`,
        subtypeId
      )
    : all(
        `SELECT q.*, s.code FROM question q LEFT JOIN subtype s ON s.id = q.subtype_id
         ORDER BY q.subtype_id IS NULL DESC, q.id`
      );
  if (!rows.length) {
    console.log('没有匹配的问题。');
    return;
  }
  let last = null;
  for (const q of rows) {
    const group = q.code ?? '通用';
    if (group !== last) {
      console.log(`\n${group}`);
      console.log(line(40));
      last = group;
    }
    console.log(`· ${q.text}`);
    if (q.why) console.log(`  ${q.why}`);
  }
};


/* ---------------- 临床试验 ---------------- */

const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
const pad = (v, n) => String(v ?? '').padEnd(n).slice(0, n);

const printTrialSources = () => {
  const rows = all(
    `SELECT s.*, r.fetched_at, r.status, r.window_basis, r.api_total, r.fetched, r.note, r.snapshot
     FROM trial_source s LEFT JOIN trial_run r ON r.source_id = s.id ORDER BY s.id`
  );
  if (!rows.length) {
    console.log('库里还没有临床试验快照，先跑：npm run kb:trials:collect');
    return;
  }
  console.log('\n临床试验来源');
  console.log(line());
  for (const r of rows) {
    console.log(`${r.id}  ${r.label}`);
    console.log(`  机构    ${r.org}`);
    console.log(`  接入    ${r.access ?? '—'}`);
    console.log(`  口径    ${r.window_basis ?? '—'}`);
    console.log(`  终态    ${r.status} · 入库 ${r.fetched} 条${r.api_total ? ` / 站点报 ${r.api_total} 条` : ''}`);
    console.log(`  采集    ${r.fetched_at ?? '—'} · 快照 ${r.snapshot ?? '—'}`);
    if (r.note) console.log(`  说明    ${r.note}`);
    console.log('');
  }
};

const printTrialOverview = () => {
  const total = one('SELECT COUNT(*) AS n FROM trial').n;
  if (!total) {
    console.log('库里还没有临床试验，先跑：npm run kb:trials:collect && npm run kb:build');
    return;
  }
  console.log(`\n2026 年淋巴瘤临床试验 · ${total} 条`);
  console.log(line());
  const bySrc = all('SELECT source_id, COUNT(*) AS n FROM trial GROUP BY source_id ORDER BY n DESC');
  console.log('按来源');
  for (const r of bySrc) {
    const label = one('SELECT label FROM trial_source WHERE id = ?', r.source_id)?.label ?? r.source_id;
    console.log(`  ${pad(r.source_id, 8)} ${String(r.n).padStart(5)}  ${pct(r.n, total)}%  ${label}`);
  }
  const china = one('SELECT COUNT(*) AS n FROM trial WHERE is_china = 1').n;
  const recruiting = one(
    "SELECT COUNT(*) AS n FROM trial WHERE status_cn IN ('招募中', '待启动招募', '邀请入组', '进行中 招募中')"
  ).n;
  const cross = one('SELECT COUNT(*) AS n FROM v_trial_cross').n;
  const condHit = one("SELECT COUNT(*) AS n FROM trial WHERE matched_by = 'condition'").n;
  const textHit = total - condHit;
  console.log(`\n中国相关 ${china} 条 · 在招或待启动 ${recruiting} 条 · 多库同号 ${cross} 条`);
  console.log(
    `适应症字段命中 ${condHit} 条 · 仅检索词命中 ${textHit} 条（后者含白血病/实体瘤混合试验，导出前要自己筛）`
  );

  const byStatus = all(
    `SELECT COALESCE(status_cn, '未标注') AS s, COUNT(*) AS n FROM trial
     GROUP BY s ORDER BY n DESC LIMIT 8`
  );
  console.log('\n按状态');
  for (const r of byStatus) console.log(`  ${String(r.n).padStart(5)}  ${r.s}`);

  const byPhase = all(
    `SELECT COALESCE(phase, '未标注') AS p, COUNT(*) AS n FROM trial GROUP BY p ORDER BY n DESC LIMIT 6`
  );
  console.log('\n按期别');
  for (const r of byPhase) console.log(`  ${String(r.n).padStart(5)}  ${r.p}`);

  console.log(`\n常用：--trials [来源]  --trial <登记号>  --trial-search <词>  --trial-sources`);
  console.log('提醒：这是登记信息的本地索引，不是推荐名单；入组条件与是否适合，由治疗团队判断。');
};

const printTrialDetail = (key) => {
  const t =
    one('SELECT * FROM trial WHERE id = ?', key) ??
    one('SELECT * FROM trial WHERE registry_no = ? ORDER BY source_id LIMIT 1', key) ??
    one('SELECT * FROM trial WHERE registry_no = ?', key);
  if (!t) {
    console.error(`没有这条试验：${key}（用 --trial-search 找）`);
    process.exit(1);
  }
  const src = one('SELECT * FROM trial_source WHERE id = ?', t.source_id);
  const run = one('SELECT * FROM trial_run WHERE source_id = ?', t.source_id);
  const conditions = JSON.parse(t.conditions || '[]');
  const interventions = JSON.parse(t.interventions || '[]');
  const sites = JSON.parse(t.china_sites || '[]');

  console.log(`\n${t.title}`);
  console.log(line());
  console.log(`登记号    ${t.registry_no ?? '—'}（${t.primary_registry ?? '未知'}）`);
  console.log(`来源      ${src?.label ?? t.source_id} · ${src?.access ?? ''}`);
  console.log(`状态      ${t.status_cn ?? '未标注'}${t.status ? `（原文：${t.status}）` : ''}`);
  console.log(`期别      ${t.phase ?? '未标注'}`);
  console.log(`入组      ${t.enrollment ?? '未标注'}`);
  console.log(`开始      ${t.start_date ?? '未标注'} · 预计主要完成 ${t.primary_completion_date ?? '未标注'}`);
  console.log(`更新      ${t.last_update ?? '未标注'}`);
  console.log(`申办/机构 ${t.sponsor ?? '未标注'}${t.study_type ? ` · ${t.study_type}` : ''}`);
  console.log(`适应症    ${conditions.length ? conditions.join(' / ') : '未写明'}`);
  console.log(`干预      ${interventions.length ? interventions.join(' / ') : '未写明'}`);
  console.log(`中国相关  ${t.is_china ? `是${sites.length ? `（${sites.length} 个站点）` : ''}` : '未标注中国站点'}`);
  for (const s of sites.slice(0, 8)) console.log(`          · ${s.facility ?? '—'}${s.city ? ` · ${s.city}` : ''}`);
  console.log(`年份依据  ${t.year_basis ?? 'unknown'}（2026 = ${t.year_2026 ? '是' : '否'}）`);
  console.log(
    `命中方式  ${t.matched_by === 'condition' ? '适应症字段写了淋巴瘤相关词' : t.matched_by === 'title' ? '标题含检索词（ChiCTR 列表不返回适应症）' : '仅检索词命中，适应症字段未见淋巴瘤相关词'}`
  );
  console.log(`链接      ${t.url ?? '—'}`);
  console.log(line());
  console.log(`采集终态  ${run?.status ?? '未知'} · ${run?.fetched_at ?? '—'}`);
  if (run?.note) console.log(`采集说明  ${run.note}`);
  console.log('提醒：登记信息会变，去来源原文核对；工作台不判断这条试验适不适合你。');
};

const searchTrials = (kw) => {
  const term = `"${kw.replaceAll('"', '""')}"`;
  let rows = [];
  try {
    rows = all(
      `SELECT t.* FROM trial_fts f JOIN trial t ON t.id = f.trial_id
       WHERE trial_fts MATCH ? ORDER BY rank LIMIT 40`,
      term
    );
  } catch {
    rows = [];
  }
  if (!rows.length) {
    const like = `%${kw}%`;
    rows = all(
      `SELECT * FROM trial WHERE title LIKE ? OR conditions LIKE ? OR interventions LIKE ? LIMIT 40`,
      like,
      like,
      like
    );
  }
  console.log(`\n搜索「${kw}」：命中 ${rows.length + (rows.length === 40 ? '+' : '')} 条`);
  console.log(line());
  for (const t of rows) {
    const cond = JSON.parse(t.conditions || '[]').slice(0, 2).join(' / ');
    const drug = JSON.parse(t.interventions || '[]').slice(0, 2).join(' / ');
    console.log(`${t.registry_no ?? t.id}  [${t.source_id}]  ${t.status_cn ?? '状态未标注'}  ${t.phase ?? ''}`);
    console.log(`  ${t.title}`);
    if (cond) console.log(`  适应症：${cond}`);
    if (drug) console.log(`  药物：${drug}`);
  }
  console.log('\n用 --trial <登记号> 看详情。');
};

const listTrials = (sourceId, n) => {
  const rows = sourceId
    ? all(
        `SELECT * FROM trial WHERE source_id = ? ORDER BY COALESCE(last_update, start_date, '') DESC LIMIT ?`,
        sourceId,
        n
      )
    : all(
        `SELECT * FROM trial ORDER BY is_china DESC, COALESCE(last_update, start_date, '') DESC LIMIT ?`,
        n
      );
  const where = sourceId ? `来源 ${sourceId}` : '全部来源（中国相关优先）';
  console.log(`\n${where} · 最近 ${rows.length} 条`);
  console.log(line());
  for (const t of rows) {
    console.log(`${(t.registry_no ?? t.id).padEnd(18)} ${(t.status_cn ?? '—').padEnd(10)} ${(t.phase ?? '—').padEnd(8)} ${t.title.slice(0, 60)}`);
  }
  console.log(`\n共 ${one(sourceId ? 'SELECT COUNT(*) AS n FROM trial WHERE source_id = ?' : 'SELECT COUNT(*) AS n FROM trial', ...(sourceId ? [sourceId] : [])).n} 条；用 --trial <登记号> 看详情。`);
};

if (flag('--check')) {
  const checks = [];
  const meta = Object.fromEntries(all('SELECT key, value FROM meta').map((r) => [r.key, r.value]));
  checks.push(['有 meta', Object.keys(meta).length > 0]);
  checks.push(['有流程', one('SELECT COUNT(*) AS n FROM flow').n > 0]);
  checks.push([
    '无孤儿步骤',
    one(
      'SELECT COUNT(*) AS n FROM step st LEFT JOIN flow f ON f.id = st.flow_id WHERE f.id IS NULL'
    ).n === 0,
  ]);
  checks.push([
    '步骤都有出处',
    one("SELECT COUNT(*) AS n FROM step WHERE locator IS NULL OR locator = ''").n === 0,
  ]);
  checks.push([
    '每个来源都被引用',
    one(
      `SELECT COUNT(*) AS n FROM source src
       WHERE NOT EXISTS (SELECT 1 FROM flow f WHERE f.source_id = src.id)
         AND NOT EXISTS (SELECT 1 FROM step st WHERE st.source_id = src.id)`
    ).n === 0,
  ]);
  checks.push([
    '24 个亚型都有流程',
    one(
      `SELECT COUNT(*) AS n FROM subtype s
       WHERE NOT EXISTS (SELECT 1 FROM flow f WHERE f.subtype_id = s.id)`
    ).n === 0,
  ]);
  checks.push([
    '问题都指向存在的亚型',
    one(
      `SELECT COUNT(*) AS n FROM question q
       WHERE q.subtype_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM subtype s WHERE s.id = q.subtype_id)`
    ).n === 0,
  ]);

  const trialTotal = one('SELECT COUNT(*) AS n FROM trial').n;
  if (trialTotal > 0) {
    checks.push([
      '试验都有来源',
      one(
        `SELECT COUNT(*) AS n FROM trial t
         WHERE NOT EXISTS (SELECT 1 FROM trial_source s WHERE s.id = t.source_id)`
      ).n === 0,
    ]);
    checks.push([
      '试验 id 与来源记录号一致',
      one("SELECT COUNT(*) AS n FROM trial WHERE id <> source_id || ':' || source_record_id").n === 0,
    ]);
    checks.push([
      '试验都标了 2026 年依据',
      one("SELECT COUNT(*) AS n FROM trial WHERE year_2026 <> 1 OR year_basis IS NULL").n === 0,
    ]);
    checks.push([
      '全文索引与试验条数一致',
      one('SELECT COUNT(*) AS n FROM trial_fts').n === trialTotal,
    ]);
    checks.push([
      '每个来源都有采集终态',
      one(
        `SELECT COUNT(*) AS n FROM trial_source s
         WHERE NOT EXISTS (SELECT 1 FROM trial_run r WHERE r.source_id = s.id)`
      ).n === 0,
    ]);
  }

  let bad = 0;
  console.log(`知识库自检（${DB_PATH}）`);
  console.log(line());
  for (const [name, ok] of checks) {
    console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}`);
    if (!ok) bad += 1;
  }
  console.log(line());
  if (trialTotal > 0) {
    const runs = all('SELECT source_id, status, fetched FROM trial_run ORDER BY source_id');
    console.log(
      `试验      ${trialTotal} 条 · ` +
        runs.map((r) => `${r.source_id}=${r.status}(${r.fetched})`).join(' ')
    );
  }
  console.log(`构建时间 ${meta.built_at ?? '未知'}`);
  console.log(bad ? `${bad} 项未通过` : '全部通过');
  process.exit(bad ? 1 : 0);
}

if (flag('--list')) {
  const rows = all(
    `SELECT s.id, s.code, s.name_zh, s.lineage,
            (SELECT COUNT(*) FROM flow f WHERE f.subtype_id = s.id) AS flows
     FROM subtype s ORDER BY s.lineage DESC, s.code`
  );
  const groups = { B: 'B 细胞', T: 'T / NK 细胞', H: '霍奇金' };
  for (const g of ['B', 'T', 'H']) {
    console.log(`\n${groups[g]}`);
    console.log(line(40));
    for (const r of rows.filter((x) => x.lineage === g)) {
      console.log(`  ${r.code.padEnd(16)} ${r.id.padEnd(16)} ${r.flows} 条流程`);
    }
  }
  console.log(`\n共 ${one('SELECT COUNT(*) AS n FROM flow').n} 条流程，用 --flow <id> 查看。`);
  process.exit(0);
}

const flowId = value('--flow');
if (flowId) {
  printFlow(flowId);
  process.exit(0);
}

const subtypeId = value('--subtype');
if (subtypeId) {
  const sub = one('SELECT * FROM subtype WHERE id = ?', subtypeId);
  if (!sub) {
    console.error(`没有这个亚型：${subtypeId}`);
    process.exit(1);
  }
  console.log(`\n${sub.code} · ${sub.name_zh}`);
  console.log(line());
  const flows = all('SELECT id, title, verified FROM flow WHERE subtype_id = ? ORDER BY id', subtypeId);
  for (const f of flows) console.log(`  流程 ${f.id.padEnd(16)} ${f.title}${f.verified ? '' : '（未核对原文）'}`);
  printQuestions(subtypeId);
  process.exit(0);
}

const kw = value('--search');
if (kw) {
  const like = `%${kw}%`;
  const rows = all(
    `SELECT st.flow_id, st.seq, st.phase, st.title, st.detail, f.title AS flow_title, s.code
     FROM step st JOIN flow f ON f.id = st.flow_id LEFT JOIN subtype s ON s.id = f.subtype_id
     WHERE st.title LIKE ? OR st.detail LIKE ? OR st.branch LIKE ?
     ORDER BY f.id, st.seq`,
    like,
    like,
    like
  );
  console.log(`\n搜索「${kw}」：命中 ${rows.length} 步`);
  console.log(line());
  for (const r of rows) {
    console.log(`${r.code ?? '通用'} · ${r.flow_id} #${r.seq} [${r.phase}] ${r.title}`);
    console.log(`  ${r.detail.slice(0, 90)}${r.detail.length > 90 ? '…' : ''}`);
  }
  process.exit(0);
}

if (flag('--questions')) {
  const v = value('--questions');
  printQuestions(v && !v.startsWith('--') ? v : null);
  process.exit(0);
}

if (flag('--metrics')) {
  for (const m of all('SELECT * FROM metric_def ORDER BY category, id')) {
    console.log(`\n${m.name_zh}（${m.id}）· ${m.category}`);
    console.log(line(40));
    console.log(m.definition);
    console.log(`可以：${m.usable_as}`);
    console.log(`不许：${m.must_not}`);
  }
  process.exit(0);
}

if (flag('--sources')) {
  for (const s of all('SELECT * FROM source ORDER BY tier, id')) {
    console.log(`\n${s.id}  [${s.tier}]`);
    console.log(`  ${s.org} · ${s.title}${s.version ? ` · ${s.version}` : ''}`);
    console.log(`  发布 ${s.published_on ?? '未标注'} · 取用 ${s.accessed_on} · ${s.lang}`);
    if (s.url) console.log(`  ${s.url}`);
    if (s.note) console.log(`  注：${s.note}`);
  }
  process.exit(0);
}

/* ---------------- 临床试验分派 ---------------- */

if (flag('--trial-sources')) {
  printTrialSources();
  process.exit(0);
}

const trialKey = value('--trial');
if (trialKey && !trialKey.startsWith('--')) {
  printTrialDetail(trialKey);
  process.exit(0);
}

const trialKw = value('--trial-search');
if (trialKw && !trialKw.startsWith('--')) {
  searchTrials(trialKw);
  process.exit(0);
}

if (flag('--trials')) {
  const v = value('--trials');
  if (v && !v.startsWith('--')) listTrials(v, 20);
  else printTrialOverview();
  process.exit(0);
}

// 默认：概况
const meta = Object.fromEntries(all('SELECT key, value FROM meta').map((r) => [r.key, r.value]));
console.log('\n小铃铛 · 淋巴瘤指南知识库');
console.log(line());
for (const key of ['built_at', 'subtypes', 'flows', 'steps', 'questions', 'sources']) {
  console.log(`  ${key.padEnd(10)} ${meta[key] ?? '-'}`);
}
console.log(line());
console.log(meta.scope ?? '');
console.log('');
console.log(meta.disclaimer ?? '');
console.log(line());
const byTier = all('SELECT tier, COUNT(*) AS n FROM source GROUP BY tier ORDER BY n DESC');
console.log(`来源分层：${byTier.map((r) => `${r.tier} ${r.n}`).join(' · ')}`);
const unverified = one('SELECT COUNT(*) AS n FROM flow WHERE verified = 0').n;
const totalFlows = one('SELECT COUNT(*) AS n FROM flow').n;
console.log(`核对状态：${totalFlows - unverified} 条已核对原文 / ${unverified} 条仅据公开解读`);
console.log('');
console.log('指南：--list  --flow <id>  --subtype <id>  --search <词>  --check');
const trialTotal = one('SELECT COUNT(*) AS n FROM trial')?.n ?? 0;
if (trialTotal) {
  console.log(`试验：--trials  --trial <登记号>  --trial-search <词>  --trial-sources（库内 ${trialTotal} 条）`);
}
