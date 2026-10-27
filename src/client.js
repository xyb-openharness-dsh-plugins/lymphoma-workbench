/* 宿主客户端入口源码（customFrame 形态）。
 *
 * **不要直接改 lib/client.js**：那是 `npm run build:client` 从本文件生成的产物。
 * 官方要求客户端必须是「已构建好的单文件」（Desktop 不会替我们打包，workbench-standard §3.5），
 * 而且宿主的 renderer 用自己的 `window.__ModuleLoader__` 加载 —— **它不认原生 ESM**，
 * 直接把 ESM 入口给它会得到 `Unexpected token 'export'`，宿主还会因此把整个包移出 profile。
 *
 * ## 面板形态：customFrame（2026-10-27）
 *
 * 标准分栏（customFrame=false）下宿主自己画分栏，工作台里**没有地方能放「AI 对话」入口**：
 * 页面跑在 iframe 里够不到宿主会话栏，顶栏那个按钮只能显示「暂不可用」；分栏方向还靠
 * businessSide 猜（此前写成 right，整条分栏镜像，业务区被推到右边）。会话栏也不可拖、不可收。
 *
 * 改成 customFrame 后宿主把**原生会话节点**作为 `conversation` prop 交给我们排版：
 * - 顶栏右上角有常驻「AI 对话 / 收起 AI 对话」按钮（不再藏在面板内部，也不依赖页面 iframe）；
 * - 中间 splitter 可鼠标拖、可键盘调（←/→ 步进 2%，Home/End 到边界），区间 25%–45%；
 * - 收起只是隐藏，不结束、不删除会话，再点回到同一会话；
 * - 宽度与开合状态存 localStorage，重开恢复；
 * - 容器窄于 760px 改覆盖式抽屉，业务区不让位。
 *
 * 三条硬约束（官方 §4 / §6）：
 * 1. 根节点首个子元素必须是语义 `<header>`，并用 `--dsh-frame-leading-clearance` 避让窗口按钮；
 * 2. 原生会话**始终挂载**，只用 display 控制显隐 —— 卸载会丢掉输入框与草稿；
 * 3. 无会话时业务面板照常可用，依赖会话的操作在按钮处引导，不阻断业务。
 *
 * 业务 UI 仍是 `public/` 的原生单页，整页交给 iframe；接口基址由服务端注入，页面不判断自己跑在哪。
 *
 * 会话集成：`desktopWorkbenches.ensureSession({ folder })` 调起原生会话；开场白经
 * `sessions.scope(id).get('conversation').input` 填进**原生草稿**，不自动发送；
 * 拿不到宿主服务一律降级提示，不猜第二个入口。
 */

/* eslint-disable no-undef */
window.__ModuleLoader__.load({
  id: '{{PKG_NAME}}',
  factory: (require) => {
    const React = require('react');
    const h = React.createElement;

    /* ---- 下面这些由 scripts/build-client.mjs 注入，来源各只有一份 ---- */
    const RUNTIME_ID = '{{RUNTIME_ID}}';
    const LEGACY_WORKBENCH_IDS = {{LEGACY_IDS}};
    const API_PREFIX = '{{API_PREFIX}}';
    const UI_ENTRY = '{{UI_ENTRY}}';
    const REPOSITORY = '{{REPOSITORY}}';
    const VERSION = '{{VERSION}}';
    const BUSINESS_SIDE = '{{BUSINESS_SIDE}}';
    const BUSINESS_WIDTH = {{BUSINESS_WIDTH}};
    const CUSTOM_FRAME = {{CUSTOM_FRAME}};
    const AGENT_DEFAULT = {{AGENT_DEFAULT}};
    const AGENT_MIN = {{AGENT_MIN}};
    const AGENT_MAX = {{AGENT_MAX}};
    const AGENT_STEP = {{AGENT_STEP}};
    const NARROW_BELOW = {{NARROW_BELOW}};
    const DRAWER_MAX = {{DRAWER_MAX}};
    /* ---- 注入结束 ---- */

    const TITLE = '小铃铛';
    const PANEL_TITLE = '淋巴瘤工作台';
    const SUBTITLE = '分型先弄清，治疗才不慌';
    const DESCRIPTION = '淋巴瘤的分型整理、疗效回顾与就诊准备：把检查、治疗与症状放回同一段时间里，整理成就诊时能带着走的问题清单。';
    const WIDTH_KEY = 'lymbell.agent.pane.v1';
    const DRAFT_QUEUE_KEY = 'lymbell.initial-drafts.v1';
    const MESSAGE_TYPE = 'lymbell:agent-draft';

    const clampWidth = (value) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return AGENT_DEFAULT;
      return Math.min(AGENT_MAX, Math.max(AGENT_MIN, n));
    };
    /** 对齐到步进：键盘与鼠标落在同一组取值上，避免拖出 33.7% 这种数 */
    const snapWidth = (value) => clampWidth(Math.round(value / AGENT_STEP) * AGENT_STEP);
    const round4 = (n) => Math.round(n * 10000) / 10000;

    function loadWidth() {
      try {
        const saved = JSON.parse(localStorage.getItem(WIDTH_KEY) || 'null');
        return clampWidth(saved?.width);
      } catch { return AGENT_DEFAULT; }
    }
    function saveWidth(width) {
      try { localStorage.setItem(WIDTH_KEY, JSON.stringify({ width: round4(width) })); } catch { /* 隐私模式忽略 */ }
    }

    /* ---------------- 样式 ---------------- */

    const rootStyle = {
      display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, minWidth: 0,
      width: '100%', maxWidth: '100%', boxSizing: 'border-box',
      background: '#faf8fd', fontFamily: '-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif',
    };
    /* 首个子元素必须是语义 <header>：宿主为 macOS 窗口按钮预留了 --dsh-frame-leading-clearance。
       左侧品牌 + 版本号；右侧「AI 对话」紧贴右缘，中间是说明。 */
    const headerStyle = {
      display: 'flex', alignItems: 'center', gap: 10, flex: '0 0 auto', flexWrap: 'wrap',
      padding: '6px 12px', paddingInlineStart: 'var(--dsh-frame-leading-clearance, 12px)',
      borderBottom: '1px solid #e9e3f1', background: '#f7f4fc', fontSize: 12,
    };
    const brandStyle = {
      display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, color: '#4a3475',
      whiteSpace: 'nowrap', fontSize: 12.5,
    };
    const verStyle = {
      fontWeight: 500, fontSize: 11, color: '#7b7186', background: '#eee8f8',
      borderRadius: 999, padding: '1px 8px', whiteSpace: 'nowrap',
    };
    const hintStyle = { flex: 1, minWidth: 200, color: '#8b819a', fontSize: 11.5 };
    const headerActionsStyle = { display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto', marginLeft: 'auto' };
    const bodyStyle = { position: 'relative', display: 'flex', flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden' };
    const businessStyle = { flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' };
    const frameStyle = { flex: '1 1 auto', width: '100%', minHeight: 0, border: 0, display: 'block' };
    const paneStyle = {
      display: 'flex', flexDirection: 'column', flex: '0 0 auto', minWidth: 0, minHeight: 0,
      borderLeft: '1px solid #e9e3f1', background: '#fff', overflow: 'hidden',
    };
    const drawerStyle = {
      position: 'absolute', top: 0, right: 0, bottom: 0, zIndex: 3,
      boxShadow: '-8px 0 24px rgba(46, 36, 56, 0.14)',
    };
    const splitterStyle = {
      position: 'absolute', top: 0, bottom: 0, width: 1, marginRight: -0.5,
      zIndex: 2, background: '#E4DFEA', cursor: 'col-resize', touchAction: 'none',
      transition: 'background .15s ease, box-shadow .15s ease',
    }

    /* 分隔线（全家族统一行为）：悬停显示本工作台同色系增亮色 + 拖动把手；按住左右拖动调 AI 面板宽度 */
    const SPLITTER_BRAND = '#4a3475'
    const splitterMix = (hex, ratio) => {
      const n = parseInt(String(hex).replace('#', ''), 16)
      const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
      const mix = (c) => Math.round(c + (255 - c) * ratio)
      return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`
    }
    const splitterRgba = (hex, alpha) => {
      const n = parseInt(String(hex).replace('#', ''), 16)
      return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
    }
    const splitterHoverStyle = {
      ...splitterStyle,
      background: SPLITTER_BRAND,
      boxShadow: `0 0 6px ${splitterRgba(SPLITTER_BRAND, 0.55)}`,
    }
    const splitterDragStyle = {
      ...splitterHoverStyle,
      boxShadow: `0 0 10px ${splitterRgba(SPLITTER_BRAND, 0.8)}`,
    }
    const splitterHitStyle = {
      position: 'absolute', top: 0, bottom: 0, left: -5, width: 11,
      background: 'transparent', cursor: 'col-resize',
    }
    const splitterGripStyle = {
      position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
      width: 14, height: 22, borderRadius: 4, background: SPLITTER_BRAND,
      color: '#fff', fontSize: 11, lineHeight: '22px', letterSpacing: '-1px', textAlign: 'center',
      opacity: 0.95, pointerEvents: 'none', userSelect: 'none',
      boxShadow: '0 1px 4px rgba(0, 0, 0, 0.18)',
    }
    const splitterFocusStyle = {
      ...splitterStyle, background: SPLITTER_BRAND,
      boxShadow: `0 0 0 1px ${splitterRgba(SPLITTER_BRAND, 0.5)}`,
    }
    const dragShieldStyle = {
      position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 4,
      cursor: 'col-resize', background: 'transparent', touchAction: 'none',
    }
    const fallbackStyle = { padding: 24, color: '#2e2438', fontSize: 14, lineHeight: 1.7 };
    /* 行动橙（与业务页 --orange 同色）：入口要一眼能找到，品牌紫在浅底上不够跳 */
    const buttonStyle = {
      border: 0, borderRadius: 999, padding: '5px 14px', whiteSpace: 'nowrap',
      background: '#e8590c', color: '#fff', font: 'inherit', fontWeight: 600, cursor: 'pointer',
    };
    const ghostStyle = { ...buttonStyle, background: 'transparent', color: '#6b4f9e', border: '1px solid #e0d8ee' };
    const padStyle = {
      display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center',
      padding: 20, color: '#544a60', fontSize: 12.5, lineHeight: 1.75,
    };

    function Fallback({ onRetry }) {
      return h('div', { style: fallbackStyle },
        h('p', null, `页面没能加载（v${VERSION} · ${UI_ENTRY}）。常见原因是 Harness 刚重启、插件还没加载完。`),
        h('p', null, '本工作台的数据只存在你选择的本机目录里，不会因为这个提示丢失。'),
        h('button', { type: 'button', style: buttonStyle, onClick: onRetry }, '重新加载'),
      );
    }

    /* ---------------- 会话判定（官方 dsh-site-selection 同款） ---------------- */

    let bridge = null;
    function currentSession() {
      const service = bridge?.desktopWorkbenches;
      if (typeof service?.currentSession === 'function') return service.currentSession() || null;
      const snapshot = bridge?.sessions?.list?.getSnapshot?.();
      return snapshot?.current || Object.keys(snapshot?.byId || {}).find((id) =>
        (snapshot.byId[id]?.retainedBy?.mainView ?? 0) > 0) || null;
    }
    function workbenchOwnsSession(sessionId) {
      if (!sessionId) return false;
      const service = bridge?.desktopWorkbenches;
      if (typeof service?.ownsSession === 'function') return service.ownsSession(sessionId);
      return false;
    }
    function ownedSession() {
      const id = currentSession();
      return workbenchOwnsSession(id) ? id : null;
    }

    /* ---------------- 原生草稿：只填入，不发送 ---------------- */

    function fillDraft(sessionId, prompt) {
      if (!sessionId || ownedSession() !== sessionId) throw new Error('会话已切换，请回到本工作台再操作');
      const actx = bridge.sessions.scope?.(sessionId);
      const conversation = actx?.get?.('conversation');
      if (!conversation) throw new Error('对话输入不可用');
      const input = conversation.input.for(actx);
      const snapshot = input.state.getSnapshot();
      if (snapshot.occurrences?.length || (snapshot.phase && snapshot.phase !== 'plain')) {
        throw new Error('当前草稿含引用或特殊输入，请先在原生会话里处理，再交给小铃铛');
      }
      const current = snapshot.draft || '';
      input.setDraft(current.trim() ? `${current}\n\n${prompt}` : prompt);
    }

    let pendingDraft = null; // { sessionId, prompt }
    try {
      const saved = JSON.parse(localStorage.getItem(DRAFT_QUEUE_KEY) || 'null');
      if (saved?.sessionId && saved?.prompt) pendingDraft = saved;
    } catch { /* 隐私模式忽略 */ }
    function rememberDraft(entry) {
      pendingDraft = entry;
      try {
        if (entry) localStorage.setItem(DRAFT_QUEUE_KEY, JSON.stringify(entry));
        else localStorage.removeItem(DRAFT_QUEUE_KEY);
      } catch { /* 隐私模式忽略 */ }
    }
    function flushDraft() {
      if (!pendingDraft) return false;
      try {
        fillDraft(pendingDraft.sessionId, pendingDraft.prompt);
        rememberDraft(null);
        return true;
      } catch { return false; /* composer 未就绪就留给下一轮 */ }
    }

    function onboardingPrompt(dir) {
      return [
        '你正在协助我使用「小铃铛淋巴瘤工作台」。它只做本机资料整理，不提供诊疗建议。',
        `资料目录：${dir || '（首次打开时在面板里选择）'}`,
        '里面是我的病理与分型、检查与 PET 结果、治疗周期记录与就诊问题清单。',
        '分工：你帮我汇总、找缺漏、把报告里的指标和日期整理成对照表；判断和决定由我和治疗团队做。',
        '我标记的"看法"是我自己的担心或判断，不是医生结论；分期与疗效的写法以报告原文为准。',
      ].join('\n');
    }

    /* ---------------- 面板（customFrame） ---------------- */

    function Panel({ conversation }) {
      const [generation, setGeneration] = React.useState(0);
      const [broken, setBroken] = React.useState(false);
      const [note, setNote] = React.useState('');
      const [width, setWidth] = React.useState(loadWidth);
      const [paneOpen, setPaneOpen] = React.useState(true);
      const [connecting, setConnecting] = React.useState(false);
      const [narrow, setNarrow] = React.useState(false);
      const [dragging, setDragging] = React.useState(false)
      const [hovering, setHovering] = React.useState(false);

      const brokenTimer = React.useRef(null);
      const shellRef = React.useRef(null);
      const dragHostRef = React.useRef(null);
      const frameRef = React.useRef(null);

      const hasConversation = Boolean(conversation);
      const canOpenSession = typeof bridge?.desktopWorkbenches?.ensureSession === 'function';

      // 8 秒没 onLoad 就当没起来：给一个能重试的提示，也不留一块白板。
      // onLoad 成功后必须清掉定时器，否则正在用的页面 8 秒后会被换成兜底页。
      React.useEffect(() => {
        setBroken(false);
        brokenTimer.current = setTimeout(() => setBroken(true), 8000);
        return () => clearTimeout(brokenTimer.current);
      }, [generation]);

      React.useEffect(() => {
        const timer = setInterval(() => { if (flushDraft()) setNote('草稿已填入会话，按回车发送'); }, 500);
        const unsubscribe = bridge?.desktopWorkbenches?.subscribe?.(() => setNote(''));
        return () => { clearInterval(timer); unsubscribe?.(); };
      }, []);

      // 窄屏判定用**容器宽度**而不是窗口宽度（合同 §3 基线）
      React.useEffect(() => {
        const host = shellRef.current;
        if (!host || typeof ResizeObserver !== 'function') return undefined;
        const observer = new ResizeObserver((entries) => {
          const w = entries[0]?.contentRect?.width ?? 0;
          setNarrow(w > 0 && w < NARROW_BELOW);
        });
        observer.observe(host);
        return () => observer.disconnect();
      }, []);

      const applyWidth = React.useCallback((next) => {
        const snapped = round4(snapWidth(next));
        setWidth(snapped);
        saveWidth(snapped);
      }, []);

      /* ---- splitter：鼠标/触控拖动 ---- */

      const stopDrag = React.useCallback(() => {
        dragHostRef.current = null;
        setDragging(false);
      }, []);

      React.useEffect(() => {
        if (!dragging) return undefined;
        const onMove = (event) => {
          const host = dragHostRef.current;
          if (!host) return;
          const rect = host.getBoundingClientRect();
          if (!rect.width) return;
          // 会话在右侧：指针越靠左，会话越宽
          applyWidth((rect.right - event.clientX) / rect.width);
        };
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', stopDrag);
        document.addEventListener('pointercancel', stopDrag);
        return () => {
          document.removeEventListener('pointermove', onMove);
          document.removeEventListener('pointerup', stopDrag);
          document.removeEventListener('pointercancel', stopDrag);
        };
      }, [dragging, applyWidth, stopDrag]);

      const onSplitterPointerDown = (event) => {
        event.preventDefault();
        try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* 旧宿主无指针捕获：document 监听仍可拖动 */ }
        dragHostRef.current = shellRef.current;
        setDragging(true);
      };

      const onSplitterKeyDown = (event) => {
        const delta = { ArrowLeft: AGENT_STEP, ArrowRight: -AGENT_STEP }[event.key]; // 会话在右：← 变宽
        if (delta !== undefined) { event.preventDefault(); applyWidth(width + delta); return; }
        if (event.key === 'Home') { event.preventDefault(); applyWidth(AGENT_MAX); return; }
        if (event.key === 'End') { event.preventDefault(); applyWidth(AGENT_MIN); }
      };

      /* ---- 打开 / 收起 AI 对话 ---- */

      async function openAgent(prompt = null) {
        setNote('');
        if (!canOpenSession) {
          setNote('当前 Desktop 版本不支持从面板调起会话；请从左侧会话列表新建会话');
          return;
        }
        setConnecting(true);
        try {
          let dir = null;
          try {
            const res = await fetch(`${API_PREFIX}/api/health`);
            dir = (await res.json())?.dir || null;
          } catch { /* 拿不到目录也照样调起 */ }
          const id = await bridge.desktopWorkbenches.ensureSession({ folder: dir });
          rememberDraft({ sessionId: id, prompt: prompt || onboardingPrompt(dir) });
          flushDraft();
          setPaneOpen(true);
          setNote('会话已就绪：草稿已填入右侧输入框，按回车发送');
        } catch (error) {
          setNote(`没能调起会话：${error?.message ?? error}`);
        } finally {
          setConnecting(false);
        }
      }

      // 收起只是隐藏，不是关闭/删除会话：再点「打开 AI 对话」回到同一个会话。
      function onAgentClick() {
        if (!hasConversation) { void openAgent(); return; }
        setPaneOpen((open) => !open);
        setNote('');
      }

      /* ---- 页面发来的「与 Agent 讨论」草稿：只填输入框，不发送 ---- */

      async function deliverContext(prompt) {
        const id = ownedSession();
        if (id) {
          rememberDraft({ sessionId: id, prompt });
          setPaneOpen(true);
          setNote(flushDraft()
            ? '已把这一页的内容填入会话草稿，按回车发送'
            : '会话输入框还没就绪；草稿已暂存，就绪后自动填入');
          return;
        }
        setNote('正在为你调起 AI 会话…');
        await openAgent(prompt);
      }

      // handler 每轮换成最新闭包，effect 只注册一次：直接闭包会拿到首帧 state
      const deliverRef = React.useRef(null);
      React.useEffect(() => { deliverRef.current = deliverContext; });
      React.useEffect(() => {
        function onMessage(event) {
          const data = event.data;
          if (!data || typeof data !== 'object' || data.type !== MESSAGE_TYPE) return;
          const frame = frameRef.current;
          // 不认"谁都能发"的消息：必须来自我们自己的 iframe，且同源
          if (!frame || event.source !== frame.contentWindow) return;
          if (event.origin !== window.location.origin) return;
          const prompt = typeof data.prompt === 'string' ? data.prompt.trim() : '';
          if (!prompt) return;
          void deliverRef.current?.(prompt.slice(0, 8000));
        }
        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
      }, []);

      const agentLabel = !canOpenSession
        ? 'AI 对话暂不可用'
        : connecting ? '正在连接…'
          : !hasConversation ? 'AI 对话'
            : paneOpen ? '收起 AI 对话' : '打开 AI 对话';

      if (broken) return h(Fallback, { onRetry: () => setGeneration((n) => n + 1) });

      const percent = Math.round(width * 100);
      const paneVisible = paneOpen && (hasConversation || connecting);

      return h('div', { style: rootStyle },
        h('header', { style: headerStyle },
          h('span', { style: brandStyle }, `🔔 ${TITLE}`),
          h('span', { style: verStyle }, `v${VERSION}`),
          h('span', { style: hintStyle },
            hasConversation
              ? '右侧是 DSH 原生会话：可拖中间分隔边调整宽度（25%–45%），收起不会结束会话。'
              : '还没有会话。点右侧「AI 对话」调起原生会话，开场白只填进草稿，不自动发送。'),
          h('div', { style: headerActionsStyle },
            h('button', {
              type: 'button',
              style: buttonStyle,
              onClick: onAgentClick,
              disabled: connecting || !canOpenSession,
              title: canOpenSession ? '打开 / 收起右侧原生会话（不结束会话）' : '当前 Desktop 版本不支持从面板调起会话',
              'aria-label': `AI 对话：${agentLabel}`,
              'aria-controls': 'lymbell-agent-pane',
              'aria-expanded': paneVisible ? 'true' : 'false',
            }, agentLabel),
            // 会话已绑定时给一个明确的收起控件，不把关闭藏在面板内部（合同 §1）
            hasConversation && paneOpen && h('button', {
              type: 'button', style: ghostStyle, onClick: () => setPaneOpen(false),
              'aria-label': '收起 AI 对话面板',
            }, '×'),
            note && h('span', { style: { color: '#a4506b', fontWeight: 600 } }, note),
          ),
        ),
        h('div', { ref: shellRef, style: bodyStyle },
          h('div', { style: businessStyle },
            h('iframe', {
              key: generation,
              ref: frameRef,
              src: UI_ENTRY,
              title: `${TITLE} · ${SUBTITLE}`,
              style: frameStyle,
              sandbox: 'allow-scripts allow-same-origin allow-forms allow-downloads',
              onLoad: () => { setBroken(false); clearTimeout(brokenTimer.current); },
            }),
          ),
          // splitter 只在宽屏出现：窄屏是覆盖式抽屉，拖宽没有意义
          !narrow && paneVisible && h('div', {
            role: 'separator',
            'aria-orientation': 'vertical',
            'aria-label': '调整 AI 对话面板宽度',
            'aria-valuemin': Math.round(AGENT_MIN * 100),
            'aria-valuemax': Math.round(AGENT_MAX * 100),
            'aria-valuenow': percent,
            tabIndex: 0,
            style: {
              ...(dragging ? splitterDragStyle : hovering ? splitterHoverStyle : splitterStyle),
              right: `${percent}%`,
            },
            onPointerDown: onSplitterPointerDown,
            onPointerEnter: () => setHovering(true),
            onPointerLeave: () => setHovering(false),
            onKeyDown: onSplitterKeyDown,
          }, h('span', { style: splitterHitStyle, 'aria-hidden': 'true' }),
            (hovering || dragging) ? h('span', { style: splitterGripStyle, 'aria-hidden': 'true' }, '⠿') : null),
          dragging && !narrow && h('div', { 'aria-hidden': 'true', style: dragShieldStyle }),
          // 原生会话**始终挂载**：卸载会丢掉输入框与草稿（宿主明确要求不重挂输入树），
          // 所以隐藏走 display，不卸载组件。
          h('aside', {
            id: 'lymbell-agent-pane',
            style: {
              ...paneStyle,
              ...(narrow ? drawerStyle : null),
              width: narrow ? `min(92%, ${DRAWER_MAX}px)` : `${percent}%`,
              display: paneVisible ? 'flex' : 'none',
            },
            'aria-label': 'AI 对话',
            'aria-hidden': paneVisible ? undefined : 'true',
          }, conversation ?? h('div', { style: padStyle },
            h('b', null, 'AI 对话还没开始'),
            h('span', null, '点顶栏「AI 对话」调起 DSH 原生会话后，它会固定出现在这一侧。'),
            h('span', null, '没有会话也不影响记录：左侧的资料整理、疗效回顾与就诊准备照常可用。'),
          )),
        ),
      );
    }

    function apply(ctx) {
      bridge = ctx;
      // 运行时身份留给页面与宿主对账（旧安装按 lymbell / 早期误写的身份授权迁移）
      window.__LYMBELL_RUNTIME_ID__ = RUNTIME_ID;
      window.__LYMBELL_LEGACY_IDS__ = LEGACY_WORKBENCH_IDS;

      ctx.effect(() => ctx.desktopWorkbenches.register({
        title: TITLE,
        panelTitle: PANEL_TITLE,
        icon: '🔔',
        repository: REPOSITORY,
        description: DESCRIPTION,
        audience: '淋巴瘤患者与照护者',
        requirements: '本机数据整理；不做诊断与处置建议，判断由用户与治疗团队做出。',
        initialization: 'empty',
        embedded: true,
        version: VERSION,
        // 四个面板值由 scripts/build-client.mjs 从 lib/layout.js 注入，不在这里手写第二份
        layout: { businessSide: BUSINESS_SIDE, businessWidth: BUSINESS_WIDTH },
        customFrame: CUSTOM_FRAME,
      }, Panel), `${RUNTIME_ID}: register`);
    }

    return { apply, inject: ['desktopWorkbenches', 'sessions'] };
  },
});
