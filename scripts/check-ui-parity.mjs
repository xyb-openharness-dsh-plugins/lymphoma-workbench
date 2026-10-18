#!/usr/bin/env node
/**
 * UI 一致性检查（原型 ↔ 真实界面）。
 *
 * 为什么要有它：界面是从原型派生的，改一次就可能"顺手优化"掉原型定下来的文案与结构。
 * 本脚本在同一台无头 Chrome 里逐视图渲染两边，比对 `#main` 里的
 *   1) 结构签名序列（标签 + 类名 + display + 字号）→ 主指标
 *   2) 可见文本行序列 → 参考指标（数据源变了会掉，属预期，单独列出）
 * 并顺手记录 JS 异常与页面级横向溢出。
 *
 * 判定：结构一致率 ≥ 98%（THRESHOLD）。文本差异逐视图打印，由人判断是不是"数据变了"。
 *
 * 用法：node scripts/check-ui-parity.mjs [--json out.json] [--threshold 0.98]
 * 依赖：本机 Chrome（CHROME_PATH 覆盖）。
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createWorkbenchServer } from '../dsh/server.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROTOTYPE = pathToFileURL(resolve(ROOT, 'prototypes/v0.1/index.html')).href;
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = 9335;
const APP_PORT = 8789;

const args = process.argv.slice(2);
const THRESHOLD = Number(process.argv.find((a) => a.startsWith('--threshold='))?.split('=')[1] ?? 0.98);
const WIDTHS = (process.argv.find((a) => a.startsWith('--widths='))?.split('=')[1] ?? '1440')
  .split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
const jsonIdx = args.indexOf('--json');
const jsonOut = jsonIdx >= 0 ? resolve(ROOT, args[jsonIdx + 1]) : null;

/** 视图清单：hash + 期望 h1。与 scripts/probe-render.mjs 保持一致。 */
const VIEWS = [
  ['#dashboard', '看板'], ['#diagnosis', '我的分型'], ['#diagnosis/病理与分子', '病理与分子'],
  ['#diagnosis/分期与病灶', '分期与病灶'], ['#diagnosis/会诊与二次意见', '会诊与二次意见'],
  ['#diagnosis/分型库', '分型库'], ['#treatment', '治疗历程'], ['#treatment/周期与用药', '周期与用药'],
  ['#treatment/疗效评估', '疗效评估'], ['#labs', '血象'], ['#labs/生化与免疫', '生化与免疫'],
  ['#labs/感染监测', '感染监测'], ['#labs/影像与 PET', '影像与 PET'], ['#timeline', '病情一图秀'],
  ['#nutrition', '进食与体重'], ['#nutrition/当下困扰', '当下困扰'], ['#mind', '当下感受'],
  ['#mind/生育与家庭', '生育与家庭'], ['#care', '感染与发热'], ['#care/症状与日常', '症状与日常'],
  ['#care/血象与支持治疗', '血象与支持治疗'], ['#review', '复诊节奏'], ['#review/就诊准备', '就诊准备'],
  ['#review/观察等待', '观察等待'], ['#trials', '临床试验'], ['#trials/已收藏', '已收藏的线索'],
  ['#trials/入组问题', '入组问题'],
];

if (!existsSync(CHROME)) {
  console.error(`找不到 Chrome：${CHROME}\n可用 CHROME_PATH 指定。`);
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const EXTRACT = `(() => {
  const main = document.querySelector('#main');
  const h1 = document.querySelector('h1');
  if (!main) return { nodes: [], text: [], h1: '', delta: 0 };
  const nodes = [];
  const walk = (el) => {
    const cs = getComputedStyle(el);
    const cls = Array.from(el.classList).sort().join('.');
    nodes.push(el.tagName.toLowerCase() + (cls ? '.' + cls : '') + '|' + cs.display + '|' + Math.round(parseFloat(cs.fontSize) || 0));
    for (const c of el.children) walk(c);
  };
  walk(main);
  return {
    nodes,
    text: main.innerText.split('\\n').map((s) => s.trim()).filter(Boolean),
    h1: h1 ? h1.textContent.trim() : '',
    delta: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
})()`;

function lcs(a, b) {
  const n = a.length, m = b.length;
  if (!n || !m) return 0;
  const prev = new Array(m + 1).fill(0);
  const cur = new Array(m + 1).fill(0);
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    }
    for (let j = 0; j <= m; j += 1) prev[j] = cur[j];
  }
  return prev[m];
}
const sim = (a, b) => (a.length + b.length === 0 ? 1 : (2 * lcs(a, b)) / (a.length + b.length));

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.waiters = new Map(); this.errors = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.waiters.has(msg.id)) {
        const { resolve: ok, reject: bad } = this.waiters.get(msg.id);
        this.waiters.delete(msg.id);
        if (msg.error) bad(new Error(msg.error.message)); else ok(msg.result);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        const where = d.stackTrace?.callFrames?.[0]
          ? `${d.stackTrace.callFrames[0].url}:${d.stackTrace.callFrames[0].lineNumber + 1}`
          : d.url ?? '';
        this.errors.push([d.exception?.description || d.text || 'exception', where].filter(Boolean).join(' @ '));
      } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        this.errors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
      }
    });
  }
  send(method, params = {}) {
    this.id += 1; const id = this.id;
    return new Promise((ok, bad) => {
      this.waiters.set(id, { resolve: ok, reject: bad });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

async function wsUrl(port) {
  for (let i = 0; i < 60; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* 还没起来 */ }
    await sleep(250);
  }
  throw new Error('Chrome 调试端口未就绪');
}

async function main() {
  const app = createWorkbenchServer({ dbPath: resolve(ROOT, 'workspace/lymbell.sqlite') });
  const http = await app.listen(APP_PORT);
  const APP_URL = `http://127.0.0.1:${APP_PORT}/`;

  const chrome = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--disable-software-rasterizer', `--remote-debugging-port=${CDP_PORT}`,
    '--user-data-dir=/tmp/lymbell-parity-profile', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore'] });

  const sock = new WebSocket(await wsUrl(CDP_PORT));
  await new Promise((ok, bad) => {
    sock.addEventListener('open', ok, { once: true });
    sock.addEventListener('error', bad, { once: true });
  });
  const cdp = new CDP(sock);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  async function grab(url, hash) {
    await cdp.send('Page.navigate', { url });
    await sleep(220);
    await cdp.send('Runtime.evaluate', { expression: `location.hash=${JSON.stringify(hash)};`, awaitPromise: false });
    await sleep(260);
    const r = await cdp.send('Runtime.evaluate', { expression: EXTRACT, returnByValue: true });
    return r.result.value;
  }

  const rows = [];
  for (const width of WIDTHS) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width, height: width === 390 ? 844 : 900, deviceScaleFactor: 1, mobile: width === 390,
    });
    for (const [hash, expect] of VIEWS) {
      cdp.errors.length = 0;
      const a = await grab(PROTOTYPE, hash);
      const errA = [...cdp.errors];
      cdp.errors.length = 0;
      const b = await grab(APP_URL, hash);
      const errB = [...cdp.errors];
      rows.push({
        width, hash, expect,
        h1A: a.h1, h1B: b.h1,
        struct: sim(a.nodes, b.nodes),
        text: sim(a.text, b.text),
        nodesA: a.nodes.length, nodesB: b.nodes.length,
        deltaA: a.delta, deltaB: b.delta,
        errA, errB,
        textDiff: diffLines(a.text, b.text),
      });
    }
  }

  sock.close();
  chrome.kill();
  http.close();
  app.close();

  const avgStruct = rows.reduce((s, r) => s + r.struct, 0) / rows.length;
  const avgText = rows.reduce((s, r) => s + r.text, 0) / rows.length;
  const worst = rows.reduce((a, b) => (b.struct < a.struct ? b : a), rows[0]);
  const errors = rows.filter((r) => r.errA.length || r.errB.length);
  const overflow = rows.filter((r) => r.deltaB > 1);

  console.log(`渲染 ${rows.length} 次（${VIEWS.length} 视图 × ${WIDTHS.length} 档宽度）`);
  for (const w of WIDTHS) {
    const rs = rows.filter((r) => r.width === w);
    const s = rs.reduce((x, r) => x + r.struct, 0) / rs.length;
    const worstW = rs.reduce((a, b) => (b.struct < a.struct ? b : a), rs[0]);
    const over = rs.filter((r) => r.deltaB > 1);
    console.log(`  ${String(w).padStart(4)}px：结构 ${(s * 100).toFixed(2)}% · 最低 ${(worstW.struct * 100).toFixed(1)}%（${worstW.hash}）` +
      (over.length ? ` · 界面溢出 ${over.map((r) => `${r.hash}(${r.deltaB}px)`).join(' ')}` : ' · 无溢出'));
  }
  console.log(`结构一致率均值 ${(avgStruct * 100).toFixed(2)}% · 文本一致率均值 ${(avgText * 100).toFixed(2)}%`);
  const shown = new Set();
  for (const r of rows.filter((r) => r.struct < 0.999)) {
    const key = `${r.hash}`;
    if (shown.has(key)) continue;
    shown.add(key);
    console.log(`  ${r.hash.padEnd(26)} 结构 ${(r.struct * 100).toFixed(1)}% · 文本 ${(r.text * 100).toFixed(1)}% · 节点 ${r.nodesA}→${r.nodesB}`);
    if (r.textDiff.onlyApp.length) console.log(`      界面新增文本：${r.textDiff.onlyApp.slice(0, 3).join(' / ')}`);
    if (r.textDiff.onlyPrototype.length) console.log(`      原型独有文本：${r.textDiff.onlyPrototype.slice(0, 3).join(' / ')}`);
  }
  if (errors.length) {
    console.log('JS 异常：');
    for (const r of errors) console.log(`  ${r.hash} 原型[${r.errA.join('|')}] 界面[${r.errB.join('|')}]`);
  }
  if (overflow.length) console.log(`界面横向溢出 ${overflow.length} 处：${overflow.map((r) => `${r.hash}(${r.deltaB}px)`).join(' ')}`);

  const pass = avgStruct >= THRESHOLD && !errors.length && !overflow.length;
  console.log(pass ? `✓ UI 一致性通过（门槛 ${(THRESHOLD * 100).toFixed(0)}%）` : `✗ 未达门槛 ${(THRESHOLD * 100).toFixed(0)}%`);

  if (jsonOut) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(jsonOut, JSON.stringify({ threshold: THRESHOLD, avgStruct, avgText, rows }, null, 2));
    console.log(`明细已写入 ${jsonOut}`);
  }
  process.exit(pass ? 0 : 1);
}

function diffLines(a, b) {
  const setB = new Set(b);
  const setA = new Set(a);
  return {
    onlyPrototype: a.filter((x) => !setB.has(x)).slice(0, 6),
    onlyApp: b.filter((x) => !setA.has(x)).slice(0, 6),
  };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
