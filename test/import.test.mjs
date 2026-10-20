/**
 * 报告导入与草稿核对单测（M2 第二段）+ 原生 Agent 会话绑定 API。
 *
 * 覆盖 A2 四条规矩与日期优先级：
 * 1. 原件去重（重复导入不重置状态、不重复落库）；
 * 2. 解析失败不产候选（假客户端抛错 → parse_failed，候选 0，可重试）；
 * 3. 候选合并（UNIQUE(import_id, field, value_text)）；
 * 4. 接受写 metric_point：日期取值 候选自带 > 本次传入 > 材料报告日期；
 *    都没有 → DATE_REQUIRED，导入时间永不顶替。
 *
 * 全部用内存库与假 MinerU 客户端，不联网。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from '../dsh/migrate.js';
import { createStore } from '../dsh/store.js';
import { seed } from '../dsh/seed.js';
import { createImportService, ImportError, assertMedicalDate } from '../dsh/import.js';
import { extractCandidates } from '../dsh/labparse.js';
import { createWorkbenchServer } from '../dsh/server.js';
import { Readable } from 'node:stream';

const TODAY = '2026-10-17';

function setup() {
  const db = new DatabaseSync(':memory:');
  migrate(db, { now: () => '2026-10-17T00:00:00Z' });
  seed(db, { now: () => '2026-10-17T00:00:00Z' });
  const store = createStore(db, { today: () => TODAY, now: () => '2026-10-17T00:00:00Z' });
  const imp = createImportService(store, { today: () => TODAY });
  return { db, store, imp };
}

const GOOD_PDF = Buffer.from('%PDF-1.7 检验报告单（测试）');

/** 假 MinerU 客户端：返回固定 markdown，模拟一次成功解析。 */
const OK_CLIENT = {
  async parse() {
    return {
      batchId: 'batch-test',
      zipUrl: null,
      pages: 2,
      markdown: [
        '检验报告单',
        '报告日期：2026-09-30 10:22',
        '| Item | Result | Unit |',
        '| LDH | 268 | U/L |',
        '| 中性粒细胞绝对值 | 1.2 | 10^9/L |',
        '| 血红蛋白 | 98 | g/L |',
        '| 体重 | 62.5 | kg |',
      ].join('\n'),
      contentList: null,
      names: ['full.md'],
    };
  },
};

/** 假客户端：云端 401（Token 失效）。 */
const BAD_CLIENT = {
  async parse() {
    throw new ImportError('UNAUTHORIZED', 'MinerU 拒绝了这个 Token（HTTP 401）');
  },
};

async function importAndParse(imp, { client = OK_CLIENT, profileId = 'p1' } = {}) {
  const first = imp.importFile({
    profileId, filename: '血常规-2026-09-30.pdf', sha256: 'a'.repeat(64),
    storagePath: 'imports/test.pdf', mime: 'application/pdf', bytes: GOOD_PDF.length,
  });
  const result = await imp.parseWithMineru({ importId: first.file.id, bytes: GOOD_PDF, client });
  return { first, result };
}

test('解析成功：候选写入 + 材料置 parsed + 报告日期回填，同值合并', async () => {
  const { imp, db } = setup();
  const { result } = await importAndParse(imp);
  assert.equal(result.inserted, 4); // LDH / ANC / HGB / 体重
  assert.equal(result.reportDate, '2026-09-30');
  assert.equal(result.file.status, 'parsed');
  const rows = db.prepare("SELECT field, value_text, value_num, unit FROM candidate ORDER BY field").all();
  assert.equal(rows.length, 4);
  const ldh = rows.find((r) => r.field === 'metric:ldh');
  assert.equal(ldh.value_num, 268);
  assert.equal(ldh.unit, 'U/L');
  // 已解析成功的材料不许重复解析（要重来就重新导入）
  await assert.rejects(
    () => imp.parseWithMineru({ importId: result.file.id, bytes: GOOD_PDF, client: OK_CLIENT }),
    (e) => e.code === 'ALREADY_PARSED',
  );
  // 同字段同值只留一条：UNIQUE(import_id, field, value_text) 合并
  const dup = imp.addCandidate({ importId: result.file.id, field: 'metric:ldh', valueText: '268' });
  assert.equal(dup.merged, true);
  db.close();
});

test('解析失败：整体回滚，不产候选，材料 parse_failed，原件可重试（A2）', async () => {
  const { imp, db } = setup();
  const first = imp.importFile({
    profileId: 'p1', filename: '血常规-2026-09-30.pdf', sha256: 'a'.repeat(64),
    storagePath: 'imports/test.pdf', mime: 'application/pdf', bytes: GOOD_PDF.length,
  });
  await assert.rejects(
    () => imp.parseWithMineru({ importId: first.file.id, bytes: GOOD_PDF, client: BAD_CLIENT }),
    (e) => e.code === 'UNAUTHORIZED',
  );
  const file = db.prepare('SELECT * FROM import_file WHERE id = ?').get(first.file.id);
  assert.equal(file.status, 'parse_failed');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM candidate').get().n, 0);
  const jobs = imp.jobsFor(first.file.id);
  assert.equal(jobs[0].status, 'failed');
  assert.equal(jobs[0].error_code, 'UNAUTHORIZED');
  // 同一原件重试成功 → 候选正常生成
  const retry = await imp.parseWithMineru({ importId: first.file.id, bytes: GOOD_PDF, client: OK_CLIENT });
  assert.equal(retry.inserted, 4);
  db.close();
});

test('重复导入：返回原记录，不重置解析状态；缺日期时补一次', () => {
  const { imp, db } = setup();
  const a = imp.importFile({ profileId: 'p1', filename: 'x.pdf', sha256: 'b'.repeat(64), storagePath: 'imports/b.pdf' });
  assert.equal(a.duplicate, false);
  const b = imp.importFile({ profileId: 'p1', filename: 'x-再传一次.pdf', sha256: 'b'.repeat(64), storagePath: 'imports/b.pdf' });
  assert.equal(b.duplicate, true);
  assert.equal(b.file.id, a.file.id);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM import_file').get().n, 1);
  // 补日期
  const c = imp.importFile({ profileId: 'p1', filename: 'x.pdf', sha256: 'b'.repeat(64), storagePath: 'imports/b.pdf', reportDate: '2026-09-30' });
  assert.equal(c.dateBackfilled, true);
  assert.equal(db.prepare('SELECT report_date FROM import_file WHERE id = ?').get(c.file.id).report_date, '2026-09-30');
  db.close();
});

test('未解析的材料不许加候选；未入库指标拒绝', () => {
  const { imp } = setup();
  const f = imp.importFile({ profileId: 'p1', filename: 'y.pdf', sha256: 'c'.repeat(64), storagePath: 'imports/y.pdf' });
  assert.throws(
    () => imp.addCandidate({ importId: f.file.id, field: 'metric:ldh', valueText: '268' }),
    (e) => e.code === 'PARSE_REQUIRED',
  );
  assert.throws(
    () => imp.addCandidate({ importId: f.file.id, field: 'metric:不存在的', valueText: '1' }),
    (e) => e.code === 'UNKNOWN_METRIC',
  );
});

test('接受候选：日期缺失报 DATE_REQUIRED；给了日期写 metric_point 并回填 record_id', async () => {
  const { imp, db } = setup();
  const { result } = await importAndParse(imp);
  const file = result.file;
  const rows = db.prepare("SELECT id, field, occurred_on FROM candidate WHERE import_id = ? ORDER BY field").all(file.id);
  const noDate = rows.find((r) => r.occurred_on === null);
  if (noDate) {
    assert.throws(
      () => imp.decideCandidate({ candidateId: noDate.id, action: 'accept' }),
      (e) => e.code === 'DATE_REQUIRED',
    );
  }
  // 显式日期 > 候选自带
  const ldh = rows.find((r) => r.field === 'metric:ldh');
  const decided = imp.decideCandidate({ candidateId: ldh.id, action: 'accept', occurredOn: '2026-10-01' });
  assert.equal(decided.fact.measured_on, '2026-10-01');
  assert.equal(decided.fact.code, 'ldh');
  assert.equal(decided.fact.value_num, 268);
  assert.match(decided.fact.source_text, /报告抄写：血常规-2026-09-30\.pdf/);
  const back = db.prepare('SELECT record_id, status FROM candidate WHERE id = ?').get(ldh.id);
  assert.equal(back.status, 'accepted');
  assert.equal(back.record_id, decided.fact.id);
  // 已决定的不许重复决定
  assert.throws(
    () => imp.decideCandidate({ candidateId: ldh.id, action: 'accept', occurredOn: '2026-10-02' }),
    (e) => e.code === 'TERMINAL',
  );
  db.close();
});

test('整单收下：候选自带 > 传入 > 材料报告日期；缺单位/缺日期的留下并给原因', async () => {
  const { imp, db } = setup();
  const { result } = await importAndParse(imp);
  const file = db.prepare('SELECT * FROM import_file WHERE id = ?').get(result.file.id);
  // 本 fixture 全部候选带 occurred_on=2026-09-30（报告日期），应全部收下
  const r1 = imp.acceptFileCandidates({ importId: file.id });
  assert.equal(r1.accepted.length, 4);
  assert.equal(r1.skipped.length, 0);
  // 只看本次抄写写入的点（库里还有演示档案自带的 metric_point）
  const dates = db.prepare("SELECT DISTINCT measured_on FROM metric_point WHERE source_text LIKE '报告抄写%'").all().map((r) => r.measured_on);
  assert.deepEqual(dates, ['2026-09-30']);
  db.close();
});

test('整单收下：三处都没有日期 → date_missing，不拿导入时间顶替', async () => {
  const { imp, db } = setup();
  const f = imp.importFile({ profileId: 'p1', filename: 'z.pdf', sha256: 'd'.repeat(64), storagePath: 'imports/z.pdf' });
  await imp.parseWithMineru({
    importId: f.file.id, bytes: GOOD_PDF,
    client: { async parse() { return { batchId: 'x', markdown: '| LDH | 200 | U/L |', contentList: null, pages: 1 }; } },
  });
  const r = imp.acceptFileCandidates({ importId: f.file.id });
  assert.equal(r.accepted.length, 0);
  assert.equal(r.skipped[0]?.reasons?.[0], 'date_missing');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM metric_point WHERE source_text LIKE '报告抄写%'").get().n, 0);
  db.close();
});

test('单位缺失：整单收下会跳过并标 unit_missing，由单条核对补', async () => {
  const { imp, db } = setup();
  const f = imp.importFile({ profileId: 'p1', filename: 'w.pdf', sha256: 'e'.repeat(64), storagePath: 'imports/w.pdf', reportDate: '2026-09-30' });
  await imp.parseWithMineru({
    importId: f.file.id, bytes: GOOD_PDF,
    client: { async parse() { return { batchId: 'x', markdown: '报告日期：2026-09-30\n| LDH | 200 |  |', contentList: null, pages: 1 }; } },
  });
  const r = imp.acceptFileCandidates({ importId: f.file.id });
  assert.equal(r.accepted.length, 0);
  assert.deepEqual(r.skipped[0]?.reasons, ['unit_missing']);
  db.close();
});

test('labparse：不等式保留原文 value_num 为空；把握度阈值问题被标记', () => {
  const out = extractCandidates({ markdown: '报告日期：2026-09-30\nCRP <0.5 mg/L' });
  assert.equal(out.items.length, 1);
  assert.equal(out.items[0].valueText, '<0.5');
  assert.equal(out.items[0].valueNum, null);
  assert.equal(out.items[0].unit, 'mg/L');
});

test('日期常识边界：未来与早于 1940 都拒绝', () => {
  assert.throws(() => assertMedicalDate('2026-12-01', '日期', () => TODAY), (e) => e.code === 'FUTURE_DATE');
  assert.throws(() => assertMedicalDate('1939-12-31', '日期', () => TODAY), (e) => e.code === 'IMPLAUSIBLE_DATE');
  assert.throws(() => assertMedicalDate('2026-02-31', '日期', () => TODAY), (e) => e.code === 'BAD_DATE');
});

/* ---------------- Agent 会话-项目绑定 API ---------------- */

function mockRes() {
  return {
    code: 0, headers: {}, body: '',
    writeHead(c, h) { this.code = c; this.headers = h; },
    end(b = '') { this.body = typeof b === 'string' ? b : b.toString('utf8'); },
  };
}
async function call(app, method, url, body) {
  const req = Readable.from([body === undefined ? Buffer.alloc(0) : Buffer.from(JSON.stringify(body))]);
  req.method = method; req.url = url;
  const res = mockRes();
  await app.handle(req, res);
  const isJson = String(res.headers['content-type'] ?? '').includes('json');
  return { status: res.code, json: isJson && res.body ? JSON.parse(res.body) : null, raw: res.body };
}

test('Agent 绑定：session→project 写入并可恢复；bridge.js 可被浏览器取到', async () => {
  const app = createWorkbenchServer({ dbPath: ':memory:', kbPath: null, seed: true });
  const w1 = await call(app, 'POST', '/api/agent/session-projects', { sessionId: 's-1', projectId: 'p2' });
  assert.equal(w1.status, 200);
  assert.equal(w1.json.sessions['s-1'], 'p2');
  const w2 = await call(app, 'POST', '/api/agent/session-projects', { sessionId: 's-2', projectId: 'p1' });
  assert.equal(w2.json.sessions['s-2'], 'p1');
  const got = await call(app, 'GET', '/api/agent/session-projects');
  assert.equal(got.json.sessions['s-1'], 'p2'); // 互不抢占
  const bridge = await call(app, 'GET', '/bridge.js');
  assert.equal(bridge.status, 200);
  assert.match(bridge.raw, /wb-xyb-openharness-dsh-plugins-lymphoma-workbench/);
  app.close();
});
