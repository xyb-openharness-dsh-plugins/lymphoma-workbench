/**
 * DSH Desktop 工作台适配层（Desktop 工作台适配 1.2.2）。
 *
 * 职责（三条边界）：
 * 1. **仓库身份**：运行时 ID `wb-dataelement-dsh-lymbell`；`legacyWorkbenchIds` 授权 Desktop
 *    把旧安装（按 `lymbell` 识别）的状态、收藏与会话归属迁移到仓库身份。
 * 2. **会话归属由 Desktop 管理**：本模块只问三个问题——`register`（登记自己）、
 *    `isActive()`（本工作台是否在前台）、`ownsSession(id)`（这个会话是否归我）。
 *    不覆盖侧边栏、设置、模式切换和公共导航。
 * 3. **不假装有会话**：不在 Desktop 宿主内时，桥接层降级为 standalone——所有能力如实报
 *    `available: false`，界面显示空态，不伪造一个 AI。
 *
 * 会话 ↔ 业务项目绑定：
 * - 有会话：`sessionId → projectId` 存数据根 `.desktop-session-projects.json`（经 server API）；
 * - 尚无会话：最近选择存本来源 localStorage（`lymbell.agent.recentProject`）。
 * - 开场白只**追加到原生草稿**（前台 + 会话归属都在时），**不自动发送、不覆盖原文**。
 */

export const RUNTIME_ID = 'wb-dataelement-dsh-lymbell'
export const LEGACY_WORKBENCH_IDS = ['lymbell']
export const DISPLAY_NAME = '小铃铛 · 淋巴瘤工作台'

const RECENT_KEY = 'lymbell.agent.recentProject'

/**
 * 创建 Desktop 桥接。
 * @param {object} [opts]
 * @param {object} [opts.host] Desktop 宿主注入的 `desktopWorkbenches`；不给就是 standalone
 * @param {object} [opts.storage] localStorage 形状的对象（单测可注入假存储）
 */
export function createDesktopBridge({ host = null, storage = globalThis.localStorage ?? null } = {}) {
  const native = host?.desktopWorkbenches ?? null
  let registered = null
  let currentSessionId = null
  let currentProjectId = null

  const manifest = {
    runtimeId: RUNTIME_ID,
    legacyWorkbenchIds: [...LEGACY_WORKBENCH_IDS],
    displayName: DISPLAY_NAME,
    /** 入口固定：安装后出现在「工作台市场」，不动态增删导航。 */
    fixedEntry: true,
  }

  const bridge = {
    RUNTIME_ID,
    LEGACY_WORKBENCH_IDS,
    manifest,

    /** 是否运行在 Desktop 宿主内。standalone 时一切原生能力都不可用。 */
    get available() { return Boolean(native?.register) },

    /**
     * 向 Desktop 登记本工作台。宿主不在时不注册、不报错——standalone 照常用，
     * 只是原生会话相关能力返回不可用。返回登记句柄（或 standalone 空句柄）。
     */
    register({ onSessionChange = null, onActivate = null } = {}) {
      if (registered) return registered
      if (native?.register) {
        registered = native.register({
          ...manifest,
          isActive: () => bridge.isActive(),
          ownsSession: (sessionId) => bridge.ownsSession(sessionId),
          onSessionChange: (sessionId) => {
            currentSessionId = sessionId ?? null
            onSessionChange?.(currentSessionId)
          },
          onActivate: () => onActivate?.(),
        })
      } else {
        registered = { standalone: true }
      }
      return registered
    },

    /** 本工作台是否在前台（Desktop 管理；standalone 恒 true——本地页就是全部前台）。 */
    isActive() {
      if (native?.isActive) return Boolean(native.isActive())
      return true
    },

    /** 这个会话是否归本工作台（Desktop 管理；standalone 没有原生会话，恒 false）。 */
    ownsSession(sessionId) {
      if (!sessionId) return false
      if (native?.ownsSession) return Boolean(native.ownsSession(sessionId))
      return false
    },

    /**
     * 请求 Desktop 建立并打开原生会话。`draft` 是开场白：宿主只把它**填进草稿**，
     * 由用户确认后自己发送；这里绝不触发自动发送。
     * @returns {Promise<{ok: boolean, sessionId?: string, reason?: string}>}
     */
    async openSession({ projectId = null, draft = null } = {}) {
      if (!this.available) return { ok: false, reason: 'not_in_desktop' }
      if (!native.openSession) return { ok: false, reason: 'host_missing_open_session' }
      const result = await native.openSession({
        runtimeId: RUNTIME_ID,
        projectId,
        draft: draft ?? null,   // 只填草稿，不发送
        autoSend: false,
      })
      if (result?.sessionId) {
        currentSessionId = result.sessionId
        if (projectId) currentProjectId = projectId
      }
      return result ?? { ok: false, reason: 'host_bad_response' }
    },

    /** 用户可以随时关闭会话窗口；归属关系仍由 Desktop 记着。 */
    async closeSession() {
      if (this.available && native?.closeSession) await native.closeSession()
      currentSessionId = null
      return { ok: true }
    },

    /**
     * 前台消息：只有「本工作台在前台 && 会话归本工作台」同时成立时才追加到原生草稿。
     * 追加不覆盖原文，也不发送——什么时候发由用户决定。
     */
    async appendDraft(text) {
      if (!text?.trim()) return { ok: false, reason: 'empty' }
      if (!this.isActive()) return { ok: false, reason: 'not_active' }
      if (!this.ownsSession(currentSessionId)) return { ok: false, reason: 'no_session' }
      if (!native?.appendDraft) return { ok: false, reason: 'host_missing_append_draft' }
      return native.appendDraft({ sessionId: currentSessionId, text, mode: 'append' })
    },

    /* ---------- 会话 ↔ 项目绑定 ---------- */

    currentSessionId() { return currentSessionId },

    /** 每个会话记住自己的项目选择；重启后恢复。 */
    async rememberProject(projectId, { fetchFn = globalThis.fetch } = {}) {
      currentProjectId = projectId
      if (currentSessionId) {
        // 有会话：写数据根的绑定文件（经 server API）
        try {
          await fetchFn('/api/agent/session-projects', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionId: currentSessionId, projectId, recent: { projectId } }),
          })
        } catch { /* 绑定失败不阻断使用；重启后回落到最近选择 */ }
      } else if (storage) {
        // 尚无会话：最近选择存当前 Desktop 来源的 localStorage
        try { storage.setItem(RECENT_KEY, projectId) } catch { /* 隐私模式等场景，忽略 */ }
      }
      return { ok: true, projectId, sessionId: currentSessionId }
    },

    /** 恢复这个会话的项目选择：会话绑定优先，没有会话用最近选择（localStorage）。 */
    async restoreProject({ fetchFn = globalThis.fetch } = {}) {
      if (currentSessionId) {
        try {
          const res = await fetchFn('/api/agent/session-projects')
          if (res.ok) {
            const data = await res.json()
            const bound = data.sessions?.[currentSessionId] ?? null
            if (bound) { currentProjectId = bound; return { projectId: bound, from: 'session' } }
          }
        } catch { /* 读不到就用最近选择 */ }
      }
      try {
        const recent = storage?.getItem?.(RECENT_KEY) ?? null
        if (recent) { currentProjectId = recent; return { projectId: recent, from: 'recent' } }
      } catch { /* 同上 */ }
      return { projectId: null, from: 'none' }
    },
  }

  return bridge
}

/** 默认桥接单例：页面脚本直接 import 使用（public 以普通 script 引入，走全局）。 */
export function registerDesktopBridge(globalObject = globalThis) {
  globalObject.LymBellDesktop = { createDesktopBridge, RUNTIME_ID, LEGACY_WORKBENCH_IDS }
}
