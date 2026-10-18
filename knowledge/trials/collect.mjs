#!/usr/bin/env node
/**
 * 淋巴瘤临床试验采集（2026 年）。
 *
 *   node knowledge/trials/collect.mjs --source all
 *   node knowledge/trials/collect.mjs --source ctgov --limit 50
 *
 * 五个来源，四条不同的接入路径（都是本机已有技能/服务，不新装依赖）：
 *
 *   1. ctgov   ClinicalTrials.gov 官方 API v2（直连）
 *   2. veeva   Veeva CTV 本地底册 ~/.ctv-mcp/ctv.db（ctv-clinical-intel 技能维护）
 *   3. cde     中国药物临床试验登记平台，经 unified_search_trials 的 MCP 工具 search_trials
 *   4. chictr  ChiCTR，经 ~/Downloads/chictr_trials 的 sidecar（:8848）
 *   5. ictrp   WHO ICTRP，同样走 unified 的 search_trials（默认不跑，--with-ictrp 打开）
 *
 * 产物：knowledge/data/trials/<source>.json —— 一份可追溯的原始快照。
 * 重建：npm run kb:trials:build 依次读快照写进 lymphoma-kb.sqlite。
 *
 * 口径（写进每个快照的 window 字段，不藏在代码里）：
 *   - ctgov  最后更新日 ≥ 2026-01-01（含 2026 新登记与 2026 有更新）
 *   - veeva  同上；用本地 last_update_post_date
 *   - cde    按 CTR 号降序取 2026 年登记（CTR2026xxxx）；站点不提供日期区间检索，
 *            登记号前缀是这里唯一可靠的年份依据，所以只取前缀命中的记录
 *   - chictr 注册年份 = 2026（sidecar 的 createyear 参数）
 *
 * 不做的事：不抓入排全文（除 veeva 本地已有）、不判断试验好坏、不排序推荐。
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const OUT_DIR = join(ROOT, 'knowledge', 'data', 'trials');

const HOME = homedir();
const CTV_DB = process.env.CTV_DB || join(HOME, '.ctv-mcp', 'ctv.db');
const CHICTR = process.env.CHICTR_SIDECAR_URL || 'http://127.0.0.1:8848';
const UNIFIED_DIR = process.env.UNIFIED_TRIAL_DIR || join(HOME, 'Downloads', 'unified_search_trials');
const COOKIE_ENV = process.env.UNIFIED_COOKIE_ENV || join(HOME, '.unified-trial-mcp', 'cookie.env');

const WINDOW_FROM = '2026-01-01';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const value = (n) => (args.indexOf(n) >= 0 ? args[i(n) + 1] : null);
const i = (n) => args.indexOf(n);
const limit = value('--limit') ? Number(value('--limit')) : Infinity;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- 通用小工具 ---------------- */

const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const arr = (v) => (Array.isArray(v) ? v.filter(Boolean) : v ? [v] : []);
const uniq = (xs) => [...new Set(xs.filter(Boolean))];

function parseMaybeJson(v) {
  if (Array.isArray(v)) return v;
  if (typeof v !== 'string') return [];
  const s = v.trim();
  if (!s) return [];
  if (s.startsWith('[') || s.startsWith('{')) {
    try {
      return JSON.parse(s);
    } catch {
      return [s];
    }
  }
  return [s];
}

const STATUS_CN = {
  RECRUITING: '招募中',
  NOT_YET_RECRUITING: '待启动招募',
  ENROLLING_BY_INVITATION: '邀请入组',
  ACTIVE_NOT_RECRUITING: '进行中·停招',
  COMPLETED: '已完成',
  TERMINATED: '已终止',
  WITHDRAWN: '已撤回',
  SUSPENDED: '暂停',
  UNKNOWN: '状态不明',
  'Not yet recruiting': '待启动招募',
  Recruiting: '招募中',
  'Active, not recruiting': '进行中·停招',
  Completed: '已完成',
  Terminated: '已终止',
  'Enrolling by invitation': '邀请入组',
  Suspended: '暂停',
};

const PHASE_CN = {
  EARLY_PHASE1: '早期 I 期',
  PHASE1: 'I 期',
  PHASE2: 'II 期',
  PHASE3: 'III 期',
  PHASE4: 'IV 期',
  PHASE1_PHASE2: 'I/II 期',
  PHASE2_PHASE3: 'II/III 期',
  NA: '不适用',
};

const is2026 = (d) => typeof d === 'string' && d.slice(0, 4) === '2026';

// 适应症里是否真的写了淋巴瘤相关词：用于区分「条件字段命中」与「只在全文命中」
const LYM_COND = /lymphoma|hodgkin|lymphocytic|lymphoblastic|DLBCL|\bCLL\b|\bSLL\b|mycosis|sezary|sézary|waldenstr|macroglobulin|burkitt|MALT|mantle cell|plasmacytoma|lymphoproliferative|\bALCL\b|\bPTCL\b|\bCTCL\b|\bAITL\b|NK\/T|hairy cell|richter|\bNHL\b/i;

// Veeva 的 phase 是英文数组，转成与 CT.gov 一致的中文写法
const VEEVA_PHASE = {
  'Early Phase 1': '早期 I 期',
  'Phase 1': 'I 期',
  'Phase 2': 'II 期',
  'Phase 3': 'III 期',
  'Phase 4': 'IV 期',
  'Not Applicable': '不适用',
};

/* ---------------- 1. ClinicalTrials.gov ---------------- */

const CTG_FIELDS = [
  'NCTId',
  'BriefTitle',
  'OfficialTitle',
  'OverallStatus',
  'Phase',
  'Condition',
  'InterventionName',
  'LeadSponsorName',
  'EnrollmentCount',
  'StartDate',
  'PrimaryCompletionDate',
  'LastUpdatePostDate',
  'StudyFirstPostDate',
  'StudyType',
  'LocationFacility',
  'LocationCity',
  'LocationCountry',
].join(',');

async function collectCtgov() {
  const records = [];
  let pageToken = null;
  let apiTotal = null;
  let pages = 0;

  do {
    const url = new URL('https://clinicaltrials.gov/api/v2/studies');
    url.searchParams.set('query.cond', 'lymphoma');
    url.searchParams.set(
      'filter.advanced',
      `AREA[LastUpdatePostDate]RANGE[${WINDOW_FROM},MAX]`
    );
    url.searchParams.set('fields', CTG_FIELDS);
    url.searchParams.set('pageSize', '1000');
    url.searchParams.set('countTotal', 'true');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (!res.ok) throw new Error(`CTG ${res.status} ${res.statusText}`);
    const json = await res.json();
    if (apiTotal === null) apiTotal = json.totalCount ?? null;

    for (const st of json.studies ?? []) {
      const p = st.protocolSection ?? {};
      const id = p.identificationModule ?? {};
      const status = p.statusModule ?? {};
      const design = p.designModule ?? {};
      const cond = p.conditionsModule ?? {};
      const arms = p.armsInterventionsModule ?? {};
      const sponsor = p.sponsorCollaboratorsModule ?? {};
      const contacts = p.contactsLocationsModule ?? {};
      const locs = contacts.locations ?? [];

      const nct = str(id.nctId);
      if (!nct) continue;

      const china = locs.filter((l) => /china/i.test(l.country ?? ''));
      const lastUpdate = str(status.lastUpdatePostDateStruct?.date);
      const startDate = str(status.startDateStruct?.date);

      records.push({
        id: `ctgov:${nct}`,
        source_id: 'ctgov',
        source_record_id: nct,
        primary_registry: 'NCT',
        registry_no: nct,
        title: str(id.briefTitle) ?? str(id.officialTitle) ?? '(无标题)',
        brief_title: str(id.briefTitle),
        conditions: arr(cond.conditions),
        interventions: arr(arms.interventions?.map((x) => str(x.name))),
        phase: PHASE_CN[design.phases?.[0]] ?? str(design.phases?.[0]),
        status: str(status.overallStatus),
        status_cn: STATUS_CN[status.overallStatus] ?? str(status.overallStatus),
        enrollment: typeof design.enrollmentInfo?.count === 'number' ? design.enrollmentInfo.count : null,
        start_date: startDate,
        primary_completion_date: str(status.primaryCompletionDateStruct?.date),
        last_update: lastUpdate,
        sponsor: str(sponsor.leadSponsor?.name),
        study_type: str(design.studyType),
        is_china: china.length ? 1 : 0,
        site_count: locs.length,
        china_sites: china.slice(0, 30).map((l) => ({
          facility: str(l.facility),
          city: str(l.city),
        })),
        year_basis: is2026(lastUpdate) ? 'last_update' : is2026(startDate) ? 'start' : 'other',
        matched_by: (cond.conditions ?? []).some((c) => LYM_COND.test(c)) ? 'condition' : 'text',
        url: `https://clinicaltrials.gov/study/${nct}`,
        raw: {
          phases: design.phases ?? [],
          enrollmentType: str(design.enrollmentInfo?.type),
          firstPost: str(status.studyFirstPostDateStruct?.date),
        },
      });
      if (records.length >= limit) break;
    }

    pageToken = json.nextPageToken ?? null;
    pages += 1;
    if (records.length >= limit) break;
    await sleep(300);
  } while (pageToken && pages < 20);

  return {
    source_id: 'ctgov',
    label: 'ClinicalTrials.gov',
    org: 'U.S. National Library of Medicine',
    url: 'https://clinicaltrials.gov',
    access: 'API v2 直连',
    window: {
      disease: 'lymphoma（query.cond）',
      from: WINDOW_FROM,
      basis: 'LastUpdatePostDate ≥ 2026-01-01',
    },
    status: 'ok',
    note: `API 报告 ${apiTotal ?? '未知'} 条命中；本快照按分页取回 ${records.length} 条。入排标准未取（列表 API 不含）。`,
    counts: { api_total: apiTotal, fetched: records.length, pages },
    records,
  };
}

/* ---------------- 2. Veeva CTV 本地底册 ---------------- */

function collectVeeva() {
  if (!existsSync(CTV_DB)) {
    return {
      source_id: 'veeva',
      label: 'Veeva CTV（本地底册）',
      org: 'Veeva Clinical Trial Vault',
      url: 'https://ctv.veeva.com',
      access: `本地 SQLite ${CTV_DB}`,
      window: { disease: 'conditions 含 lymphoma / 淋巴瘤', from: WINDOW_FROM, basis: 'last_update_post_date ≥ 2026-01-01' },
      status: 'unavailable',
      note: '本地底册不存在；按 ctv-clinical-intel 技能的 sync 流程建库后重跑。',
      counts: { fetched: 0 },
      records: [],
    };
  }

  const sql = `
    SELECT utn, nct, brief_title, official_title, overall_status, type, phases,
           conditions, treatments, lead_sponsor, start_date, primary_completion_date,
           last_update_post_date, enrollment_count, countries, is_china,
           locations_json, eligibility_criteria
    FROM studies
    WHERE lower(conditions) LIKE '%lymphoma%'
       OR lower(conditions) LIKE '%hodgkin%'
       OR conditions LIKE '%淋巴%'
    ORDER BY last_update_post_date DESC`;
  const raw = execFileSync('sqlite3', ['-json', CTV_DB, sql], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const rows = raw.trim() ? JSON.parse(raw) : [];

  const records = [];
  for (const r of rows) {
    const lastUpdate = str(r.last_update_post_date);
    const startDate = str(r.start_date);
    if (!(is2026(lastUpdate) || is2026(startDate))) continue;

    const locs = parseMaybeJson(r.locations_json);
    const china = locs.filter((l) => /china|中国/i.test(str(l.country) ?? ''));

    records.push({
      id: `veeva:${str(r.nct) ?? r.utn}`,
      source_id: 'veeva',
      source_record_id: str(r.nct) ?? r.utn,
      primary_registry: str(r.nct) ? 'NCT' : 'UTN',
      registry_no: str(r.nct) ?? r.utn,
      title: str(r.brief_title) ?? str(r.official_title) ?? '(无标题)',
      brief_title: str(r.brief_title),
      conditions: parseMaybeJson(r.conditions).filter((x) => typeof x === 'string'),
      interventions: parseMaybeJson(r.treatments).filter((x) => typeof x === 'string'),
      phase: parseMaybeJson(r.phases).map((x) => VEEVA_PHASE[x] ?? x).join('、') || null,
      status: str(r.overall_status),
      status_cn: STATUS_CN[r.overall_status] ?? str(r.overall_status),
      enrollment: r.enrollment_count ?? null,
      start_date: startDate,
      primary_completion_date: str(r.primary_completion_date),
      last_update: lastUpdate,
      sponsor: str(r.lead_sponsor),
      study_type: str(r.type),
      is_china: r.is_china ? 1 : china.length ? 1 : 0,
      site_count: locs.length,
      china_sites: china.slice(0, 30).map((l) => ({ facility: str(l.facility), city: str(l.city) })),
      year_basis: is2026(lastUpdate) ? 'last_update' : 'start',
      matched_by: (parseMaybeJson(r.conditions) ?? []).some((c) => LYM_COND.test(c)) ? 'condition' : 'text',
      url: str(r.nct) ? `https://clinicaltrials.gov/study/${r.nct}` : 'https://ctv.veeva.com',
      raw: {
        utn: r.utn,
        countries: str(r.countries),
        hasEligibility: Boolean(str(r.eligibility_criteria)),
      },
    });
  }

  return {
    source_id: 'veeva',
    label: 'Veeva CTV（本地底册）',
    org: 'Veeva Clinical Trial Vault',
    url: 'https://ctv.veeva.com',
    access: `本地 SQLite ${CTV_DB}`,
    window: { disease: 'conditions 含 lymphoma / hodgkin / 淋巴', from: WINDOW_FROM, basis: 'last_update_post_date 或 start_date ≥ 2026-01-01' },
    status: 'ok',
    note: `底册共 ${rows.length} 条淋巴瘤相关，其中 2026 年有更新或启动 ${records.length} 条。CTV 底册是本地缓存副本，零命中只代表本地索引未命中。`,
    counts: { db_matched: rows.length, fetched: records.length },
    records,
  };
}

/* ---------------- 3/5. unified MCP（CDE、ICTRP） ---------------- */

async function withUnified(fn) {
  const { Client } = await import(
    join(UNIFIED_DIR, 'node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js')
  );
  const { StdioClientTransport } = await import(
    join(UNIFIED_DIR, 'node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js')
  );

  const env = { ...process.env };
  if (existsSync(COOKIE_ENV)) {
    for (const line of readFileSync(COOKIE_ENV, 'utf8').split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(UNIFIED_DIR, 'dist/src/cli/main.js'), 'serve'],
    env,
    stderr: 'ignore',
  });
  const client = new Client({ name: 'lymbell-kb', version: '0.1.0' }, { capabilities: {} });
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

async function unifiedSearch(client, payload) {
  const res = await client.callTool({ name: 'search_trials', arguments: payload });
  const text = res.content?.find((c) => c.type === 'text')?.text;
  if (!text) throw new Error('search_trials 无文本返回');
  return JSON.parse(text);
}

/** CDE：按 CTR 号降序翻页，只留 CTR2026xxxx（站点无日期区间检索）。 */
async function collectCde() {
  const PAGE = 200;
  const collected = [];
  let offset = 0;
  let apiTotal = null;
  let pages = 0;
  let stopReason = '';

  for (; pages < 15; ) {
    const json = await withUnified((client) =>
      unifiedSearch(client, {
        condition: '淋巴瘤',
        keyword: '淋巴瘤',
        sourceIds: ['chinadrugtrials'],
        limit: PAGE,
        offset,
      })
    );
    const status = (json.statuses ?? []).find((s) => s.sourceId === 'chinadrugtrials');
    if (apiTotal === null) {
      apiTotal = status?.completeness?.upstreamReportedTotal ?? status?.resultCount ?? null;
    }
    if (status && !['SUCCESS', 'NO_RESULTS'].includes(status.state)) {
      stopReason = `上游终态 ${status.state}：${status.explanation ?? ''}`;
      break;
    }

    const batch = json.records ?? [];
    if (!batch.length) {
      stopReason = stopReason || '上游返回空页';
      break;
    }

    const in2026 = batch.filter((r) => /^CTR2026/.test(r.source?.sourceRecordId ?? ''));
    collected.push(...in2026);
    pages += 1;
    offset += PAGE;

    // 已越过 2026 段：本页一条 2026 都没有，说明后面更老
    if (in2026.length === 0) {
      stopReason = 'CTR 号已降序越过 2026 段';
      break;
    }
    if (batch.length < PAGE) {
      stopReason = '已到最后一页';
      break;
    }
    await sleep(600);
  }

  const records = collected.map((r) => {
    const reg = r.source?.sourceRecordId ?? '';
    return {
      id: `cde:${reg}`,
      source_id: 'cde',
      source_record_id: reg,
      primary_registry: 'CTR',
      registry_no: reg,
      title: str(r.title) ?? '(无标题)',
      brief_title: str(r.title),
      conditions: arr(r.conditionOrDisease),
      interventions: arr(r.interventions),
      phase: null,
      status: str(r.recruitmentStatus),
      status_cn: str(r.recruitmentStatus),
      enrollment: null,
      start_date: null,
      primary_completion_date: null,
      last_update: null,
      sponsor: null,
      study_type: null,
      is_china: 1,
      site_count: null,
      china_sites: [],
      year_basis: 'registration',
      matched_by: arr(r.conditionOrDisease).some((c) => /淋巴瘤|霍奇金|淋巴/i.test(c)) ? 'condition' : 'text',
      url: 'https://www.chinadrugtrials.org.cn/clinicaltrials.searchlist.dhtml',
      raw: { registryNumbers: r.registryNumbers ?? [] },
    };
  });

  return {
    source_id: 'cde',
    label: '中国药物临床试验登记与信息公示平台（CDE）',
    org: 'NMPA 药品审评中心',
    url: 'https://www.chinadrugtrials.org.cn',
    access: 'unified_search_trials MCP · search_trials（受控访问，站点 Cookie 由 configure 取得）',
    window: { disease: '关键词「淋巴瘤」', basis: 'CTR 号前缀 CTR2026（登记年份）' },
    status: stopReason.startsWith('上游终态') ? 'partial' : 'ok',
    note: `站点报告 ${apiTotal ?? '未知'} 条命中；按 CTR 降序翻 ${pages} 页，取回 2026 年登记 ${records.length} 条。${stopReason}。列表页不含日期与入排全文，故 start_date/enrollment 留空。`,
    counts: { api_total: apiTotal, fetched: records.length, pages },
    records,
  };
}

/** ICTRP：多注册库聚合层，已知导出有静默缺口，只作交叉印证。 */
async function collectIctrp() {
  const json = await withUnified((client) =>
    unifiedSearch(client, { keyword: 'lymphoma', sourceIds: ['ictrp'], limit: 200 })
  );
  const status = (json.statuses ?? []).find((s) => s.sourceId === 'ictrp');
  const ok = ['SUCCESS', 'NO_RESULTS'].includes(status?.state);

  const records = (json.records ?? []).map((r) => {
    const reg = r.source?.sourceRecordId ?? '';
    return {
      id: `ictrp:${reg}`,
      source_id: 'ictrp',
      source_record_id: reg,
      primary_registry: (r.registryNumbers ?? [])[0]?.registry ?? 'ICTRP',
      registry_no: (r.registryNumbers ?? [])[0]?.value ?? reg,
      title: str(r.title) ?? '(无标题)',
      brief_title: str(r.title),
      conditions: arr(r.conditionOrDisease),
      interventions: arr(r.interventions),
      phase: null,
      status: str(r.recruitmentStatus),
      status_cn: STATUS_CN[r.recruitmentStatus] ?? str(r.recruitmentStatus),
      enrollment: null,
      start_date: null,
      primary_completion_date: null,
      last_update: null,
      sponsor: null,
      study_type: null,
      is_china: 0,
      site_count: null,
      china_sites: [],
      year_basis: 'unknown',
      matched_by: 'keyword',
      url: 'https://trialsearch.who.int',
      raw: { registryNumbers: r.registryNumbers ?? [] },
    };
  });

  return {
    source_id: 'ictrp',
    label: 'WHO ICTRP',
    org: 'World Health Organization',
    url: 'https://trialsearch.who.int',
    access: 'unified_search_trials MCP · search_trials',
    window: { disease: 'keyword lymphoma', basis: '无年份过滤（聚合层不提供）' },
    status: ok ? 'ok' : 'unavailable',
    note: ok
      ? `返回 ${records.length} 条（上限 200）。ICTRP 导出存在已知静默缺口（实测 0.4%–29%），不在结果里不等于不存在。`
      : `未查询成功：${status?.state ?? '未知'} ${status?.explanation ?? ''}`,
    counts: { fetched: records.length },
    records,
  };
}

/* ---------------- 4. ChiCTR sidecar ---------------- */

async function collectChictr() {
  const url = new URL('/search', CHICTR);
  url.searchParams.set('title', '淋巴瘤');
  url.searchParams.set('createyear', '2026');
  url.searchParams.set('page', '1');
  url.searchParams.set('pages', '5');

  let json;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(180000) });
    json = await res.json();
  } catch (err) {
    return {
      source_id: 'chictr',
      label: 'ChiCTR 中国临床试验注册中心',
      org: 'WHO 一级注册机构（中国）',
      url: 'https://www.chictr.org.cn',
      access: `本地 sidecar ${CHICTR}（curl_cffi + 过盾）`,
      window: { disease: '标题含「淋巴瘤」', basis: 'createyear=2026' },
      status: 'unavailable',
      note: `sidecar 不可用：${err.message}。先启动 ~/Downloads/chictr_trials 的 sidecar 再跑。`,
      counts: { fetched: 0 },
      records: [],
    };
  }

  if (!json.ok) {
    return {
      source_id: 'chictr',
      label: 'ChiCTR 中国临床试验注册中心',
      org: 'WHO 一级注册机构（中国）',
      url: 'https://www.chictr.org.cn',
      access: `本地 sidecar ${CHICTR}`,
      window: { disease: '标题含「淋巴瘤」', basis: 'createyear=2026' },
      status: 'unavailable',
      note: `sidecar 报错：${json.error ?? '未知'}`,
      counts: { fetched: 0 },
      records: [],
    };
  }

  const total = json.total ?? 0;
  const totalPages = json.total_pages ?? 0;
  const got = json.results ?? [];
  let all = [...got];

  // pages 参数一次最多 50 页；不足则继续翻
  for (let p = 6; p <= totalPages && all.length < total; p += 5) {
    const u = new URL('/search', CHICTR);
    u.searchParams.set('title', '淋巴瘤');
    u.searchParams.set('createyear', '2026');
    u.searchParams.set('page', String(p));
    u.searchParams.set('pages', '5');
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(180000) });
      const j = await r.json();
      if (!j.ok) break;
      all.push(...(j.results ?? []));
    } catch {
      break;
    }
    await sleep(1200);
  }

  const seen = new Set();
  const records = [];
  for (const r of all) {
    const reg = str(r.registration_number);
    if (!reg || seen.has(reg)) continue;
    seen.add(reg);
    const date = str(r.registration_date); // 2026/10/16
    records.push({
      id: `chictr:${reg}`,
      source_id: 'chictr',
      source_record_id: reg,
      primary_registry: 'ChiCTR',
      registry_no: reg,
      title: str(r.title) ?? '(无标题)',
      brief_title: str(r.title),
      conditions: [],
      interventions: [],
      phase: null,
      status: null,
      status_cn: null,
      enrollment: null,
      start_date: date ? date.replaceAll('/', '-') : null,
      primary_completion_date: null,
      last_update: null,
      sponsor: str(r.institution),
      study_type: str(r.study_type),
      is_china: 1,
      site_count: null,
      china_sites: [{ facility: str(r.institution), city: null }],
      year_basis: 'registration',
      matched_by: 'title',
      url: str(r.detail_url) ?? 'https://www.chictr.org.cn',
      raw: { project_id: r.project_id, registration_date: date },
    });
  }

  return {
    source_id: 'chictr',
    label: 'ChiCTR 中国临床试验注册中心',
    org: 'WHO 一级注册机构（中国）',
    url: 'https://www.chictr.org.cn',
    access: `本地 sidecar ${CHICTR}（curl_cffi + 过盾）`,
    window: { disease: '标题含「淋巴瘤」', basis: 'createyear=2026（注册年份）' },
    status: records.length ? 'ok' : 'partial',
    note: `站点报告 2026 年 ${total} 条（${totalPages} 页），取回并去重 ${records.length} 条。ChiCTR 列表页不返回招募状态，故 status 留空；补状态需逐条拉详情。`,
    counts: { api_total: total, fetched: records.length, total_pages: totalPages },
    records,
  };
}

/* ---------------- 主流程 ---------------- */

const WANT = value('--source') ?? 'all';

async function run(name, fn) {
  process.stderr.write(`· ${name} … `);
  const t0 = Date.now();
  try {
    const snap = await fn();
    snap.fetched_at = new Date().toISOString();
    mkdirSync(OUT_DIR, { recursive: true });

    const target = join(OUT_DIR, `${snap.source_id}.json`);
    const prev = existsSync(target) ? JSON.parse(readFileSync(target, 'utf8')) : null;

    // 本次一条没拿到、而上次有数据：不覆盖。失败写进 _failed-<source>.json（下划线前缀，构建会跳过）。
    if (snap.records.length === 0 && snap.status !== 'ok' && (prev?.records?.length ?? 0) > 0) {
      writeFileSync(
        join(OUT_DIR, `_failed-${snap.source_id}.json`),
        JSON.stringify({ ...snap, kept_previous_at: prev.fetched_at, kept_previous_count: prev.records.length }, null, 1),
        'utf8'
      );
      process.stderr.write(
        `失败，保留上次快照 ${prev.records.length} 条（错误见 _failed-${snap.source_id}.json）\n`
      );
      return {
        source_id: snap.source_id,
        status: snap.status,
        fetched: 0,
        note: `${snap.note}（本次未覆盖上次快照）`,
        kept_previous: prev.records.length,
      };
    }

    writeFileSync(target, JSON.stringify(snap, null, 1), 'utf8');
    process.stderr.write(
      `${snap.status} ${snap.records.length} 条（${((Date.now() - t0) / 1000).toFixed(1)}s）\n`
    );
    return { source_id: snap.source_id, status: snap.status, fetched: snap.records.length, note: snap.note };
  } catch (err) {
    process.stderr.write(`失败：${err.message}\n`);
    return { source_id: name, status: 'failed', fetched: 0, note: err.message };
  }
}

const jobs = [];
if (WANT === 'all' || WANT === 'ctgov') jobs.push(['ctgov', collectCtgov]);
if (WANT === 'all' || WANT === 'veeva') jobs.push(['veeva', collectVeeva]);
if (WANT === 'all' || WANT === 'cde') jobs.push(['cde', collectCde]);
if (WANT === 'all' || WANT === 'chictr') jobs.push(['chictr', collectChictr]);
if (WANT === 'ictrp' || flag('--with-ictrp')) jobs.push(['ictrp', collectIctrp]);

if (!jobs.length) {
  console.error('没有匹配的 --source；可选 ctgov / veeva / cde / chictr / ictrp / all');
  process.exit(1);
}

const results = [];
for (const [name, fn] of jobs) results.push(await run(name, fn));

const manifest = {
  fetched_at: new Date().toISOString(),
  window_from: WINDOW_FROM,
  sources: results,
  total_records: results.reduce((n, r) => n + r.fetched, 0),
};
writeFileSync(join(OUT_DIR, '_run.json'), JSON.stringify(manifest, null, 1), 'utf8');

console.log('\n采集完成（快照在 knowledge/data/trials/）');
for (const r of results) {
  console.log(`  ${r.source_id.padEnd(7)} ${String(r.status).padEnd(12)} ${String(r.fetched).padStart(5)} 条`);
}
console.log(`  合计 ${manifest.total_records} 条`);
