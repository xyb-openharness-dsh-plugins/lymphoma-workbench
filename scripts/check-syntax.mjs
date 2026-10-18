#!/usr/bin/env node
/**
 * 语法门：把会进包或在浏览器里跑的脚本逐个过一遍 `node --check`。
 *
 * 为什么单独一条：业务代码分散在 dsh/ 与 public/，任何一个语法错都会在运行时
 * 变成整页白屏；`npm pack` 又不会替你解析 JS。这里一次性挡住。
 *
 * 用法：node scripts/check-syntax.mjs
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIRS = ['dsh', 'lib', 'scripts', 'public', 'knowledge'];
const SKIP = new Set(['public/app.js.map']);

function walk(dir, out = []) {
  let entries = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name.startsWith('.') || name === 'node_modules') continue;
    const p = join(dir, name);
    if (SKIP.has(p.slice(root.length + 1))) continue;
    if (statSync(p).isDirectory()) {
      if (name === 'assets' || name === 'data' || name === 'trials') continue;
      walk(p, out);
    } else if (/\.(m?js)$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

const files = DIRS.flatMap((d) => walk(join(root, d)));
const bad = [];
for (const f of files) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'ignore' });
  } catch (e) {
    bad.push(`${f.slice(root.length + 1)}：${String(e.stderr || e.message).split('\n')[0]}`);
  }
}

if (bad.length) {
  console.error(`✗ 语法检查失败（${bad.length} 个文件）：`);
  for (const b of bad) console.error(`  - ${b}`);
  process.exit(1);
}
console.log(`✓ 语法检查通过（${files.length} 个脚本）`);
