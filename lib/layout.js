/* 面板布局参数（沿用乳腺癌工作台 D21→D34 的实测结论：A「标准分栏 0.65」）。
 *
 * 这里是 DSH 面板合同的唯一入参来源：M5 的 cordis.patch.yml 与 M2 的界面判定都读它，
 * 不在别处再写一份 0.65。依据与实测见 docs/UI-DESIGN.md §6。
 *
 * 为什么不用 customFrame（B）：B 要自己实现首次进入与无会话态，还要避让窗口按钮；
 * 乳腺工作台在 34 个视图 × 五档宽度下实测页面级横向溢出为 0，只余一处宽表需要整行，
 * 一条 CSS 规则即可解决，不值得为它换整页框架。
 *
 * 本项目的差异：淋巴瘤的宽表不是「四点位测量」，而是「治疗周期表」与「PET 疗效表」。
 * 两者列数相近（6–7 列），所以沿用同一个最小宽度判定，改名以免误读。
 */

/** 宿主面板参数（写进 cordis.patch.yml / dsh 清单时逐字使用） */
export const PANEL = Object.freeze({
  businessSide: 'right',
  businessWidth: 0.65,
  customFrame: false,
});

/** 宿主允许的 businessWidth 区间（超出即被宿主拒或触发警告） */
export const HOST_LIMITS = Object.freeze({ min: 0.25, max: 0.7 });

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

/** 自检：返回问题清单，空数组表示合法。参数可注入，便于单测覆盖越界情形。 */
export function assertPanelConfig(config = PANEL) {
  const problems = [];
  if (!['left', 'right'].includes(config.businessSide)) problems.push(`businessSide 只能是 left/right，当前 ${config.businessSide}`);
  if (config.customFrame !== false) problems.push('沿用 A 方案：customFrame 必须为 false');
  const w = config.businessWidth;
  if (!(typeof w === 'number' && w >= HOST_LIMITS.min && w <= HOST_LIMITS.max)) {
    problems.push(`businessWidth 必须在 ${HOST_LIMITS.min}–${HOST_LIMITS.max} 之间，当前 ${w}`);
  }
  if (w === HOST_LIMITS.max) problems.push('businessWidth 取上限 0.7 属于"把报表塞进分栏"，本项目不这么做');
  return problems;
}
