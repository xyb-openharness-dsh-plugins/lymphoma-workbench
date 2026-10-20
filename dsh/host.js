/**
 * 宿主接入层（M5）。
 *
 * 这一层只做三件事，别的都交给 `createWorkbenchServer`：
 * 1. 把宿主 webServer 转来的前缀请求交给同一个 handler（路径改写规则在 `server.js`）；
 * 2. 按官方做法先过一遍 `connection.requestRejection`，没通过就不碰业务；
 * 3. 业务库放在宿主分配给本工作台的目录里，界面该怎么跑还是怎么跑。
 *
 * 为什么 `Config` 不在这里：`Config` 必须是 Schemastery schema，那会引一个只有宿主
 * 才提供的依赖，让本文件在本仓库里不可测。所以 `dsh/index.js` 单独导出 `Config`，
 * 这里保持零依赖、可单测（与乳腺/卵巢同款分工）。
 *
 * 与乳腺不同的一点：淋巴瘤把「资料目录」存在业务库里（用户自己在界面上选，
 * 用于放原件与导出文件），所以宿主不需要恢复目录指针——库在哪，设置就在哪。
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWorkbenchServer } from './server.js';
import { PLUGIN_ID, API_PREFIX, HOME_DIR, UI_ENTRY } from '../lib/identity.js';

export { PLUGIN_ID, API_PREFIX, HOME_DIR, UI_ENTRY };

/** 插件条目 id：必须与 cordis.patch.yml 的 insert[].id 同值。 */
export const name = PLUGIN_ID;

/** 宿主注入的服务。connection 用于本机授权判断；webServer 用于挂接口前缀。 */
export const inject = ['webServer', 'connection'];

/** 知识库随包分发；不在则 server 内部容错为「未接入」，不假装能用。 */
const KB_PATH = fileURLToPath(new URL('../knowledge/lymphoma-kb.sqlite', import.meta.url));
/** 宿主没给配置目录时（只可能发生在测试里）退回包内位置，不在用户目录乱建。 */
const FALLBACK_DB = fileURLToPath(new URL('../workspace/lymbell.sqlite', import.meta.url));

function sendJson(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

/**
 * 造一个宿主 handler。授权判断沿用官方示例的写法：
 * `requestRejection` 返回 undefined 表示放行，返回数字表示用那个状态码拒绝；
 * 宿主没有这个方法时一律 403——宁可挡住，也不假装通过。
 */
export function createHostHandler(server, ctx = null) {
  return async function hostHandler(req, res) {
    const rejection = ctx?.connection?.requestRejection?.(req);
    if (!ctx?.connection?.requestRejection || rejection !== undefined) {
      sendJson(res, rejection || 403, { error: '需要通过 DSH 本机授权会话访问这个工作台' });
      return;
    }
    await server.handle(req, res);
  };
}

/** 最近一次挂载的 server（测试与诊断用）。cordis 的 apply 不能用返回值传实例。 */
let MOUNTED = null;
export function mountedServer() {
  return MOUNTED;
}

/**
 * 宿主调用。注册一个 prefix 路由。**非 async、无返回值**——cordis 对 apply
 * 返回值有严格检查（resolve 出普通对象会报 Invalid effect，家族里实测踩过）。
 *
 * @param {object} ctx 宿主上下文，至少要有 `webServer`、`connection`、`effect`
 * @param {{ root?: string }} [config] 宿主给的配置；`root` 是宿主分配给本工作台的目录
 */
export function apply(ctx, config = {}) {
  const root = typeof config?.root === 'string' && config.root ? config.root : null;
  if (root) mkdirSync(root, { recursive: true });
  const dbPath = root ? join(root, 'lymbell.sqlite') : FALLBACK_DB;

  const server = createWorkbenchServer({
    dbPath,
    kbPath: KB_PATH,
    basePath: API_PREFIX,
    apiBase: API_PREFIX,
    runtime: 'host',
  });
  MOUNTED = server;

  ctx.effect(
    () => ctx.webServer.register({
      kind: 'prefix',
      path: API_PREFIX,
      handler: createHostHandler(server, ctx),
    }),
    `${PLUGIN_ID}: api`,
  );
}
