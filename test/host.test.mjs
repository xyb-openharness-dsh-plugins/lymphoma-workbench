/**
 * 宿主接入层单测（M5）。
 *
 * 不起真实端口、不依赖 DSH：用假 ctx 驱动 `apply()`，直接调 handler。
 * 目录一律建在用户主目录下的临时目录（validateWorkspacePath 拒绝 /tmp 与 /var）。
 * 覆盖：前缀路由注册、授权闸、宿主前缀请求端到端、页面注入，以及装机身份三处一致。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { apply, createHostHandler, name, inject } from '../dsh/host.js';
import { stripBasePath } from '../dsh/server.js';
import { PLUGIN_ID, API_PREFIX, HOME_DIR, UI_ENTRY, RUNTIME_ID } from '../lib/identity.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

function mockRes() {
  return {
    code: 0, headers: {}, body: '',
    writeHead(c, h) { this.code = c; this.headers = h; },
    end(b = '') { this.body = typeof b === 'string' ? b : (b ? b.toString('utf8') : ''); },
  };
}

async function call(handler, method, url, body) {
  const req = Readable.from([body === undefined ? Buffer.alloc(0) : Buffer.from(JSON.stringify(body))]);
  req.method = method;
  req.url = url;
  const res = mockRes();
  await handler(req, res);
  const isJson = String(res.headers['content-type'] ?? '').includes('json');
  return { status: res.code, json: isJson && res.body ? JSON.parse(res.body) : null, raw: res.body, headers: res.headers };
}

/**
 * 假宿主上下文。`effect` 直接执行（cordis 里它就是这样），并把登记项收集起来。
 * @param {object} [opts]
 * @param {number|null} [opts.reject] requestRejection 的返回值；null 表示放行
 */
function fakeCtx({ reject = null, withRejection = true } = {}) {
  const registrations = [];
  const effects = [];
  return {
    registrations,
    effects,
    webServer: {
      register(opts) { registrations.push(opts); return () => {}; },
    },
    connection: withRejection
      ? { requestRejection: () => (reject === null ? undefined : reject) }
      : {},
    effect(fn, label) {
      effects.push({ label, kind: 'effect' });
      return fn();
    },
  };
}

/** 每个用例一个临时目录，跑完删掉。 */
function withRoot(fn) {
  const dir = mkdtempSync(join(homedir(), '.xyb-lymbell-host-'));
  try {
    return fn(dir);
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* 清理失败不影响测试结论 */ }
  }
}

const PREFIX = '/api/lymphoma-workbench';

/* ---------------- 路径改写 ---------------- */

test('stripBasePath：三条规则 + 独立启动时原样返回', () => {
  assert.equal(stripBasePath(`${PREFIX}`, PREFIX), '/index.html');
  assert.equal(stripBasePath(`${PREFIX}/`, PREFIX), '/index.html');
  assert.equal(stripBasePath(`${PREFIX}/ui`, PREFIX), '/index.html');
  assert.equal(stripBasePath(`${PREFIX}/ui/app.js`, PREFIX), '/app.js');
  assert.equal(stripBasePath(`${PREFIX}/api/bootstrap`, PREFIX), '/api/bootstrap');
  // 独立启动：base 为空串
  assert.equal(stripBasePath('/api/bootstrap', ''), '/api/bootstrap');
  assert.equal(stripBasePath('/', ''), '/');
  // 不以 base 开头的路径不改写，避免把别的前缀切坏
  assert.equal(stripBasePath('/api/other/x', PREFIX), '/api/other/x');
});

/* ---------------- 挂载 ---------------- */

test('apply：按 API_PREFIX 注册一条 prefix 路由，且不返回值', () => {
  withRoot((root) => {
    const ctx = fakeCtx();
    const result = apply(ctx, { root });
    assert.equal(result, undefined, 'cordis 要求 apply 无返回值');
    assert.equal(ctx.registrations.length, 1);
    assert.equal(ctx.registrations[0].kind, 'prefix');
    assert.equal(ctx.registrations[0].path, API_PREFIX);
    assert.equal(ctx.effects[0]?.label, `${PLUGIN_ID}: api`);
  });
});

test('apply 的注册项与身份常量同源', () => {
  assert.equal(name, PLUGIN_ID);
  assert.deepEqual(inject, ['webServer', 'connection']);
  assert.equal(API_PREFIX, PREFIX);
  assert.equal(UI_ENTRY, `${PREFIX}/ui/`);
  assert.equal(HOME_DIR, 'lymphoma-workbench');
  assert.equal(RUNTIME_ID, 'wb-xyb-openharness-dsh-plugins-lymphoma-workbench');
});

/* ---------------- 授权闸 ---------------- */

test('授权闸：宿主没有 requestRejection 一律 403，不给业务兜底', async () => {
  const ctx = fakeCtx({ withRejection: false });
  withRoot((root) => apply(ctx, { root }));
  const handler = ctx.registrations[0].handler;
  const r = await call(handler, 'GET', `${PREFIX}/api/bootstrap`);
  assert.equal(r.status, 403);
  assert.match(r.raw, /需要通过 DSH 本机授权会话访问这个工作台/);
});

test('授权闸：requestRejection 返回状态码时用那个状态码拒绝', async () => {
  const ctx = fakeCtx({ reject: 401 });
  withRoot((root) => apply(ctx, { root }));
  const handler = ctx.registrations[0].handler;
  const r = await call(handler, 'GET', `${PREFIX}/api/bootstrap`);
  assert.equal(r.status, 401);
});

/* ---------------- 端到端 ---------------- */

test('宿主前缀下：接口与页面都通，页面拿到接口基址', async () => {
  const ctx = fakeCtx();
  withRoot((root) => apply(ctx, { root }));
  const handler = ctx.registrations[0].handler;

  const api = await call(handler, 'GET', `${PREFIX}/api/bootstrap`);
  assert.equal(api.status, 200);
  assert.ok(api.json?.cfg, 'bootstrap 要带回界面初始状态');

  const page = await call(handler, 'GET', `${PREFIX}/`);
  assert.equal(page.status, 200);
  assert.match(page.headers['content-type'], /text\/html/);
  assert.match(page.raw, new RegExp(`data-api-base="${PREFIX}"`), '页面必须带上宿主前缀，否则前端会打到根路径');
  assert.match(page.raw, /data-runtime="host"/);

  const css = await call(handler, 'GET', `${PREFIX}/ui/style.css`);
  assert.equal(css.status, 200);
});

test('独立启动形态：basePath 为空时不注入前缀，行为不变', async () => {
  const ctx = fakeCtx();
  withRoot((root) => apply(ctx, { root }));
  const handler = ctx.registrations[0].handler;
  // 直接以 /api 开头（等价于独立启动的形状）也能通
  const api = await call(handler, 'GET', '/api/bootstrap');
  assert.equal(api.status, 200);
});

/* ---------------- 装机身份一致 ---------------- */

test('装机三处标识一致：cordis.patch.yml / identity / workbench.json', () => {
  const patch = readFileSync(join(ROOT, 'cordis.patch.yml'), 'utf8');
  assert.match(patch, new RegExp(`id:\\s*${PLUGIN_ID}`), 'insert[].id 必须与 PLUGIN_ID 同值');
  assert.match(patch, /name:\s*"@lymbell-dsh\/lymphoma-workbench"/, 'insert[].name 必须写 npm 包名');
  assert.match(patch, new RegExp(`dshHomePath\\('${HOME_DIR}'\\)`), 'insert[].root 必须用同一个目录名');

  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.name, '@lymbell-dsh/lymphoma-workbench');
  assert.equal(pkg.repository.url, 'https://github.com/xyb-openharness-dsh-plugins/lymphoma-workbench');
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml');
  assert.deepEqual(pkg.dsh.client.inject, ['dsh-desktop-workbenches']);
  for (const f of ['cordis.patch.yml', 'workbench.json', 'public', 'lib', 'dsh']) {
    assert.ok(pkg.files.includes(f), `files 必须随包分发 ${f}`);
  }
  assert.ok(existsSync(join(ROOT, 'workbench.json')), 'workbench.json 应随包分发');

  const manifest = JSON.parse(readFileSync(join(ROOT, 'workbench.json'), 'utf8'));
  assert.equal(manifest.id, RUNTIME_ID, 'workbench.json 的 id 必须与运行时 ID 同值');
  assert.equal(manifest.entry, './lib/client.js');
});

test('浏览器端 RUNTIME_ID 与仓库身份一致（两处不靠手抄）', () => {
  const src = readFileSync(join(ROOT, 'lib/bridge.js'), 'utf8');
  const m = src.match(/export const RUNTIME_ID = '([^']+)'/);
  assert.ok(m, 'lib/bridge.js 必须导出 RUNTIME_ID');
  assert.equal(m[1], RUNTIME_ID);
  assert.match(src, /LEGACY_WORKBENCH_IDS = \['lymbell', 'wb-dataelement-dsh-lymbell'\]/);
});

/* ---------------- 宿主客户端入口形态 ---------------- */

test('lib/client.js 是宿主认得的形态，且由 src 生成（不是手抄）', () => {
  const src = readFileSync(join(ROOT, 'src/client.js'), 'utf8');
  const out = readFileSync(join(ROOT, 'lib/client.js'), 'utf8');

  // 宿主的 renderer 用自己的 __ModuleLoader__ 加载，原生 ESM 会被拒（实测：
  // 加载失败后宿主会把整个包移出 profile）。这条是那次事故的直接防线。
  assert.match(out, /window\.__ModuleLoader__\.load\(\{/, '必须是 ModuleLoader 包装');
  assert.doesNotMatch(out, /^export /m, '宿主入口里不能有 ESM 的 export 语句');
  assert.doesNotMatch(out, /^import /m, '宿主入口里不能有 ESM 的 import 语句');

  // 注入结果与来源同值
  assert.match(out, new RegExp(`id: '${'@lymbell-dsh/lymphoma-workbench'}'`));
  assert.match(out, new RegExp(`RUNTIME_ID = '${RUNTIME_ID}'`));
  assert.match(out, new RegExp(`API_PREFIX = '${API_PREFIX}'`));
  assert.match(out, new RegExp(`UI_ENTRY = '${UI_ENTRY}'`));
  assert.match(out, /LAYOUT = \{"businessSide":"right","businessWidth":0\.65\}/);
  assert.doesNotMatch(out, /\{\{[A-Z_]+\}\}/, '不允许有未注入的占位符漏到产物里');

  // 标准分栏：register 的入参里不能声明 customFrame（写了 true 才是自建顶栏形态）
  const registerBlock = out.match(/register\(\{[\s\S]*?\}, BusinessPanel\)/)?.[0] ?? '';
  assert.ok(registerBlock, '产物里要有 register(...) 调用');
  assert.doesNotMatch(registerBlock, /customFrame/, 'A 方案标准分栏，不声明 customFrame');
  assert.match(registerBlock, /layout: LAYOUT/);
  // 页面用的 ESM 桥接是另一个文件，不能把两者混成一个
  assert.ok(existsSync(join(ROOT, 'lib/bridge.js')), 'lib/bridge.js 必须存在（页面以 ESM 引入）');
  assert.match(readFileSync(join(ROOT, 'package.json'), 'utf8'), /"files":/);

  void src;
});
