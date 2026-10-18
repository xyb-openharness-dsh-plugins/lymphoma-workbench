#!/usr/bin/env node
/**
 * 版本号一致性校验。
 *
 * 单一来源：仓库根目录的 VERSION 文件（一行，语义化版本，可带预发布后缀）。
 * 本脚本核对所有「会显示给人看」的地方，防止页面版本与实际版本漂移。
 *
 * 用法：node scripts/check-version.mjs
 * 退出码：0 全部一致；1 有不一致或读不到。
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const problems = [];
const checks = [];

function check(name, actual, expected) {
  const ok = actual === expected;
  checks.push({ name, actual, expected, ok });
  if (!ok) problems.push(`${name}：期望 ${expected}，实际 ${actual ?? '（未找到）'}`);
}

if (!existsSync(join(root, 'VERSION'))) {
  console.error('✗ 缺少 VERSION 文件（仓库根目录）');
  process.exit(1);
}

const version = read('VERSION').trim();
if (!SEMVER.test(version)) {
  console.error(`✗ VERSION 不是合法语义化版本：${version}`);
  process.exit(1);
}

/* 0) 原型 v0.1 已冻结在 0.1.0（D37 同款：原型是验收基准，不跟着当前版本漂移） */
const FROZEN_PROTOTYPE = '0.1.0';

/* 1) 原型页面：app.js 的 APP_INFO.version */
const appJs = read('prototypes/v0.1/app.js');
const m = appJs.match(/version:\s*'([^']+)'/);
check('prototypes/v0.1/app.js APP_INFO.version（冻结）', m?.[1], FROZEN_PROTOTYPE);

/* 2) 原型页面标题里的 vX.Y.Z */
const html = read('prototypes/v0.1/index.html');
const t = html.match(/<title>[^<]*?v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)<\/title>/);
check('prototypes/v0.1/index.html <title>（冻结）', t?.[1], FROZEN_PROTOTYPE);

/* 3) 页面里所有 vX.Y.Z 字面量（含 JS 未运行时的降级值、chip、页脚、关于）
   运行时这些位置由 APP_INFO 覆盖；这里锁住降级值，避免只改一处导致首屏短暂显示旧版本。 */
const literals = [...html.matchAll(/v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/g)].map((x) => x[1]);
const uniq = [...new Set(literals)];
check('prototypes/v0.1/index.html 版本字面量（冻结，去重）', uniq.join(', '), FROZEN_PROTOTYPE);

/* 3b) 产品页面 public/index.html：首屏降级值必须跟当前版本 */
if (existsSync(join(root, 'public/index.html'))) {
  const pub = read('public/index.html');
  const pt = pub.match(/<title>[^<]*?v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)<\/title>/);
  check('public/index.html <title>', pt?.[1], version);
  const pl = [...new Set([...pub.matchAll(/v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/g)].map((x) => x[1]))];
  check('public/index.html 版本字面量（去重）', pl.join(', '), version);
}

/* 4) 构建期注入的 lib/version.js（生成物，由 scripts/build-version.mjs 从 VERSION 生成） */
if (existsSync(join(root, 'lib/version.js'))) {
  const libVersion = read('lib/version.js').match(/export const version = '([^']+)'/)?.[1];
  check('lib/version.js version', libVersion, version);
} else {
  problems.push('缺少 lib/version.js（页面与包的唯一版本来源），请运行 npm run build:version');
}

/* 5) 若已进入打包阶段，package.json 必须一致 */
if (existsSync(join(root, 'package.json'))) {
  const pkg = JSON.parse(read('package.json'));
  check('package.json version', pkg.version, version);
}

/* 6) DSH 工作台清单（接入后存在才检查） */
for (const p of ['dsh.profile.json', 'workbench.json', 'dsh/manifest.json']) {
  if (!existsSync(join(root, p))) continue;
  try {
    const json = JSON.parse(read(p));
    check(`${p} version`, json.version, version);
  } catch {
    problems.push(`${p} 不是合法 JSON，无法核对版本`);
  }
}

const pad = (s, n) => String(s ?? '（未找到）').padEnd(n);
for (const c of checks) {
  console.log(`${c.ok ? '✓' : '✗'} ${pad(c.name, 42)} ${c.actual ?? '—'}`);
}

if (problems.length) {
  console.error('\n版本号不一致：');
  for (const p of problems) console.error(`  - ${p}`);
  console.error('\n改版本时请先改 VERSION，再让其余位置与它一致（见 docs/VERSIONING.md）。');
  process.exit(1);
}

console.log(`\n✓ 版本号一致：v${version}（共核对 ${checks.length} 处）`);
