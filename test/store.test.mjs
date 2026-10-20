/**
 * 数据层单测（M1）。
 *
 * 覆盖：迁移幂等、演示数据、读模型形状，以及 SCHEMA-SPEC §5 的写入契约。
 * 全部用内存库，不落盘、不依赖本机资料目录。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from '../dsh/migrate.js';
import { createStore, assertNotFuture, assertPlanDate, todayISO } from '../dsh/store.js';
import { seed } from '../dsh/seed.js';
import { validateWorkspacePath } from '../dsh/paths.js';

const TODAY = '2026-10-17';

/** 未迁移的空库 */
function fresh() {
  return new DatabaseSync(':memory:');
}

/** 已迁移到最新 + 演示数据 */
function storeWithData() {
  const db = fresh();
  migrate(db, { now: () => '2026-10-17T00:00:00Z' });
  seed(db, { now: () => '2026-10-17T00:00:00Z' });
  return { db, store: createStore(db, { today: () => TODAY, now: () => '2026-10-17T00:00:00Z' }) };
}

test('迁移可重跑：第二次不重复执行，也不改已冻结文件', () => {
  const db = fresh();
  const first = migrate(db, { now: () => '2026-10-17T00:00:00Z' });
  const second = migrate(db, { now: () => '2026-10-17T00:00:01Z' });
  const third = migrate(db, { now: () => '2026-10-17T00:00:02Z' });
  assert.equal(first.executed.length, 2); // 0001 业务结构 + 0002 报告导入
  assert.equal(second.executed.length, 0);
  assert.equal(third.executed.length, 0);
  assert.equal(db.prepare('SELECT version FROM schema_version ORDER BY version').all().length, 2);
  db.close();
});

test('日期两把尺子：事件不许未来，计划允许未来', () => {
  assert.throws(() => assertNotFuture('2026-10-18', TODAY, '发生日期'), /不得晚于今天/);
  assert.equal(assertNotFuture('2026-10-17', TODAY, '发生日期'), '2026-10-17');
  assert.equal(assertNotFuture(null, TODAY, '发生日期'), null);
  assert.equal(assertPlanDate('2027-01-01', '计划日期'), '2027-01-01');
  assert.throws(() => assertPlanDate('2026/01/01'), /必须是 YYYY-MM-DD/);
  assert.equal(typeof todayISO(), 'string');
});

test('演示档案：只有 p1 有完整指标，p2 是观察等待', () => {
  const { db, store } = storeWithData();
  const ps = store.profiles();
  assert.equal(ps.length, 5);
  assert.equal(ps[0].id, 'p1');
  assert.equal(ps[0].full, true);
  assert.equal(ps[0].ww, false);
  assert.equal(ps[1].ww, true);
  assert.equal(ps[1].full, false);
  assert.match(ps[0].plan, /R-CHOP ×6 已完成/);
  db.close();
});

test('演示数据在 6 个月窗口里连续采样（一图秀能画出折线；影像类按 3 个月一次）', () => {
  const { db, store } = storeWithData();
  const b = store.bootstrap('p1');
  const inWindow = (points) => points.filter((p) => p.d >= '2026-04-17' && p.d <= '2026-10-17').length;
  for (const code of ['ldh', 'anc', 'hgb', 'plt', 'igg', 'crp', 'wt']) {
    assert.ok(inWindow(b.metrics[code].points) >= 6, `${code} 在 6 个月内至少 6 个点，实际 ${inWindow(b.metrics[code].points)}`);
  }
  // 影像不放宽到每 2 周：半月做一次 PET/CT 是假的，宁可这条线点少
  assert.equal(inWindow(b.metrics.lesion.points), 3);
  db.close();
});

test('读模型形状：6 个分类、10 个指标定义、89 个指标点', () => {
  const { db, store } = storeWithData();
  const b = store.bootstrap('p1');
  assert.equal(b.cats.length, 6);
  assert.deepEqual(b.cats[0], ['肿瘤负荷', '#7c5cbf']);
  assert.equal(Object.keys(b.metrics).length, 10);
  assert.equal(b.metrics.ldh.points.length, 13);
  assert.equal(b.metrics.ctcae.numeric, false, '治疗毒性是分类变量，不许画趋势');
  assert.equal(b.docs.length, 5);
  assert.equal(b.lesions.length, 3);
  assert.equal(b.pets.length, 3);
  assert.equal(b.cycles.length, 6);
  assert.equal(b.aes.length, 4);
  assert.equal(b.treatments.filter((t) => t.kind === 'chemo').length, 6);
  assert.equal(b.treatments.filter((t) => t.kind !== 'chemo').length, 3);
  db.close();
});

test('未检测原样保留，不补成阴性（A4）', () => {
  const { db, store } = storeWithData();
  const ihc = store.markers('p1', 'IHC');
  const pdl1 = ihc.find((r) => r[0] === 'PD-L1');
  assert.equal(pdl1[1], '未检测');
  const state = db.prepare("SELECT result_state FROM pathology_marker WHERE marker = 'PD-L1'").get().result_state;
  assert.equal(state, 'not_tested');
  db.close();
});

test('Deauville 只能是 1–5 或 NULL', () => {
  const { db } = storeWithData();
  const lineId = db.prepare('SELECT id FROM treatment_line WHERE line_no = 1 AND profile_id = ?').get('p1').id;
  assert.throws(
    () => db.prepare('INSERT INTO response (line_id, timepoint, assessed_on, deauville) VALUES (?, ?, ?, ?)').run(lineId, 'X', '2026-01-01', 7),
    /CHECK constraint failed|deauville/,
  );
  db.close();
});

test('分型只能新增版本，不能改旧值也不能删', () => {
  const { db } = storeWithData();
  const id = db.prepare('SELECT id FROM subtype_assertion WHERE profile_id = ? AND is_current = 1').get('p1').id;
  assert.throws(
    () => db.prepare("UPDATE subtype_assertion SET name_zh = '改了' WHERE id = ?").run(id),
    /内容不可改/,
  );
  assert.throws(
    () => db.prepare('DELETE FROM subtype_assertion WHERE id = ?').run(id),
    /只增不删/,
  );
  db.close();
});

test('周期延迟必须写原因（A9）', () => {
  const { db } = storeWithData();
  const lineId = db.prepare('SELECT id FROM treatment_line WHERE line_no = 1 AND profile_id = ?').get('p1').id;
  assert.throws(
    () => db.prepare('INSERT INTO cycle (line_id, n, planned_on, delay_days) VALUES (?, 99, ?, 5)').run(lineId, '2026-01-01'),
    /CHECK constraint failed|delay/,
  );
});

test('写入：未来日期拒绝、空内容拒绝、计划日期放行', () => {
  const { db, store } = storeWithData();
  assert.throws(() => store.addFeverLog({ profileId: 'p1', happenedOn: '2027-01-01', tempC: 38 }), /不得晚于今天/);
  assert.throws(() => store.addQuestion({ profileId: 'p1', text: '  ' }), /为空/);
  assert.throws(() => store.addViewpoint({ profileId: 'p1', text: '' }), /为空/);
  assert.throws(() => store.addTreatmentLine({ profileId: 'p1', regimenName: 'X', startedOn: '2027-01-01' }), /不得晚于今天/);
  const t = store.addTask({ profileId: 'p1', dueOn: '2026-12-31', title: '复查' });
  assert.equal(t.done, false);
  assert.equal(store.tasks('p1').length, 4);
  db.close();
});

test('私密默认：不显式放开就读不到看法（D39）', () => {
  const { db, store } = storeWithData();
  assert.equal(store.viewpoints('p1').length, 0);
  assert.equal(store.viewpoints('p1', { includePrivate: true }).length, 1);
  db.close();
});

test('新治疗线独立成组，周期号自增（D24）', () => {
  const { db, store } = storeWithData();
  const line = store.addTreatmentLine({ profileId: 'p1', regimenName: 'R-ICE', startedOn: '2026-10-10', intent: 'salvage' });
  assert.equal(line.lineNo, 2);
  const c = store.addCycle({ profileId: 'p1', actualOn: '2026-10-12', doseAdjust: '足量' });
  assert.equal(c.lineNo, 2, '给药挂在进行中的那一线');
  assert.equal(c.n, 1);
  db.close();
});

test('没有进行中的治疗线时，记给药会直接说清楚', () => {
  const { db, store } = storeWithData();
  assert.throws(() => store.addCycle({ profileId: 'p2', actualOn: '2026-10-12' }), /没有进行中的治疗线/);
  db.close();
});

test('体重写入与一图秀同源：wt 序列加一个点', () => {
  const { db, store } = storeWithData();
  const before = store.metrics('p1').wt.points.length;
  store.addWeight({ profileId: 'p1', happenedOn: '2026-10-17', kg: 71.5 });
  assert.equal(store.metrics('p1').wt.points.length, before + 1);
  assert.throws(() => store.addWeight({ profileId: 'p1', happenedOn: '2026-10-17', kg: 'abc' }), /不是数字/);
  db.close();
});

test('资料目录：主目录 / 根目录 / 桌面根一律拒绝', () => {
  const home = process.env.HOME;
  assert.throws(() => validateWorkspacePath('/'), /根目录/);
  assert.throws(() => validateWorkspacePath(home), /主目录根/);
  assert.throws(() => validateWorkspacePath(`${home}/Desktop`), /桌面根/);
  assert.throws(() => validateWorkspacePath('relative/path'), /绝对路径/);
  assert.equal(validateWorkspacePath(`${home}/Documents/LymBell`).path, `${home}/Documents/LymBell`);
});
