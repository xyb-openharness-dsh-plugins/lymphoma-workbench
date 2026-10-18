#!/usr/bin/env node
/**
 * 原型渲染探针（手动运行，不进 `npm run check`）
 *
 * 用途：遍历全部视图 × 三档宽度，检查
 *   1) 有 h1 且文本非空
 *   2) 页面级横向溢出（documentElement.scrollWidth - clientWidth）
 *   3) 运行时 JS 异常
 *
 * 依赖：本机 Chrome（默认 macOS 路径，可用 CHROME_PATH 覆盖）。
 * 用法：node scripts/probe-render.mjs [--negative]
 *   --negative 追加负向对照：注入 2000px 宽元素，验证溢出检测能报出来。
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = pathToFileURL(resolve(ROOT, 'prototypes/v0.1/index.html')).href;
const PORT = 9334;
const CHROME =
  process.env.CHROME_PATH ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const NEGATIVE = process.argv.includes('--negative');

const WIDTHS = [936, 1440, 390];

/** 视图清单：hash + 期望的 h1 文本。新增视图请同步此处。 */
export const VIEWS = [
  ['#dashboard', '看板'],
  ['#diagnosis', '我的分型'],
  ['#diagnosis/病理与分子', '病理与分子'],
  ['#diagnosis/分期与病灶', '分期与病灶'],
  ['#diagnosis/会诊与二次意见', '会诊与二次意见'],
  ['#diagnosis/分型库', '分型库'],
  ['#treatment', '治疗历程'],
  ['#treatment/周期与用药', '周期与用药'],
  ['#treatment/疗效评估', '疗效评估'],
  ['#labs', '血象'],
  ['#labs/生化与免疫', '生化与免疫'],
  ['#labs/感染监测', '感染监测'],
  ['#labs/影像与 PET', '影像与 PET'],
  ['#timeline', '病情一图秀'],
  ['#nutrition', '进食与体重'],
  ['#nutrition/当下困扰', '当下困扰'],
  ['#mind', '当下感受'],
  ['#mind/生育与家庭', '生育与家庭'],
  ['#care', '感染与发热'],
  ['#care/症状与日常', '症状与日常'],
  ['#care/血象与支持治疗', '血象与支持治疗'],
  ['#review', '复诊节奏'],
  ['#review/就诊准备', '就诊准备'],
  ['#review/观察等待', '观察等待'],
  ['#trials', '临床试验'],
  ['#trials/已收藏', '已收藏的线索'],
  ['#trials/入组问题', '入组问题'],
];

if (!existsSync(CHROME)) {
  console.error(`找不到 Chrome：${CHROME}\n可用 CHROME_PATH 指定。`);
  process.exit(1);
}

const chrome = spawn(CHROME, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--disable-software-rasterizer',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=/tmp/lymbell-probe-profile',
  'about:blank',
], { stdio: ['ignore', 'ignore', 'ignore'] });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 取一个 page 类型的 target 的 ws 地址（浏览器级 ws 不支持 Page 域） */
async function wsUrl() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await r.json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      /* 端口还没起来 */
    }
    await sleep(250);
  }
  throw new Error('Chrome 调试端口未就绪');
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.waiters = new Map();
    this.errors = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.waiters.has(msg.id)) {
        const { resolve: ok, reject: bad } = this.waiters.get(msg.id);
        this.waiters.delete(msg.id);
        if (msg.error) bad(new Error(msg.error.message));
        else ok(msg.result);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        this.errors.push(msg.params.exceptionDetails.text || 'exception');
      } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        this.errors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
      }
    });
  }

  send(method, params = {}) {
    this.id += 1;
    const id = this.id;
    return new Promise((ok, bad) => {
      this.waiters.set(id, { resolve: ok, reject: bad });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

const out = [];
let failures = 0;

async function main() {
  const sock = new WebSocket(await wsUrl());
  await new Promise((ok, bad) => {
    sock.addEventListener('open', ok, { once: true });
    sock.addEventListener('error', bad, { once: true });
  });
  const cdp = new CDP(sock);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  for (const width of WIDTHS) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width, height: width === 390 ? 844 : 900, deviceScaleFactor: 1, mobile: width === 390,
    });

    for (const [hash, expect] of VIEWS) {
      cdp.errors.length = 0;
      await cdp.send('Page.navigate', { url: ENTRY });
      await sleep(120);
      await cdp.send('Runtime.evaluate', {
        expression: `location.hash=${JSON.stringify(hash)};`, awaitPromise: false,
      });
      await sleep(160);

      const r = await cdp.send('Runtime.evaluate', {
        expression: `(() => {
          const m = document.querySelector('main');
          const h1 = document.querySelector('h1');
          return {
            h1: h1 ? h1.textContent.trim() : '',
            len: m ? m.innerText.trim().length : 0,
            delta: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          };
        })()`,
        returnByValue: true,
      });
      const v = r.result.value;
      const bad = [];
      if (!v.h1) bad.push('缺 h1');
      else if (expect && !v.h1.includes(expect)) bad.push(`h1 不符（期望含「${expect}」）`);
      if (v.len < 40) bad.push(`内容过短 ${v.len}`);
      if (v.delta > 1) bad.push(`横向溢出 ${v.delta}px`);
      if (cdp.errors.length) bad.push(`JS 异常：${cdp.errors[0]}`);

      if (bad.length) failures += 1;
      out.push({ width, hash, h1: v.h1, delta: v.delta, len: v.len, bad });
    }
  }

  if (NEGATIVE) {
    // 负向对照：注入 2000px 元素，确认溢出检测不是恒为 0
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 936, height: 900, deviceScaleFactor: 1, mobile: false,
    });
    await cdp.send('Page.navigate', { url: ENTRY });
    await sleep(200);
    const r = await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const d = document.createElement('div');
        d.style.cssText = 'width:2000px;height:8px';
        document.body.appendChild(d);
        return document.documentElement.scrollWidth - document.documentElement.clientWidth;
      })()`,
      returnByValue: true,
    });
    console.log(`负向对照（注入 2000px）：溢出 ${r.result.value}px ${r.result.value > 1 ? '✓ 检出' : '✗ 未检出'}`);
    if (r.result.value <= 1) failures += 1;
  }

  // 汇总
  const total = out.length;
  console.log(`视图 ${VIEWS.length} × 宽度 ${WIDTHS.length} = ${total} 次渲染`);
  for (const w of WIDTHS) {
    const rows = out.filter((o) => o.width === w);
    const bad = rows.filter((o) => o.bad.length);
    console.log(`  ${String(w).padStart(4)}px：${rows.length - bad.length}/${rows.length} 通过` +
      (bad.length ? ` —— 失败：${bad.map((b) => `${b.hash}(${b.bad.join('；')})`).join(' | ')}` : ''));
  }
  const worst = out.reduce((a, b) => (b.delta > a.delta ? b : a), out[0]);
  console.log(`  最大横向溢出：${worst.delta}px（${worst.hash} @ ${worst.width}px）`);
  console.log(failures ? `✗ 共 ${failures} 项失败` : '✓ 全部通过');

  sock.close();
  chrome.kill();
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  chrome.kill();
  process.exit(1);
});
