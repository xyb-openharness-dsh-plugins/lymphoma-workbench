/**
 * 宿主客户端入口源码（A 计划：标准分栏）。
 *
 * **不要直接改 lib/client.js**：那是 `npm run build:client` 从本文件生成的产物。
 * 官方要求客户端必须是「已构建好的单文件」（Desktop 不会替我们打包，workbench-standard §3.5），
 * 而且宿主的 renderer 用自己的 `window.__ModuleLoader__` 加载 —— **它不认原生 ESM**，
 * 直接把 ESM 入口给它会得到 `Unexpected token 'export'`，宿主还会因此把整个包移出 profile。
 *
 * ## 面板形态：标准分栏（customFrame = false）
 *
 * 宿主把本文件导出的组件渲染进业务区（`aside.dshWbBusiness`），AI 会话栏由宿主管。
 * 本项目沿用 A 方案（依据与实测见 `docs/UI-DESIGN.md` §6）：业务区 65%，不接管会话栏排版。
 *
 * ## 业务 UI 在 iframe 里
 *
 * 界面本来就是零依赖原生单页（`public/`），不为了挂载进宿主而改写成 React。
 * iframe 指向服务端在接口前缀下提供的同一个页面，接口基址由服务端注入
 * （页面模板里的 WB_API_BASE 占位符），页面不判断自己跑在哪。
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
    const LAYOUT = {{LAYOUT}};
    /* ---- 注入结束 ---- */

    const css = `
.lb-wrap{position:relative;flex:1 1 auto;min-height:0;min-width:0;height:100%;overflow:hidden}
.lb-frame{display:block;width:100%;height:100%;border:0;background:transparent}
`;

    /** 业务面板：整页交给 iframe，业务区宽度由宿主的 layout 决定。 */
    function BusinessPanel() {
      return h('div', { className: 'lb-wrap' },
        h('iframe', {
          className: 'lb-frame',
          title: '小铃铛 · 淋巴瘤工作台',
          src: UI_ENTRY,
          referrerPolicy: 'no-referrer',
        }));
    }

    function apply(ctx) {
      ctx.effect(() => {
        const style = document.createElement('style');
        style.dataset.dshPlugin = RUNTIME_ID;
        style.textContent = css;
        document.head.appendChild(style);
        return () => style.remove();
      }, `${RUNTIME_ID}: styles`);

      // 标准分栏：不写 customFrame（写了 true 才切到自建顶栏形态）。
      // 返回值是注销函数，交给 ctx.effect 管理。
      ctx.effect(() => ctx.desktopWorkbenches.register({
        title: '小铃铛',
        panelTitle: '淋巴瘤工作台',
        icon: '🔔',
        repository: REPOSITORY,
        description: '淋巴瘤的分型整理、疗效回顾与就诊准备：把检查、治疗与症状放回同一段时间里，整理成就诊时能带着走的问题清单。',
        audience: '淋巴瘤患者与照护者',
        requirements: '本机数据整理；不做诊断与处置建议，判断由用户与治疗团队做出。',
        initialization: 'empty',
        layout: LAYOUT,
      }, BusinessPanel), `${RUNTIME_ID}: register`);

      // 运行时身份留给页面与宿主对账（旧安装按 lymbell / 早期误写的身份授权迁移）
      window.__LYMBELL_RUNTIME_ID__ = RUNTIME_ID;
      window.__LYMBELL_LEGACY_IDS__ = LEGACY_WORKBENCH_IDS;
      void API_PREFIX;
    }

    return { apply, inject: ['desktopWorkbenches', 'sessions'] };
  },
});
