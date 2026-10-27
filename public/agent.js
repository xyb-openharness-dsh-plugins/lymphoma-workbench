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
/**
 * 桥接模块也由服务端在接口前缀下提供：路径必须带上接口基址，
 * 否则挂在 DSH 宿主下时会去敲宿主根路径，拿不到文件。
 * 用动态 import 是因为基址只有运行时才知道（服务端注入到 <html data-api-base>）。
 */
const API_BASE = document.documentElement.dataset.apiBase || '';
const { createDesktopBridge, RUNTIME_ID, LEGACY_WORKBENCH_IDS } = await import(`${API_BASE}/bridge.js`);

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
let busy = false; // 正在建立/等待宿主返回时，顶栏文案显示「正在连接」

/**
 * 顶栏「AI 对话」按钮是开合的唯一出口，文案必须实时跟着面板走。
 * 以前这段写在 app.js 的 render() 里，只有整页重渲染才更新 —— 面板开了，按钮还写「未打开」。
 * 现在按钮归本模块管，app.js 不再碰它。
 *
 * 文案按 workspace 合同 §1 分四态：未打开 / 正在连接 / 已连接 / 暂不可用。
 * 本机模式单独写「本机模式」而不是「暂不可用」——本机模式下点开确实会打开面板
 * （面板里如实说没有原生会话），写「暂不可用」会让人以为入口坏了。
 */
function chipState() {
  const host = bridge.available;
  const standalone = (document.documentElement.dataset.runtime || 'standalone') !== 'host';
  if (busy) return { label: '正在连接', dot: true };
  if (standalone) return { label: open ? '本机模式' : '未打开', dot: open };
  if (!host) return { label: '暂不可用', dot: false };
  if (!open) return { label: '未打开', dot: false };
  const owned = bridge.ownsSession(bridge.currentSessionId());
  return owned ? { label: '已连接', dot: true } : { label: '已打开', dot: true };
}

function syncChip() {
  const btn = document.getElementById('ready-session');
  if (!btn) return;
  const s = chipState();
  btn.setAttribute('aria-pressed', open ? 'true' : 'false');
  btn.setAttribute('aria-label', `AI 对话：${s.label}`);
  btn.innerHTML = `<i class="${s.dot ? '' : 'grey'}"></i><span>AI 对话</span><b>${s.label}</b>`;
  const hide = document.getElementById('agent-hide');
  if (hide) hide.hidden = !open;
  syncEntryVisibility();
}

/**
 * 宿主模式（Desktop 内）下，原生会话栏由宿主自己画在业务区右侧（businessSide:'left'）。
 * 页面是跑在 iframe 里的，够不到宿主的会话栏，再开一个自建面板只会在业务区内部
 * 凭空多出一个「开在中间」的对话框。所以宿主模式下把入口收起来，由宿主负责。
 * 本机模式（standalone）保持原样：入口 + 面板都在页面里，如实说没有原生会话。
 */
function syncEntryVisibility() {
  const group = document.querySelector('.agent-toggle-group');
  if (!group) return;
  const inHost = (document.documentElement.dataset.runtime || 'standalone') === 'host';
  const inert = inHost && !bridge.available;
  group.style.display = inert ? 'none' : '';
}

/**
 * 入口兜底：按钮虽然写在 index.html 里，但宿主/浏览器可能还缓存着旧版页面。
 * 只要本模块跑起来，就保证顶栏右上角有一个可点的「AI 对话」入口，不会整块消失。
 */
function ensureEntry() {
  if (document.getElementById('ready-session')) return;
  const actions = document.querySelector('.top-actions');
  if (!actions) return;
  const group = document.createElement('span');
  group.className = 'agent-toggle-group';
  group.innerHTML =
    '<button class="status agent-btn" id="ready-session" type="button" aria-pressed="false"'
    + ' aria-controls="agent-panel" title="打开 / 收起右侧 AI 对话窗口（不结束会话）">'
    + '<i class="grey"></i><span>AI 对话</span><b>未打开</b></button>'
    + '<button class="agent-hide" id="agent-hide" type="button" hidden title="收起对话窗口（会话不结束）">隐藏</button>';
  actions.appendChild(group);
}

function applyOpen(next, { persist = true } = {}) {
  open = Boolean(next);
  const p = panel();
  if (!p) return;
  p.hidden = !open;
  document.body.classList.toggle('agent-open', open);
  requestAnimationFrame(syncOverlayTop);
  if (persist) storage.set(LS_OPEN, open ? '1' : '0');
  renderBody();
}

/* 主工作台必须保住可读性下限；家族基线 620px（低于它就该顶栏换行而不是挤内容） */
const MIN_MAIN = 620;
const MIN_PANE = 320;
const MAX_PANE = 720;

/** 可用宽度 = 视口宽 − 侧边栏（≤900px 时侧栏折叠为顶行，占 0） */
function paneBounds() {
  const sb = document.querySelector('.sidebar');
  const sbVisible = sb && getComputedStyle(sb).display !== 'none';
  const available = Math.max(0, window.innerWidth - (sbVisible ? Math.round(sb.getBoundingClientRect().width) : 0));
  return { available, max: Math.min(MAX_PANE, Math.max(MIN_PANE, available - MIN_MAIN)) };
}

function applyWidth(px) {
  /* 家族基线：右栏默认占工作区 35%，可拖范围以「主区不低于 620px」为准，
     不再简单地按窗口 45% 夹 —— 那样在 1000px 上会把主区压到 300px。 */
  const { max } = paneBounds();
  const w = Math.max(MIN_PANE, Math.min(max, Math.round(px)));
  document.documentElement.style.setProperty('--agent-w', `${w}px`);
  document.getElementById('agent-drag')?.setAttribute('aria-valuenow', String(w));
  storage.set(LS_WIDTH, String(w));
}

/** 浮层态（<1180px）面板从顶栏下沿开始，不能把右上角的 AI 对话 / 隐藏按钮盖住。
 *  顶栏会换行，高度要现量；字体加载完和每次开合都再量一次，不靠启动时的一次结果。 */
function syncOverlayTop() {
  const t = document.querySelector('.topbar');
  if (!t) return;
  const bottom = t.getBoundingClientRect().bottom;
  document.documentElement.style.setProperty('--agent-top', `${Math.round(Math.min(160, Math.max(0, bottom)))}px`);
}
[0, 300, 1200].forEach((d) => setTimeout(syncOverlayTop, d));
document.addEventListener('DOMContentLoaded', syncOverlayTop);
window.addEventListener('load', syncOverlayTop);

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
  syncChip();
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
  busy = true; syncChip();
  let result;
  try {
    result = await bridge.openSession({ projectId, draft: openingDraft(projectId) });
  } finally {
    busy = false;
  }
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
  // 先保入口：旧缓存页面里可能没有这个按钮，缺了就补一个
  ensureEntry();
  syncEntryVisibility();

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

  // 顶栏的独立隐藏控件：面板内部那个 × 不能是唯一的收起入口
  document.addEventListener('click', (e) => {
    if (e.target.closest('#agent-hide')) {
      e.preventDefault();
      applyOpen(false);
    }
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
    const syncAria = () => {
      drag.setAttribute('aria-valuemin', String(MIN_PANE));
      drag.setAttribute('aria-valuemax', String(paneBounds().max));
    };
    syncAria();
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
    // 键盘也能调：←/→ 每次 16px，Home/End 到两端
    drag.addEventListener('keydown', (e) => {
      const cur = Number(storage.get(LS_WIDTH)) || Math.floor(window.innerWidth * 0.35);
      const step = { ArrowLeft: 16, ArrowRight: -16, Home: 1e5, End: -1e5 }[e.key];
      if (step === undefined) return;
      e.preventDefault();
      applyWidth(cur + step);
    });
  }

  // 档案切换事件（app.js 在 pick-profile 后派发）
  document.addEventListener('lymbell:profile', (e) => { bindProfile(e.detail?.id); });

  // 恢复：宽度 → 开合 → 会话的项目绑定
  const savedW = Number(storage.get(LS_WIDTH));
  if (Number.isFinite(savedW) && savedW > 0) applyWidth(savedW);
  else applyWidth(paneBounds().available * 0.35); // 默认占工作区 35%
  // 视口变化后重新夹一遍：换屏/分屏时不让右栏吃掉主区，浮层起点跟着顶栏走
  window.addEventListener('resize', () => {
    applyWidth(Number(storage.get(LS_WIDTH)) || paneBounds().available * 0.35);
    syncOverlayTop();
  });
  syncOverlayTop();
  applyOpen(open, { persist: false });
  bridge.restoreProject().then(({ projectId }) => {
    if (projectId) document.body.dataset.profileId = projectId;
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
else wire();
