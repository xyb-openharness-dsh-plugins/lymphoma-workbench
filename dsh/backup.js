/**
 * 备份与恢复（M4）。全部在本机完成，不走云端。
 *
 * 备份用 SQLite 的 `VACUUM INTO`，拿一致快照——直接 copy 正在写入的库可能复制到一半。
 * 恢复前先把当前库另存一份 `*.before-restore-<stamp>.sqlite`，避免一步走错就没得回头。
 *
 * 路径约束同资料目录：备份目录必须在资料目录之内，越界抛错。
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, renameSync } from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';
import { validateWorkspacePath } from './paths.js';

/** VACUUM INTO 不能参数化，路径只能拼进 SQL；单引号按 SQL 规则转义。 */
function sqlQuote(p) {
  return `'${String(p).replace(/'/g, "''")}'`;
}

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function backupDir(root) {
  const { path } = validateWorkspacePath(root);
  return join(path, 'backup');
}

/**
 * 备份当前库。
 * @returns {{ path: string, bytes: number, at: string }}
 */
export function createBackup({ db, root, at }) {
  const dir = backupDir(root);
  mkdirSync(dir, { recursive: true });
  const target = resolve(dir, `lymbell-${stamp(new Date())}.sqlite`);
  if (existsSync(target)) throw new Error(`备份文件已存在：${target}`);

  db.exec(`VACUUM INTO ${sqlQuote(target)}`);
  const bytes = statSync(target).size;
  return { path: target, bytes, at };
}

/** 列出备份，新的在前。 */
export function listBackups(root) {
  const dir = backupDir(root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sqlite'))
    .map((f) => {
      const p = join(dir, f);
      const s = statSync(p);
      return { file: f, path: p, bytes: s.size, at: s.mtime.toISOString().slice(0, 16).replace('T', ' ') };
    })
    .sort((a, b) => (a.file < b.file ? 1 : -1));
}

/**
 * 恢复：先给当前库留一份 before-restore，再把备份复制成当前库。
 * 调用方负责在恢复后重新打开库——这里只换文件。
 * @returns {{ restoredFrom: string, kept: string, at: string }}
 */
export function restoreBackup({ root, dbPath, file, at }) {
  const dir = backupDir(root);
  const name = String(file ?? '');
  // 只接受 backup/ 下的文件名本身；带路径分隔符的一律拒绝，不做规范化放过
  if (!name || name !== basename(name)) throw new Error('备份文件名不合法：只接受 backup/ 目录下的文件名');
  const src = resolve(dir, name);
  if (src !== dir && !src.startsWith(dir + sep)) throw new Error('备份文件路径越界');
  if (!existsSync(src)) throw new Error(`备份不存在：${src}`);

  const kept = `${dbPath}.before-restore-${stamp(new Date())}`;
  if (existsSync(dbPath)) renameSync(dbPath, kept);
  copyFileSync(src, dbPath);
  return { restoredFrom: src, kept, at };
}
