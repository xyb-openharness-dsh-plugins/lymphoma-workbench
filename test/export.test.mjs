/**
 * 导出与备份单测（A23 / A24 / M4）。
 *
 * 导出用内存库测模板与"只含选入项"；备份要用真实文件，临时目录建在主目录下
 * （不能用 os.tmpdir()：validateWorkspacePath 拒绝 /tmp 与 /var）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { migrate } from '../dsh/migrate.js';
import { createStore } from '../dsh/store.js';
import { seed } from '../dsh/seed.js';
import { buildPrepMarkdown, exportFilename, writeExport } from '../dsh/export.js';
import { createBackup, listBackups, restoreBackup, backupDir } from '../dsh/backup.js';

const TODAY = '2026-10-17';

function storeWithData() {
  const db = new DatabaseSync(':memory:');
  migrate(db, { now: () => '2026-10-17T00:00:00Z' });
  seed(db, { now: () => '2026-10-17T00:00:00Z' });
  return { db, store: createStore(db, { today: () => TODAY, now: () => '2026-10-17T00:00:00Z' }) };
}

/** 主目录下的临时工作区（validateWorkspacePath 允许，/tmp 不允许） */
function tempWorkspace() {
  const dir = mkdtempSync(join(homedir(), '.lymbell-test-'));
  return { dir, clean: () => rmSync(dir, { recursive: true, force: true }) };
}

/* ---------------- 模板 ---------------- */

test('A23：两区顺序固定，看法区首行带「不是医生结论」声明', () => {
  const md = buildPrepMarkdown({
    profile: { name: '周先生' },
    facts: [{ text: '下次复查要不要做 PET？', source: '本人添加' }],
    views: [{ text: '我担心复发', recordedOn: '2026-10-10' }],
    keyRecords: [{ label: '分型', value: 'DLBCL NOS' }],
    nextVisit: '2026-11-05',
    today: TODAY,
  });
  const iFacts = md.indexOf('一、想问的事');
  const iViews = md.indexOf('二、我的看法与担心');
  assert.ok(iFacts >= 0 && iViews > iFacts, '「想问的事」必须在「看法」之前');

  const afterView = md.slice(iViews).split('\n');
  // 标题之后的第一行非空内容必须是声明
  const firstContent = afterView.slice(1).find((l) => l.trim());
  assert.ok(
    firstContent.includes('不是医生结论'),
    `看法区首行必须是声明，实际「${firstContent}」`,
  );
});

test('A24：只导出选入项；没有选入就写「没有选入」', () => {
  const { db, store } = storeWithData();
  const before = store.exportPrep('p1');
  assert.ok(before.count > 0, '演示数据里应当有选入项');

  // 全部取消勾选 → 一条都不该进文件
  for (const q of store.questions('p1')) store.setQuestionSelected(q.id, false);
  const none = store.exportPrep('p1');
  assert.equal(none.count, 0);
  assert.ok(none.markdown.includes('（没有选入的问题）'));
  assert.ok(none.markdown.includes('（没有选入的看法）'));

  // 只选回一条 → 只有一条
  const one = store.questions('p1')[0];
  store.setQuestionSelected(one.id, true);
  assert.equal(store.exportPrep('p1').count, 1);
  db.close();
});

test('关键记录缺了写「未记录」，不补内容', () => {
  const md = buildPrepMarkdown({
    profile: null, facts: [], views: [], keyRecords: [{ label: '分型', value: '未记录' }], today: TODAY,
  });
  assert.ok(md.includes('- 分型：未记录'));
  assert.ok(!/DLBCL/.test(md), '库里没有就不该出现分型名');
});

test('导出文件名只有 ASCII，日期来自当天', () => {
  assert.match(exportFilename('2026-10-17', '120000'), /^prep-2026-10-17-120000\.md$/);
  assert.match(exportFilename(null, '120000'), /^prep-nodate-120000\.md$/);
});

test('导出落地：目录不在资料目录内就拒绝', () => {
  const { dir, clean } = tempWorkspace();
  try {
    const ok = writeExport({ root: dir, filename: 'a.md', text: '# x' });
    assert.equal(ok.path, join(dir, 'exports', 'a.md'));
    assert.equal(readFileSync(ok.path, 'utf8'), '# x');
    assert.equal(statSync(join(dir, 'exports')).isDirectory(), true);
  } finally {
    clean();
  }
  assert.throws(() => writeExport({ root: '/', filename: 'a.md', text: '# x' }), /根目录/);
});

/* ---------------- 备份与恢复 ---------------- */

test('备份：用 VACUUM INTO 出一份，列得出，恢复会先留一份当前库', () => {
  const { dir, clean } = tempWorkspace();
  const dbPath = join(dir, 'lymbell.sqlite');
  const db = new DatabaseSync(dbPath);
  migrate(db, { now: () => '2026-10-17T00:00:00Z' });
  seed(db, { now: () => '2026-10-17T00:00:00Z' });
  db.exec("INSERT INTO question (profile_id, created_on, text, kind, selected, source_text, ordinal) VALUES ('p1','2026-10-17','备份前才加的一条','fact',1,'本人添加',99)");
  const store = createStore(db, { today: () => TODAY, now: () => '2026-10-17T00:00:00Z', dbPath });

  try {
    store.setWorkspace({ root: dir });
    const made = store.backup();
    assert.ok(existsSync(made.path), '备份文件应当存在');
    assert.ok(made.bytes > 0);

    const items = store.backups();
    assert.equal(items.length, 1);

    // 恢复前再改一笔，用来确认恢复真的换回了备份内容
    db.exec("INSERT INTO question (profile_id, created_on, text, kind, selected, source_text, ordinal) VALUES ('p1','2026-10-17','备份后才加的','fact',1,'本人添加',100)");
    const done = store.restore(items[0].file);
    assert.ok(existsSync(done.kept), '恢复前必须给当前库留一份');

    const back = new DatabaseSync(dbPath, { readOnly: true });
    const rows = back.prepare("SELECT text FROM question WHERE source_text = '本人添加' AND text LIKE '备份%'").all();
    back.close();
    assert.deepEqual(rows.map((r) => r.text), ['备份前才加的一条'], '恢复后应当只有备份那一刻的内容');
  } finally {
    db.close();
    clean();
  }
});

test('备份目录越界：恢复不接受 backup/ 之外的文件', () => {
  const { dir, clean } = tempWorkspace();
  try {
    assert.throws(() => restoreBackup({ root: dir, dbPath: join(dir, 'x.sqlite'), file: '../escape.sqlite' }), /文件名不合法/);
    assert.throws(() => restoreBackup({ root: dir, dbPath: join(dir, 'x.sqlite'), file: 'nope.sqlite' }), /备份不存在/);
    assert.equal(backupDir(dir), join(dir, 'backup'));
  } finally {
    clean();
  }
});

test('createBackup 直接调用也要能出文件（不经过 store）', () => {
  const { dir, clean } = tempWorkspace();
  const dbPath = join(dir, 'lymbell.sqlite');
  const db = new DatabaseSync(dbPath);
  migrate(db, { now: () => '2026-10-17T00:00:00Z' });
  try {
    const made = createBackup({ db, root: dir, at: '2026-10-17 12:00' });
    assert.ok(existsSync(made.path));
    assert.equal(listBackups(dir).length, 1);
  } finally {
    db.close();
    clean();
  }
});
