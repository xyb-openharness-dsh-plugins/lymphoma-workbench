/**
 * 装机身份常量（M5）。
 *
 * 三处必须同值，否则 Desktop 认不出这个工作台：
 * - `cordis.patch.yml` 的 `insert[].id`  ← `PLUGIN_ID`
 * - `cordis.patch.yml` 的 `insert[].name` ← npm 包名
 * - `cordis.patch.yml` 的 `config.root`  ← `dshHomePath(HOME_DIR)`
 *
 * 另外 `RUNTIME_ID`（在 `lib/client.js`）必须与仓库身份一致：宿主按
 * `<owner>-<repo>` 登记工作台，写着别的组织会导致会话与收藏无法归属。
 */

/** 插件条目 id：必须与 cordis.patch.yml 的 insert[].id 同值。 */
export const PLUGIN_ID = 'lymphoma-workbench-main'

/** 接口前缀：宿主按这个前缀把请求整段转给本工作台。 */
export const API_PREFIX = '/api/lymphoma-workbench'

/** 宿主分配给本工作台的配置目录名（存资料目录指针与会话绑定）。 */
export const HOME_DIR = 'lymphoma-workbench'

/** 面板 iframe 的 src：前缀 + /ui/。 */
export const UI_ENTRY = `${API_PREFIX}/ui/`

/** 仓库身份：owner/repo 与运行时 ID 都从这里出。 */
export const REPO_OWNER = 'xyb-openharness-dsh-plugins'
export const REPO_NAME = 'lymphoma-workbench'
export const RUNTIME_ID = `wb-${REPO_OWNER}-${REPO_NAME}`

/**
 * 旧身份：授权 Desktop 把按这些 ID 识别的旧安装（状态、收藏、会话归属）迁到仓库身份。
 * `wb-dataelement-dsh-lymbell` 是早期误写的组织，留着是为了让装过它的机器能迁过来。
 */
export const LEGACY_WORKBENCH_IDS = ['lymbell', 'wb-dataelement-dsh-lymbell']
