#!/usr/bin/env node
/**
 * 「开启云端解析」确认弹窗的交互冒烟（手动运行，不进 `npm run check`）。
 *
 * 用法：先起服务（npm start -- --port 8791），再 node scripts/probe-consent.mjs
 *   验证 9 项：设置 tab 可达 → 勾选弹窗且勾选框回退 → 三条提醒齐 →
 *   「暂不开启」回设置且未勾选（服务器 consent=false）→ 再勾选 → 确认 → 生效（服务器 true）。
 * 依赖本机 Chrome；沙箱环境需 --no-sandbox --disable-gpu（脚本已带）。
 * 注意：复位请求必须在页面导航前发出——页面从 bootstrap 读 consent，导航后再改只改了服务器。
 */
const BASE = 'http://127.0.0.1:8791'
const PORT = 9335
const { spawn } = await import('node:child_process')
const { mkdtempSync, rmSync } = await import('node:fs')
const { tmpdir } = await import('node:os')
const { join } = await import('node:path')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const profileDir = mkdtempSync(join(tmpdir(), 'xyb-cdp-'))
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', `--user-data-dir=${profileDir}`,
  `--remote-debugging-port=${PORT}`, '--window-size=1280,900', 'about:blank',
], { stdio: 'ignore' })
process.on('exit', () => { try { chrome.kill(); rmSync(profileDir, { recursive: true, force: true }) } catch {} })

let wsUrl = null
for (let i = 0; i < 60 && !wsUrl; i += 1) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
    wsUrl = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)?.webSocketDebuggerUrl
  } catch {}
  if (!wsUrl) await sleep(250)
}
if (!wsUrl) { console.error('FAIL: chrome 调试端口未就绪'); process.exit(1) }

const sock = new WebSocket(wsUrl)
await new Promise((ok, bad) => { sock.addEventListener('open', ok, { once: true }); sock.addEventListener('error', bad, { once: true }) })
let seq = 0
const send = (method, params = {}) => new Promise((ok, bad) => {
  const id = ++seq
  const onMsg = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id === id) { sock.removeEventListener('message', onMsg); m.error ? bad(new Error(m.error.message)) : ok(m.result) }
  }
  sock.addEventListener('message', onMsg)
  sock.send(JSON.stringify({ id, method, params }))
})
const evalJs = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result.value

await send('Page.enable')
await send('Runtime.enable')

// 0. 复位状态（必须在页面加载前：页面从 bootstrap 读 consent）
const resetRes = await fetch(BASE + '/api/workspace', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ consent: false }) })
if (!resetRes.ok) { console.error('FAIL: 复位请求失败', resetRes.status); process.exit(1) }

await send('Page.navigate', { url: BASE + '/' })
await sleep(600)

const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`) }

// 1. 打开设置 → 文档解析 tab
await evalJs(`document.querySelector('[data-action="settings"]')?.click()`)
await sleep(150)
await evalJs(`document.querySelector('[data-action="cfg-tab"][data-tab="parse"]')?.click()`)
await sleep(100)
check('设置 → 文档解析 tab 可达', await evalJs(`!document.querySelector('.cfg-block[data-tab="parse"]').hidden`))

// 2. 勾选 consent → 弹确认窗（checkbox 先回退）——点击与读取合并为一次执行，排除时序
const diag1 = await evalJs(`(() => {
  const el = document.querySelector('[data-action="consent"]');
  const before = el.checked;
  el.click();
  return {
    before,
    after: el.checked,
    elStillInDom: !!document.querySelector('[data-action="consent"]'),
    title: document.getElementById('dialog-title').textContent,
  };
})()`)
console.log('diag1:', JSON.stringify(diag1))
const title = diag1.title
check('勾选后弹出确认窗', title.includes('三件事'), title)
check('弹窗含三条提醒', await evalJs(`document.getElementById('dialog-body').textContent.includes('数据会上传') && document.getElementById('dialog-body').textContent.includes('个人信息') && document.getElementById('dialog-body').textContent.includes('自动脱敏')`))
check('确认窗已替换设置页内容（勾选未直接生效）', await evalJs(`!document.querySelector('[data-action="consent"]')`))

// 3. 暂不开启 → 回设置页，consent 仍 false
await evalJs(`document.querySelector('[data-action="consent-cancel"]')?.click()`)
await sleep(150)
check('「暂不开启」回到设置页', await evalJs(`document.getElementById('dialog-title').textContent === '设置'`))
check('回到设置页后勾选框仍未勾选', await evalJs(`!document.querySelector('[data-action="consent"]').checked`))
const consentAfterCancel = await (await fetch(BASE + '/api/bootstrap')).json()
check('服务器 consent 仍为 false', consentAfterCancel.cfg?.consent === false || consentAfterCancel.consent === false,
  JSON.stringify(consentAfterCancel.cfg?.consent ?? consentAfterCancel.consent))

// 4. 再勾选 → 确认 → 生效
await evalJs(`document.querySelector('[data-action="consent"]').click()`)
await sleep(150)
await evalJs(`document.querySelector('[data-action="consent-confirm"]')?.click()`)
await sleep(400)
check('确认后设置页勾选生效', await evalJs(`document.querySelector('[data-action="consent"]').checked`))
const consentAfter = await (await fetch(BASE + '/api/bootstrap')).json()
check('服务器 consent = true', consentAfter.cfg?.consent === true || consentAfter.consent === true,
  JSON.stringify(consentAfter.cfg?.consent ?? consentAfter.consent))

const fails = results.filter((r) => !r.ok).length
console.log(fails === 0 ? 'ALL PASS' : `FAIL x${fails}`)
process.exit(fails === 0 ? 0 : 1)
