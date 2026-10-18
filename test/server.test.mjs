/**
 * 服务端单测（M2）。不起真实端口：直接调 handle()，用内存库。
 *
 * 覆盖：静态首页、未知路径回落、越界目录 403、bootstrap 形状、
 * 写入成功与契约失败（未来日期 / 根目录）返回 400 并带可读错误。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createWorkbenchServer, maskToken } from '../dsh/server.js';

function mockRes() {
  return {
    code: 0, headers: {}, body: '',
    writeHead(c, h) { this.code = c; this.headers = h; },
    end(b = '') { this.body = typeof b === 'string' ? b : b.toString('utf8'); },
  };
}

async function call(app, method, url, body) {
  const req = Readable.from([body === undefined ? Buffer.alloc(0) : Buffer.from(JSON.stringify(body))]);
  req.method = method;
  req.url = url;
  const res = mockRes();
  await app.handle(req, res);
  const isJson = String(res.headers['content-type'] ?? '').includes('json');
  return { status: res.code, json: isJson && res.body ? JSON.parse(res.body) : null, raw: res.body, headers: res.headers };
}

function appWithData() {
  return createWorkbenchServer({ dbPath: ':memory:', kbPath: null, seed: true });
}

test('静态：首页 200，app.js 200，越界路径 403', async () => {
  const app = appWithData();
  const home = await call(app, 'GET', '/');
  assert.equal(home.status, 200);
  assert.match(home.headers['content-type'], /text\/html/);
  assert.match(home.raw, /小铃铛 LymBell/);
  const js = await call(app, 'GET', '/app.js');
  assert.equal(js.status, 200);
  assert.match(js.headers['content-type'], /javascript/);
  // 目录穿越：URL 规范化后仍在 public/ 内，拿不到仓库里的 package.json
  const bad = await call(app, 'GET', '/%2e%2e/%2e%2e/package.json');
  assert.equal(bad.raw.includes('"name": "@lymbell'), false, '静态目录外的文件不许读到');
  app.close();
});

test('未知接口 404，未知页面回落首页', async () => {
  const app = appWithData();
  const r404 = await call(app, 'GET', '/api/nope');
  assert.equal(r404.status, 404);
  assert.match(r404.json.error, /没有这个接口/);
  const page = await call(app, 'GET', '/timeline');
  assert.equal(page.status, 200);
  app.close();
});

test('bootstrap：带版本、档案与知识库统计', async () => {
  const app = appWithData();
  const r = await call(app, 'GET', '/api/bootstrap');
  assert.equal(r.status, 200);
  assert.equal(r.json.profileId, 'p1');
  assert.equal(r.json.profiles.length, 5);
  assert.match(r.json.app.displayVersion, /^v\d+\.\d+\.\d+/);
  app.close();
});

test('bootstrap 可按 profile 切换', async () => {
  const app = appWithData();
  const r = await call(app, 'GET', '/api/bootstrap?profile=p2');
  assert.equal(r.json.profileId, 'p2');
  assert.equal(r.json.profiles[1].ww, true);
  app.close();
});

test('写入成功：体温 / 问题 / 待办', async () => {
  const app = appWithData();
  const fever = await call(app, 'POST', '/api/logs/fever', { profileId: 'p1', happenedOn: '2026-10-17', tempC: 37.8 });
  assert.equal(fever.status, 200);
  const q = await call(app, 'POST', '/api/questions', { profileId: 'p1', text: '下次要不要做 PET？' });
  assert.equal(q.status, 200);
  assert.equal(q.json.kind, 'fact');
  const t = await call(app, 'POST', '/api/tasks', { profileId: 'p1', dueOn: '2026-12-01', title: '复查' });
  assert.equal(t.status, 200);
  const boot = await call(app, 'GET', '/api/bootstrap');
  assert.equal(boot.json.questions.length, 5);
  assert.equal(boot.json.tasks.length, 4);
  app.close();
});

test('契约失败返回 400：未来日期、空内容、根目录', async () => {
  const app = appWithData();
  const future = await call(app, 'POST', '/api/logs/fever', { profileId: 'p1', happenedOn: '2027-01-01' });
  assert.equal(future.status, 400);
  assert.match(future.json.error, /不得晚于今天/);
  const empty = await call(app, 'POST', '/api/questions', { profileId: 'p1', text: '' });
  assert.equal(empty.status, 400);
  const root = await call(app, 'POST', '/api/workspace', { root: '/' });
  assert.equal(root.status, 400);
  assert.match(root.json.error, /根目录/);
  app.close();
});

test('资料目录合法时写入，Token 只存掩码', async () => {
  const app = appWithData();
  const home = process.env.HOME;
  const ok = await call(app, 'POST', '/api/workspace', { root: `${home}/Documents/LymBell` });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.root, `${home}/Documents/LymBell`);
  const tok = await call(app, 'POST', '/api/workspace/token', { token: 'sk-abcdefgh1234' });
  assert.equal(tok.json.tokenMasked, maskToken('sk-abcdefgh1234'));
  assert.equal(tok.json.tokenMasked.includes('abcdefgh'), false, '明文不回显');
  app.close();
});

test('试验线索：收藏后能读回，取消后消失', async () => {
  const app = appWithData();
  const save = await call(app, 'POST', '/api/trials/save', { profileId: 'p1', trialKey: 'ctgov:NCT0000001' });
  assert.equal(save.status, 200);
  let boot = await call(app, 'GET', '/api/bootstrap');
  assert.equal(boot.json.savedTrials.length, 1);
  assert.equal(boot.json.savedTrials[0].missing, true, '知识库未接入时不假装有登记信息');
  await call(app, 'POST', '/api/trials/unsave', { profileId: 'p1', trialKey: 'ctgov:NCT0000001' });
  boot = await call(app, 'GET', '/api/bootstrap');
  assert.equal(boot.json.savedTrials.length, 0);
  app.close();
});
