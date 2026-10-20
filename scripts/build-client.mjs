#!/usr/bin/env node
/**
 * 生成 lib/client.js（DSH 客户端入口）。
 *
 * 官方要求客户端必须是「已构建好的单文件」——Desktop 不会替我们打包
 * （workbench-standard §3.5）。本项目的客户端还需要包成宿主认得的
 * `window.__ModuleLoader__` 形态（原生 ESM 会被 renderer 拒），
 * 所以这个"构建"做两件事：
 * 1. 把常量注入 `src/client.js`；
 * 2. 生成的产物才是 `lib/client.js`（页面用的 ESM 桥接是 `lib/bridge.js`，两者不是一回事）。
 *
 * 为什么是生成而不是手抄：包名、仓库、运行时 ID、接口前缀、面板参数
 * 各自只有一份来源（package.json、lib/identity.js、lib/layout.js）。
 * 手抄一份进客户端就会漂移，改成生成后由 `npm run check` 的 `--check` 兜住。
 *
 * 用法：
 *   node scripts/build-client.mjs           写入（内容没变不落盘）
 *   node scripts/build-client.mjs --check   只校验，与来源不一致时退出码 1
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'src', 'client.js');
const target = join(root, 'lib', 'client.js');
const checkOnly = process.argv.includes('--check');

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const {
  RUNTIME_ID, LEGACY_WORKBENCH_IDS, API_PREFIX, UI_ENTRY,
} = await import('../lib/identity.js');
const { PANEL } = await import('../lib/layout.js');

const repository = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url ?? '';
const canonical = String(repository)
  .replace(/^git@([^:]+):/, 'https://$1/')
  .replace(/^git:\/\//, 'https://')
  .replace(/\.git$/, '')
  .replace(/\/+$/, '');

const replacements = {
  '{{PKG_NAME}}': pkg.name,
  '{{RUNTIME_ID}}': RUNTIME_ID,
  '{{LEGACY_IDS}}': JSON.stringify(LEGACY_WORKBENCH_IDS),
  '{{API_PREFIX}}': API_PREFIX,
  '{{UI_ENTRY}}': UI_ENTRY,
  '{{REPOSITORY}}': canonical,
  '{{LAYOUT}}': JSON.stringify({ businessSide: PANEL.businessSide, businessWidth: PANEL.businessWidth }),
};

if (!existsSync(source)) {
  console.error('✗ 缺少 src/client.js（客户端入口源码）');
  process.exit(1);
}

let generated = readFileSync(source, 'utf8');
for (const [token, value] of Object.entries(replacements)) {
  generated = generated.split(token).join(value);
}
const leftover = generated.match(/\{\{[A-Z_]+\}\}/);
if (leftover) {
  console.error(`✗ src/client.js 里有未注入的占位符：${leftover[0]}`);
  process.exit(1);
}

if (checkOnly) {
  if (!existsSync(target)) {
    console.error('✗ 缺少 lib/client.js，请先运行 npm run build:client');
    process.exit(1);
  }
  if (readFileSync(target, 'utf8') !== generated) {
    console.error('✗ lib/client.js 与来源不同步，请运行 npm run build:client');
    process.exit(1);
  }
  console.log('✓ lib/client.js 与来源同步');
  process.exit(0);
}

if (existsSync(target) && readFileSync(target, 'utf8') === generated) {
  console.log('= lib/client.js 未变化');
  process.exit(0);
}

writeFileSync(target, generated);
console.log('✓ 已生成 lib/client.js');
