/**
 * 本机服务（M2）。零依赖 http：静态托管 public/ + /api/* 读写本机库。
 *
 * 不做：鉴权、外网访问、多用户、云端同步。只监听 127.0.0.1。
 * 数据写入一律经 store，界面拿到的永远是库里的事实（不乐观更新）。
 */
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore, openDb, todayISO } from './store.js';
import { openKb } from './kb.js';
import { validateWorkspacePath } from './paths.js';
import { seedIfEmpty } from './seed.js';
import { createImportService, ImportError } from './import.js';
import { MineruClient } from './mineru.js';
import { APP_INFO } from '../lib/version.js';

export const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));
const DEFAULT_DB = fileURLToPath(new URL('../workspace/lymbell.sqlite', import.meta.url));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/**
 * 宿主前缀下的路径 → 本服务认识的路径。
 *
 * 宿主把 `/api/lymphoma-workbench/**` 整段转给我们，内部要保持原来的 `/api/*` 形状，
 * 否则几十处路由判断全得改。规则只有三条（与乳腺/卵巢同款）：
 *
 * | 宿主来的路径 | 改写后 | 说明 |
 * | --- | --- | --- |
 * | `<base>` 或 `<base>/` | `/index.html` | iframe 的 src 就是这里 |
 * | `<base>/ui/xxx` | `/xxx` | 静态资源（style.css、app.js、图片） |
 * | `<base>/api/xxx` | `/api/xxx` | 接口，形状与独立启动时完全一致 |
 *
 * 独立启动时 `base` 为空串，原样返回，行为不变。
 */
export function stripBasePath(pathname, base = '') {
  const path = String(pathname ?? '/');
  if (!base || !path.startsWith(base)) return path;
  const rest = path.slice(base.length);
  if (!rest || rest === '/') return '/index.html';
  if (rest === '/ui') return '/index.html';
  if (rest.startsWith('/ui/')) return rest.slice(3);
  return rest;
}

/** Token 只留掩码：前 3 位 + •••• + 后 4 位。明文不落库、不回显。 */
export function maskToken(token) {
  const s = String(token ?? '').trim();
  if (s.length <= 8) return '····';
  return `${s.slice(0, 3)}····${s.slice(-4)}`;
}

export function createWorkbenchServer({
  dbPath = DEFAULT_DB,
  kbPath,
  publicDir = PUBLIC_DIR,
  seed = true,
  today = () => todayISO(),
  /** 宿主给的前缀；独立启动时为空串。 */
  basePath = '',
  /** 注入页面的接口基址，**不含 `/api`**（接口路径自带 `/api`）。 */
  apiBase = '',
  /** `standalone` | `host`，只影响页面里那一行运行形态提示。 */
  runtime = 'standalone',
  /** 用户选定资料目录后的回调（宿主用来记住位置）。 */
  onWorkspace = null,
} = {}) {
  // 前端调用形如 `${apiBase}/api/xxx`，基址里不能再含 /api
  const pageApiBase = apiBase || basePath;
  const pageRuntime = runtime === 'host' ? 'host' : 'standalone';
  const notifyWorkspace = typeof onWorkspace === 'function' ? onWorkspace : null;
  let db = openDb(dbPath);
  let kb = null;
  try {
    kb = openKb(kbPath);
  } catch {
    kb = null; // 知识库不是必需：分型库与试验线索会显示为空，不假装接入
  }
  if (seed) seedIfEmpty(db);

  let store = createStore(db, { kb, today, dbPath });
  const imports = createImportService(store, { today });
  const root = resolve(publicDir);
  const dbDir = dirname(resolve(dbPath));

  /* 原件存放：优先资料目录 <root>/imports；没选目录就落库目录旁边，不猜别的位置。 */
  const importsDir = () => {
    const base = store.workspace().root ? join(store.workspace().root, 'imports') : join(dbDir, 'imports');
    mkdirSync(base, { recursive: true });
    return base;
  };

  /* 会话 ↔ 选址/档案绑定（Desktop 1.2.2）：数据根目录一份 JSON，Desktop 与本机模式共用。 */
  const sessionProjectsPath = join(dbDir, '.desktop-session-projects.json');
  const readSessionProjects = () => {
    try {
      const parsed = JSON.parse(readFileSync(sessionProjectsPath, 'utf8'));
      return { sessions: parsed.sessions ?? {}, recent: parsed.recent ?? null };
    } catch {
      return { sessions: {}, recent: null }; // 文件不存在/损坏都从空开始，不带着坏状态跑
    }
  };
  const writeSessionProjects = (data) => {
    mkdirSync(dbDir, { recursive: true });
    writeFileSync(sessionProjectsPath, `${JSON.stringify(data, null, 2)}\n`);
    return readSessionProjects();
  };

  async function readBody(req) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    if (!chunks.length) return {};
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw Object.assign(new Error('请求体不是合法 JSON'), { status: 400 });
    }
  }

  const json = (res, code, data) => {
    const body = JSON.stringify(data);
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) });
    res.end(body);
  };

  const routes = {
    /* ---------------- 读 ---------------- */
    'GET /api/bootstrap': async ({ url }) => {
      const pid = url.searchParams.get('profile') || undefined;
      const boot = store.bootstrap(pid);
      return { ...boot, app: { ...APP_INFO, displayVersion: APP_INFO.displayVersion }, db: kb ? kb.stats() : null };
    },

    /* ---------------- 工作区 ---------------- */
    'POST /api/workspace': async ({ body }) => {
      const patch = {};
      if (body.root !== undefined && body.root !== null && String(body.root).trim() !== '') {
        const v = validateWorkspacePath(body.root);
        patch.root = v.path;
      } else if (body.root !== undefined) {
        patch.root = null; // 显式清空
      }
      if (body.consent !== undefined) patch.consent = Boolean(body.consent);
      const saved = store.setWorkspace(patch);
      // 宿主据此记住位置（重启后恢复）；独立启动时没有回调，什么都不做
      if (notifyWorkspace && patch.root) notifyWorkspace(patch.root);
      return saved;
    },

    'POST /api/workspace/token': async ({ body }) => {
      const t = String(body.token ?? '').trim();
      return store.setWorkspace(t
        ? { tokenMasked: maskToken(t), tokenSource: '本机填写' }
        : { tokenMasked: null, tokenSource: 'none' });
    },

    /* ---------------- 本人记录 ---------------- */
    'POST /api/questions': ({ body }) => store.addQuestion({
      profileId: body.profileId, text: body.text, kind: body.kind ?? 'fact',
    }),
    'POST /api/questions/select': ({ body }) => store.setQuestionSelected(body.id, Boolean(body.selected)),
    'POST /api/viewpoints': ({ body }) => store.addViewpoint({
      profileId: body.profileId, text: body.text, role: body.role ?? 'patient', isPrivate: body.isPrivate !== false,
    }),
    'POST /api/tasks': ({ body }) => store.addTask({
      profileId: body.profileId, dueOn: body.dueOn, title: body.title, note: body.note ?? '',
    }),
    'POST /api/tasks/done': ({ body }) => store.setTaskDone(body.id, Boolean(body.done)),

    /* ---------------- 日志 ---------------- */
    'POST /api/logs/fever': ({ body }) => store.addFeverLog({
      profileId: body.profileId, happenedOn: body.happenedOn,
      tempC: body.tempC === null || body.tempC === undefined || body.tempC === '' ? null : Number(body.tempC),
      anc: body.anc ?? null, note: body.note ?? '',
    }),
    'POST /api/logs/symptom': ({ body }) => store.addSymptomLog({
      profileId: body.profileId, happenedOn: body.happenedOn, term: body.term,
      grade: body.grade ?? null, note: body.note ?? '',
    }),
    'POST /api/logs/nutrition': ({ body }) => store.addNutritionLog({
      profileId: body.profileId, happenedOn: body.happenedOn, kind: body.kind ?? 'intake', note: body.note ?? '',
    }),
    'POST /api/logs/weight': ({ body }) => store.addWeight({
      profileId: body.profileId, happenedOn: body.happenedOn, kg: body.kg, note: body.note ?? '',
    }),

    /* ---------------- 治疗 ---------------- */
    'POST /api/cycles': ({ body }) => store.addCycle({
      profileId: body.profileId, actualOn: body.actualOn, doseAdjust: body.doseAdjust ?? null, note: body.note ?? null,
    }),
    'POST /api/lines': ({ body }) => store.addTreatmentLine({
      profileId: body.profileId, regimenName: body.regimenName, startedOn: body.startedOn, intent: body.intent ?? 'curative',
    }),
    'POST /api/consultations': ({ body }) => store.addConsultation({
      profileId: body.profileId, happenedOn: body.happenedOn, hospital: body.hospital ?? '',
      conclusionKind: body.conclusionKind ?? 'pending', conclusionText: body.conclusionText ?? '',
    }),

    /* ---------------- 试验线索 ---------------- */
    'POST /api/trials/save': ({ body }) => store.saveTrial({ profileId: body.profileId, trialKey: body.trialKey }),
    'POST /api/trials/unsave': ({ body }) => store.unsaveTrial({ profileId: body.profileId, trialKey: body.trialKey }),

    /* ---------------- 导出（A23 / A24） ---------------- */
    'POST /api/export/preview': ({ body }) => {
      const prep = store.exportPrep(body.profileId);
      return { markdown: prep.markdown, count: prep.count, facts: prep.facts, views: prep.views, filename: prep.filename };
    },
    'POST /api/export/file': ({ body }) => store.exportPrepFile(body.profileId),

    /* ---------------- 备份与恢复（M4） ---------------- */
    'POST /api/backup': () => store.backup(),
    'GET /api/backups': () => ({ items: store.backups() }),
    'POST /api/restore': ({ body }) => {
      const done = store.restore(body.file);
      // 文件已经换掉，句柄必须重开，否则后续读写会打到旧库
      db.close();
      db = openDb(dbPath);
      if (seed) seedIfEmpty(db);
      store = createStore(db, { kb, today, dbPath });
      return done;
    },

    /* ---------------- 报告导入与草稿核对（M2 第二段，A2） ---------------- */
    'GET /api/imports': ({ url }) => imports.draftFor(url.searchParams.get('profile')),
    'POST /api/import': async ({ body }) => {
      const buf = Buffer.from(String(body.dataBase64 ?? ''), 'base64');
      if (!buf.length) throw Object.assign(new ImportError('EMPTY_FILE', '文件内容为空'), { status: 400 });
      if (buf.length > imports.maxBytes) {
        throw Object.assign(new ImportError('TOO_LARGE', `文件超过上限（${Math.round(imports.maxBytes / 1024 / 1024)} MB）`), { status: 413 });
      }
      const sha = createHash('sha256').update(buf).digest('hex');
      // 先按 (profile, sha256) 判重：重复导入不重复落盘，也不重置解析状态
      const existing = store.db
        .prepare('SELECT id FROM import_file WHERE profile_id = ? AND sha256 = ?')
        .get(body.profileId, sha);
      if (existing) return imports.importFile({ profileId: body.profileId, filename: body.filename, sha256: sha, storagePath: 'imports/x', reportDate: body.reportDate ?? null });
      const ext = (/\.([A-Za-z0-9]{1,8})$/.exec(String(body.filename ?? ''))?.[1] ?? 'bin').toLowerCase();
      const rel = `${sha.slice(0, 16)}.${ext}`;
      const dir = importsDir();
      writeFileSync(join(dir, rel), buf);
      return imports.importFile({
        profileId: body.profileId,
        filename: basename(String(body.filename ?? '原件')),
        sha256: sha,
        storagePath: rel,
        mime: body.mime ?? null,
        bytes: buf.length,
        reportDate: body.reportDate ?? null,
      });
    },
    'POST /api/parse': async ({ body }) => {
      if (!store.workspace().consent) {
        throw Object.assign(new ImportError('CONSENT_REQUIRED', '先在「设置 → 文档解析」勾选同意，文件才会被上传到云端'), { status: 403 });
      }
      const file = store.db.prepare('SELECT * FROM import_file WHERE id = ?').get(body.importId);
      if (!file) throw Object.assign(new ImportError('NO_IMPORT', `原件不存在：${body.importId}`), { status: 404 });
      const dir = importsDir();
      const abs = resolve(dir, file.storage_path);
      if (!abs.startsWith(dir + sep) || !existsSync(abs)) {
        throw Object.assign(new ImportError('NO_FILE', '原件文件不在了（资料目录可能被移动）；重新导入一次即可'), { status: 409 });
      }
      return imports.parseWithMineru({ importId: body.importId, bytes: readFileSync(abs), client: new MineruClient() });
    },
    'POST /api/candidates/decide': ({ body }) => imports.decideCandidate({
      candidateId: body.candidateId, action: body.action, occurredOn: body.occurredOn ?? null,
    }),
    'POST /api/candidates/accept-all': ({ body }) => imports.acceptFileCandidates({
      importId: body.importId, occurredOn: body.occurredOn ?? null,
    }),

    /* ---------------- 原生 Agent 会话绑定（Desktop 1.2.2） ---------------- */
    'GET /api/agent/session-projects': () => readSessionProjects(),
    'POST /api/agent/session-projects': ({ body }) => {
      const data = readSessionProjects();
      if (body.sessionId && body.projectId) {
        data.sessions = { ...data.sessions, [String(body.sessionId)]: String(body.projectId) };
      }
      if (body.recent !== undefined) data.recent = body.recent; // {projectId} 或 null
      return writeSessionProjects(data);
    },
  };

  /**
   * 把页面里的两个占位换成实际值（`{{WB_API_BASE}}` / `{{WB_RUNTIME}}`）。
   * 前端因此不用判断自己跑在哪：接口基址由服务端给，运行形态也由服务端给。
   */
  function renderPage(html) {
    return html
      .split('{{WB_API_BASE}}').join(pageApiBase)
      .split('{{WB_RUNTIME}}').join(pageRuntime);
  }

  async function handle(req, res) {
    const raw = new URL(req.url ?? '/', 'http://127.0.0.1');
    // 宿主不剥前缀，这里剥；独立启动时 basePath 为空串，行为完全不变
    const url = basePath
      ? new URL(`${stripBasePath(raw.pathname, basePath)}${raw.search}`, 'http://127.0.0.1')
      : raw;

    if (url.pathname.startsWith('/api/')) {
      const key = `${req.method} ${url.pathname}`;
      const route = routes[key];
      if (!route) return json(res, 404, { error: `没有这个接口：${key}` });
      try {
        const body = req.method === 'POST' ? await readBody(req) : {};
        const data = await route({ url, body, req });
        return json(res, 200, data ?? { ok: true });
      } catch (e) {
        return json(res, e.status ?? 400, { error: e.message });
      }
    }

    /* Desktop 桥接模块：直接服务 lib/bridge.js（浏览器以 ESM 引入）。
       注意与 lib/client.js 分工：后者是宿主加载的客户端入口（__ModuleLoader__ 包装），
       不是 ESM，不能给页面 import。 */
    if (url.pathname === '/bridge.js') {
      try {
        const buf = await readFile(resolve(publicDir, '..', 'lib', 'bridge.js'));
        res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'content-length': buf.length, 'cache-control': 'no-cache' });
        return res.end(buf);
      } catch {
        return json(res, 404, { error: '找不到 lib/bridge.js' });
      }
    }

    /* 静态文件：只允许 publicDir 内，防目录穿越 */
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    const file = resolve(root, rel === '' ? 'index.html' : rel);
    if (file !== root && !file.startsWith(root + sep)) return json(res, 403, { error: '越出静态目录' });
    try {
      const st = await stat(file);
      const target = st.isDirectory() ? join(file, 'index.html') : file;
      const type = MIME[extname(target)] ?? 'application/octet-stream';
      let buf = await readFile(target);
      if (type.startsWith('text/html')) buf = Buffer.from(renderPage(buf.toString('utf8')), 'utf8');
      res.writeHead(200, {
        'content-type': type,
        'content-length': buf.length,
        'cache-control': 'no-cache',
      });
      return res.end(buf);
    } catch {
      // 单页应用：未知路径回到首页，由前端按 hash 渲染
      try {
        let buf = await readFile(join(root, 'index.html'));
        buf = Buffer.from(renderPage(buf.toString('utf8')), 'utf8');
        res.writeHead(200, { 'content-type': MIME['.html'], 'content-length': buf.length });
        return res.end(buf);
      } catch {
        return json(res, 404, { error: '找不到页面文件（public/index.html）' });
      }
    }
  }

  return {
    handle,
    basePath,
    apiBase: pageApiBase,
    runtime: pageRuntime,
    db,
    kb,
    store,
    close() {
      if (kb) kb.close();
      db.close();
    },
    listen(port = 8788, host = '127.0.0.1') {
      const server = createServer(handle);
      return new Promise((ok) => server.listen(port, host, () => ok(server)));
    },
  };
}
