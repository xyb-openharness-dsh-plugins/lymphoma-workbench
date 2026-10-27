/* 面板布局参数（沿用乳腺癌工作台的做法：customFrame 形态）。
 *
 * 这里是 DSH 面板合同的唯一入参来源：`src/client.js` 的注入、界面判定都读它，
 * 不在别处再写一份 0.65 / left / 0.35。依据与实测见 docs/UI-DESIGN.md §6。
 *
 * ## 为什么从「标准分栏」改成 customFrame（2026-10-27）
 *
 * 标准分栏（customFrame=false）下，宿主自己画那条分栏，工作台里**没有任何地方能放
 * 「AI 对话」入口**：页面跑在 iframe 里够不到宿主会话栏，顶栏按钮只能显示「暂不可用」；
 * 分栏方向也只能靠 businessSide 猜（此前写成 right，整条分栏镜像，业务区被推到右边）。
 * 宿主的会话栏不可拖动、不可收起，服务里也没有对应接口。
 *
 * customFrame=true 时宿主把**原生会话节点**作为 `conversation` prop 交给我们排版，
 * 于是顶栏右上角可以有真正的「AI 对话 / 收起 AI 对话」按钮，splitter 可拖可键盘调，
 * 收起不结束会话。代价（官方 §4 / §6，逐条已在 src/client.js 处理）：
 * 1. 无会话态要自己引导；2. 根节点首个子元素必须是语义 `<header>` 并避让
 *    `--dsh-frame-leading-clearance`；3. 会话输入树不能卸载，只切 display。
 *
 * businessWidth 记的是**默认业务区宽度**，与 AGENT_PANE.default 互补（0.65 / 0.35）。
 */

/** 宿主面板参数（写进 cordis.patch.yml / dsh 清单时逐字使用）
 *
 * businessSide 必须是 'left'：业务区在左，宿主原生会话面板在最右。
 * 2026-10-27 修：此前写成 'right'，装机后镜像了整个分栏——宿主的「新会话」留在左半边，
 * 工作台被推到右边，用户看到的就是「AI 对话框在中间、工作台在右边」。
 * 家族统一取 left（starter `docs/02-DSH-CONTRACT.md`、`prompts/ZERO-TO-DEV.md` §309），
 * 不许各仓自定。
 */
export const PANEL = Object.freeze({
  businessSide: 'left',
  businessWidth: 0.65,
  customFrame: true,
});

/** 宿主允许的 businessWidth 区间（超出即被宿主拒或触发警告） */
export const HOST_LIMITS = Object.freeze({ min: 0.25, max: 0.7 });

/**
 * AI 会话面板宽度（customFrame 下由工作台自己实现拖动，宿主不参与）。
 * 取 starter `docs/20-AGENT-PANE-DESIGN.md` 的基线：默认 35%，可拖 25%–45%；
 * 容器窄于 760px 时改为覆盖式抽屉，业务区不让位。
 */
export const AGENT_PANE = Object.freeze({
  default: 0.35,
  min: 0.25,
  max: 0.45,
  /** 步进：键盘一次 2%，与拖动精度一致，键盘与鼠标落在同一组取值上 */
  step: 0.02,
  narrowBelowPx: 760,
  drawerMaxPx: 420,
});

/** 把任意输入夹到 AGENT_PANE 的允许区间内；非法输入（NaN 等）回落到默认值。 */
export function clampAgentWidth(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return AGENT_PANE.default;
  return Math.min(AGENT_PANE.max, Math.max(AGENT_PANE.min, n));
}

/** 宽表最小内容宽度（px）。
 *  基准：治疗周期表 6 列（周期 / 方案 / 计划日 / 实际日 / 剂量调整 / 备注），
 *  与 PET 疗效表 6 列（日期 / 部位 / Deauville / 大小 / 结论 / 出处）的 min-content。
 *  936 视口（1440 的 65%）下单卡约 313px 时放不下 → 必须整行跨列，不允许默认横向滚动。 */
export const WIDE_TABLE_MIN_PX = 417;

/** 业务区像素宽度：宿主给的比例 × 窗口宽度 */
export function businessPanePx(windowWidth, width = PANEL.businessWidth) {
  if (!Number.isFinite(windowWidth) || windowWidth <= 0) throw new TypeError('windowWidth 必须是正数');
  return Math.round(windowWidth * width);
}

/** 该卡宽是否放不下宽表（放不下 → 走整行跨列，不允许默认横向滚动） */
export function needsFullRowCard(cardPx) {
  if (!Number.isFinite(cardPx)) throw new TypeError('cardPx 必须是数字');
  return cardPx < WIDE_TABLE_MIN_PX;
}

/** 自检：返回问题清单，空数组表示合法。参数可注入，便于单测覆盖越界情形。
 *  customFrame 之后宿主仍会校验 layout，所以两类参数一起查。 */
export function assertPanelConfig(config = PANEL, agent = AGENT_PANE) {
  const problems = [];
  if (!['left', 'right'].includes(config.businessSide)) problems.push(`businessSide 只能是 left/right，当前 ${config.businessSide}`);
  if (config.customFrame !== true) problems.push('面板可拖动/可收起、入口在框架顶栏，都依赖 customFrame，必须为 true');
  const w = config.businessWidth;
  if (!(typeof w === 'number' && w >= HOST_LIMITS.min && w <= HOST_LIMITS.max)) {
    problems.push(`businessWidth 必须在 ${HOST_LIMITS.min}–${HOST_LIMITS.max} 之间，当前 ${w}`);
  }
  if (w === HOST_LIMITS.max) problems.push('businessWidth 取上限 0.7 属于"把报表塞进分栏"，本项目不这么做');
  if (!(agent.min >= 0.1 && agent.max <= 0.6 && agent.min < agent.max)) {
    problems.push(`AGENT_PANE 区间不合理：${agent.min}–${agent.max}`);
  }
  if (!(agent.default >= agent.min && agent.default <= agent.max)) {
    problems.push(`AGENT_PANE.default 必须落在 ${agent.min}–${agent.max} 之间，当前 ${agent.default}`);
  }
  if (!(agent.step > 0 && agent.step <= (agent.max - agent.min) / 2)) {
    problems.push(`AGENT_PANE.step 过大或非法：${agent.step}`);
  }
  // 业务区与会话宽度互补：松了这条，默认打开的观感就偏离 65/35 的实测基线
  if (Math.abs((1 - agent.default) - w) > 1e-9) {
    problems.push(`businessWidth(${w}) 与 AGENT_PANE.default(${agent.default}) 应互补：1 - ${agent.default} = ${1 - agent.default}`);
  }
  return problems;
}
