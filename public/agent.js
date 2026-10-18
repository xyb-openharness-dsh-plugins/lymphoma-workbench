/**
 * 原生 Agent 会话面板（Desktop 工作台适配 1.2.2 · 前端壳）。
 *
 * 行为契约：
 * - 顶栏「对话」按钮即调起按钮：随需打开/关闭右侧会话窗口（capture 阶段拦截，不与业务快捷键冲突）；
 * - 业务区默认占 65%，会话窗口占其余；左边缘分隔条可拖拽调整宽度（300px–半屏）；
 * - 面板不覆盖侧边栏、设置、模式切换和公共导航；
 * - 在 Desktop 宿主内：会话由 Desktop 建立与管理（register / isActive / ownsSession），
 *   开场白只追加到原生草稿、不自动发送；不在宿主内：如实显示 standalone 空态，不伪造一个 AI。
 * - 会话 ↔ 档案绑定：有会话写数据根 .desktop-session-projects.json（经 server API），
 *   无会话时最近选择退 localStorage；重启后恢复。
 */
import { createDesktopBridge, RUNTIME_ID, LEGACY_WORKBENCH_IDS } from '/desktop-bridge.js';

const LS_OPEN = 'lymbell.agent.open';
const LS_WIDTH = 'lymbell.agent.width';
const LS_RECENT = 'lymbell.agent.recentProject';

const storage = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* 隐私模式等场景，忽略 */ } },
};

const bridge = createDesktopBridge({
  host: globalThis,
  storage: { getItem: (k) => storage.get(k), setItem: (k, v) => storage.set(k, v) },
});

const panel = () => document.getElementById('agent-panel');
const body = () => document.getElementById('agent-body');
const stateEl = () => document.getElementById('agent-state');

let open = storage.get(LS_OPEN) === '1';

function applyOpen(next, { persist = true } = {}) {
  open = Boolean(next);
  const p = panel();
  if (!p) return;
  p.hidden = !open;
  document.body.classList.toggle('agent-open', open);
  const btn = document.getElementById('ready-session');
  if (btn) btn.setAttribute('aria-pressed', open ? 'true' : 'false');
  if (persist) storage.set(LS_OPEN, open ? '1' : '0');
  renderBody();
}

function applyWidth(px) {
  const max = Math.min(720, Math.floor(window.innerWidth * 0.5));
  const w = Math.max(300, Math.min(max, Math.round(px)));
  document.documentElement.style.setProperty('--agent-w', `${w}px`);
  storage.set(LS_WIDTH, String(w));
}

function renderBody() {
  const el = body();
  if (!el) return;
  const host = bridge.available;
  if (host) {
    const owned = bridge.ownsSession(bridge.currentSessionId());
    el.innerHTML = `
      <div class="agent-status ${owned ? 'ok' : ''}">
        ${owned
          ? '原生会话已挂载（由 Desktop 管理会话、模式与工具）'
          : '已连接 Desktop；此工作台当前没有归属于自己的会话。新建或打开档案项目时会请求 Desktop 建立会话。'}
      </div>
      <div class="agent-mount" id="agent-mount"></div>`;
    if (owned && globalThis.desktopWorkbenches?.mountSessionPanel) {
      try {
        globalThis.desktopWorkbenches.mountSessionPanel({
          runtimeId: RUNTIME_ID,
          sessionId: bridge.currentSessionId(),
          container: document.getElementById('agent-mount'),
        });
        return;
      } catch { /* 挂载失败落到下面的空态，不假装成功 */ }
    }
    if (!owned) {
      el.insertAdjacentHTML('beforeend', `
        <div class="agent-empty">
          <p>会话窗口由 Desktop 管理。在没有会话时，你仍然可以浏览和编辑全部业务资料。</p>
          <button class="soft" id="agent-new-session">为新档案建立会话</button>
        </div>`);
      document.getElementById('agent-new-session')?.addEventListener('click', () => newSession());
    }
  } else {
    el.innerHTML = `
      <div class="agent-status">本机模式（未在 DSH Desktop 宿主内）</div>
      <div class="agent-empty">
        <p>原生 Agent 会话由 Desktop 建立和管理：模式、模型、工具与权限都遵循原生会话。
           当前页面是本机运行，这里不伪造一个对话。</p>
        <p>运行时 ID：<code>${RUNTIME_ID}</code><br>旧安装迁移标识：<code>${LEGACY_WORKBENCH_IDS.join(', ')}</code></p>
        <p class="agent-hint">在 Desktop 安装提供方插件后，本窗口会自动挂载原生会话；
           开场白只会填进草稿，由你确认后再发送。</p>
      </div>`;
  }
  const s = stateEl();
  if (s) s.textContent = host ? 'Desktop 已连接' : '本机模式';
}

/** 开场白：只填草稿，不自动发送（宿主契约 autoSend:false）。 */
function openingDraft(pid) {
  const name = document.getElementById('profile-name')?.textContent?.trim() ?? '当前档案';
  const stage = document.querySelector('#main .status-line, #main .phase')?.textContent?.trim() ?? '';
  return [
    `我在小铃铛工作台整理${name.replace('的资料', '')}的淋巴瘤资料。`,
    stage ? `当前阶段：${stage}。` : '',
    '请先了解我的分型与治疗线情况，回答时只提供信息，不做诊断与用药建议。',
  ].filter(Boolean).join('\n');
}

async function newSession() {
  const projectId = document.body.dataset.profileId ?? null;
  const result = await bridge.openSession({ projectId, draft: openingDraft(projectId) });
  if (!result.ok) {
    renderBody();
    toastAgent(result.reason === 'not_in_desktop' ? '本机模式没有原生会话；接入 Desktop 后可用' : `会话未建立：${result.reason}`);
    return;
  }
  await bridge.rememberProject(projectId);
  renderBody();
  toastAgent('会话已建立，开场白已填入草稿（未发送，由你确认）');
}

/** 档案切换 → 会话记住自己的项目选择（会话级绑定，不抢占其他会话）。 */
async function bindProfile(profileId) {
  document.body.dataset.profileId = profileId ?? '';
  await bridge.rememberProject(profileId ?? null);
}

function toastAgent(text) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastAgent._timer);
  toastAgent._timer = setTimeout(() => t.classList.remove('show'), 2600);
}

function wire() {
  bridge.register({
    onSessionChange: () => renderBody(),
  });

  // 调起按钮：capture 阶段拦截顶栏「对话」按钮，不让它落进业务动作表
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('#ready-session');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    applyOpen(!open);
  }, true);

  // 关闭按钮（面板头）
  document.addEventListener('click', (e) => {
    if (e.target.closest('#agent-close')) {
      e.preventDefault();
      applyOpen(false);
    }
  });

  // 分隔条拖拽：左边缘即手柄
  const drag = document.getElementById('agent-drag');
  if (drag) {
    drag.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      drag.setPointerCapture(e.pointerId);
      drag.classList.add('dragging');
      const move = (ev) => applyWidth(window.innerWidth - ev.clientX);
      const up = () => {
        drag.classList.remove('dragging');
        drag.removeEventListener('pointermove', move);
        drag.removeEventListener('pointerup', up);
      };
      drag.addEventListener('pointermove', move);
      drag.addEventListener('pointerup', up);
    });
  }

  // 档案切换事件（app.js 在 pick-profile 后派发）
  document.addEventListener('lymbell:profile', (e) => { bindProfile(e.detail?.id); });

  // 恢复：宽度 → 开合 → 会话的项目绑定
  const savedW = Number(storage.get(LS_WIDTH));
  if (Number.isFinite(savedW) && savedW > 0) applyWidth(savedW);
  else applyWidth(Math.floor(window.innerWidth * 0.35)); // 业务区默认 65%
  applyOpen(open, { persist: false });
  bridge.restoreProject().then(({ projectId }) => {
    if (projectId) document.body.dataset.profileId = projectId;
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
else wire();
