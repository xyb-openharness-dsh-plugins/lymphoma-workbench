/**
 * 业务库 store（M1）。
 *
 * 读：把库里的事实组装成界面要的形状（形状与原型一致，界面渲染函数不用改）。
 * 写：只增不覆盖；缺测写 NULL；事件日期不得未来（计划类除外）。
 *
 * 不做：预后评分、推荐、匹配度、因果判断。这些字段在库里不存在（见 SCHEMA-SPEC §7）。
 */
import { DatabaseSync } from 'node:sqlite';
import { migrate } from './migrate.js';
import { subtypeIdByCode } from './kb.js';
import { buildPrepMarkdown, exportFilename, writeExport } from './export.js';
import { createBackup, listBackups, restoreBackup } from './backup.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function todayISO(now = new Date()) {
  const d = new Date(now);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 事件日期：不得晚于今天。计划类字段（task.due_on、treatment_line.next_on）不要走这里。 */
export function assertNotFuture(value, today = todayISO(), field = '日期') {
  if (value === null || value === undefined || value === '') return null;
  if (!DATE_RE.test(String(value))) throw new Error(`${field} 必须是 YYYY-MM-DD，收到「${value}」`);
  if (String(value) > today) throw new Error(`${field} 不得晚于今天（${today}），收到「${value}」`);
  return String(value);
}

/** 计划日期：允许未来，但格式必须合法。 */
export function assertPlanDate(value, field = '日期') {
  if (value === null || value === undefined || value === '') return null;
  if (!DATE_RE.test(String(value))) throw new Error(`${field} 必须是 YYYY-MM-DD，收到「${value}」`);
  return String(value);
}

export function openDb(path, { runMigrate = true, now = () => new Date().toISOString() } = {}) {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  if (runMigrate) migrate(db, { now });
  return db;
}

/** 本地时间戳（YYYY-MM-DD HH:mm）。备份名与「上次备份」显示都用这个，避免一个 UTC 一个本地对不上。 */
export function localStamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 血象在导出里的固定顺序：先这三项，其余按库内顺序接在后面。 */
const BLOOD_ORDER = ['中性粒细胞', '血红蛋白', '血小板'];

const LINE_STATUS_CN = {
  planned: '待开始',
  active: '进行中',
  completed: '已完成',
  stopped: '已停止',
};

export function createStore(db, { today = todayISO, now = () => new Date().toISOString(), kb = null, dbPath = '' } = {}) {
  const q = (sql, ...args) => db.prepare(sql).all(...args);
  const one = (sql, ...args) => db.prepare(sql).get(...args) ?? null;
  const run = (sql, ...args) => db.prepare(sql).run(...args);

  const api = {
    db,
    today,

    /* ---------------- 读 ---------------- */

    profiles() {
      return q('SELECT * FROM v_profile_current ORDER BY id').map((p) => {
        const line = one(
          'SELECT * FROM treatment_line WHERE profile_id = ? ORDER BY line_no DESC LIMIT 1', p.id,
        );
        const cycles = line ? q('SELECT COUNT(*) AS n FROM cycle WHERE line_id = ?', line.id)[0].n : 0;
        const hasData = q('SELECT COUNT(*) AS n FROM metric_point WHERE profile_id = ?', p.id)[0].n > 0;
        return {
          id: p.id,
          name: p.name,
          initial: p.initial,
          age: p.age,
          subtype: p.subtype ?? '未记录分型',
          stage: p.stage ?? '未记录分期',
          plan: planLabel(line, cycles),
          phase: phaseLabel(line, cycles, today()),
          tag: p.tag ?? '',
          full: hasData,
          ww: !line,
          root: one('SELECT root_path FROM workspace WHERE id = 1')?.root_path ?? '',
        };
      });
    },

    /** 界面一次拿全的启动数据。形状与原型 state 一致，界面渲染函数不改。 */
    bootstrap(profileId) {
      const profiles = api.profiles();
      const pid = profileId && profiles.some((p) => p.id === profileId) ? profileId : profiles[0]?.id;
      if (!pid) throw new Error('库里没有档案；先跑 npm run db:seed');

      return {
        profileId: pid,
        profiles,
        cats: api.categories(),
        metrics: api.metrics(pid),
        treatments: api.treatments(pid),
        dataStart: api.dataStart(pid),
        dataEnd: today(),
        subtypeTree: api.subtypeTree(pid),
        ihc: api.markers(pid, 'IHC'),
        fish: api.markers(pid, 'FISH'),
        lesions: api.lesions(pid),
        cycles: api.cycles(pid),
        pets: api.responses(pid),
        aes: api.adverseEvents(pid),
        trials: api.trials(pid),
        subtypes: kb ? kb.library() : [],
        docs: api.documents(pid),
        candidates: [],
        questions: api.questions(pid),
        viewpoints: api.viewpoints(pid, { includePrivate: true }),
        tasks: api.tasks(pid),
        labs: api.labResults(pid),
        infections: api.infectionScreens(pid),
        savings: api.fertilityNotes(pid),
        fertilityNodes: api.fertilityMilestones(pid),
        flows: api.flows(pid),
        savedTrials: api.savedTrialsWithDetail(pid),
        cfg: api.workspace(),
      };
    },

    categories() {
      const rows = q('SELECT category, color FROM metric_def ORDER BY ordinal, code');
      const seen = [];
      for (const r of rows) if (!seen.some((s) => s[0] === r.category)) seen.push([r.category, r.color]);
      return seen;
    },

    metrics(profileId) {
      const out = {};
      for (const d of q('SELECT * FROM metric_def ORDER BY ordinal, code')) {
        out[d.code] = {
          name: d.name, unit: d.unit ?? '', cat: d.category, color: d.color,
          dec: d.decimals, note: d.note ?? '', numeric: d.is_numeric === 1, points: [],
        };
      }
      const pts = q(
        'SELECT code, measured_on, value_num, value_text, source_text FROM metric_point ' +
        'WHERE profile_id = ? ORDER BY code, measured_on', profileId,
      );
      for (const p of pts) {
        if (!out[p.code]) continue;
        out[p.code].points.push({
          d: p.measured_on,
          v: p.value_num,
          text: p.value_text ?? null,
          src: p.source_text ?? '',
        });
      }
      return out;
    },

    /** 一图秀的时间轴条：周期在上两行，评估节点单独一行。 */
    treatments(profileId) {
      const out = [];
      for (const c of q(
        `SELECT c.n, c.planned_on, c.planned_to, c.actual_on, c.actual_to
         FROM cycle c JOIN treatment_line l ON l.id = c.line_id
         WHERE l.profile_id = ? ORDER BY l.line_no, c.n`, profileId,
      )) {
        const from = c.actual_on || c.planned_on;
        const to = c.actual_to || c.planned_to || from;
        if (!from) continue;
        out.push({
          id: `c${c.n}`, kind: 'chemo', label: String(c.n), long: `第 ${c.n} 周期`,
          from, to, color: '#7c5cbf', actual: Boolean(c.actual_on),
        });
      }
      for (const r of q(
        `SELECT r.id, r.timepoint, r.assessed_on, r.deauville
         FROM response r JOIN treatment_line l ON l.id = r.line_id
         WHERE l.profile_id = ? ORDER BY r.assessed_on`, profileId,
      )) {
        if (!r.assessed_on) continue;
        const end = /结束|end/i.test(String(r.timepoint ?? ''));
        out.push({
          id: `r${r.id}`,
          kind: end ? 'surgery' : 'mark',
          label: shortTimepoint(r.timepoint),
          long: r.deauville ? `Deauville ${r.deauville}` : '未记分数',
          from: r.assessed_on, to: r.assessed_on,
          color: end ? '#2f6f66' : '#c2551f', actual: true,
        });
      }
      return out;
    },

    dataStart(profileId) {
      const rows = q(
        `SELECT MIN(d) AS d FROM (
           SELECT MIN(measured_on) AS d FROM metric_point WHERE profile_id = ?
           UNION ALL SELECT MIN(started_on) FROM treatment_line WHERE profile_id = ?
         ) WHERE d IS NOT NULL`, profileId, profileId,
      );
      const d = rows[0]?.d;
      return d ? `${d.slice(0, 7)}-01` : today();
    },

    subtypeTree(profileId) {
      const a = one('SELECT lineage, name_zh, name_en, abbr FROM subtype_assertion WHERE profile_id = ? AND is_current = 1', profileId);
      if (!a) return [];
      const lv1 = a.lineage === 'H' ? '霍奇金淋巴瘤 (HL)' : '非霍奇金淋巴瘤 (NHL)';
      const lv2 = { B: '成熟 B 细胞肿瘤', T: '成熟 T 和 NK 细胞肿瘤', H: '经典型霍奇金淋巴瘤' }[a.lineage] ?? '';
      return [
        { lv: 1, name: lv1 },
        { lv: 2, name: lv2 },
        { lv: 3, name: a.name_zh },
        { lv: 4, name: `${a.name_zh}${a.abbr ? ` · ${a.abbr}` : ''}`, on: true },
      ];
    },

    markers(profileId, panel) {
      return q(
        'SELECT marker, result_text, comment FROM pathology_marker WHERE profile_id = ? AND panel = ? ORDER BY ordinal, id',
        profileId, panel,
      ).map((r) => [r.marker, r.result_text ?? '', r.comment ?? '']);
    },

    lesions(profileId) {
      return q(
        'SELECT site, long_axis_mm, suvmax, source_document_id FROM lesion WHERE profile_id = ? AND is_baseline = 1 ORDER BY ordinal, id',
        profileId,
      ).map((r) => ({
        site: r.site,
        size: r.long_axis_mm === null ? '—' : `${cm(r.long_axis_mm)} cm`,
        suv: r.suvmax === null ? '—' : String(r.suvmax),
        src: r.source_document_id ?? '',
      }));
    },

    cycles(profileId) {
      return q(
        `SELECT c.n, c.planned_on, c.actual_on, c.delay_days, c.dose_adjust, c.note
         FROM cycle c JOIN treatment_line l ON l.id = c.line_id
         WHERE l.profile_id = ? ORDER BY l.line_no, c.n`, profileId,
      ).map((c) => ({
        n: c.n,
        plan: c.planned_on ? c.planned_on.slice(5) : '—',
        real: c.actual_on ? c.actual_on.slice(5) : '—',
        delay: c.delay_days ? `+${c.delay_days} 天` : '—',
        adjust: c.dose_adjust ?? '足量',
        note: c.note ?? '—',
      }));
    },

    responses(profileId) {
      return q(
        `SELECT r.timepoint, r.assessed_on, r.deauville, r.lesion_mm, r.conclusion_text, r.clinician_label
         FROM response r JOIN treatment_line l ON l.id = r.line_id
         WHERE l.profile_id = ? ORDER BY r.assessed_on`, profileId,
      ).map((r) => ({
        d: r.assessed_on ?? '',
        when: r.timepoint ?? '',
        dv: r.deauville,
        size: r.lesion_mm === null ? '—' : `${cm(r.lesion_mm)} cm`,
        result: r.conclusion_text ?? '',
        src: r.clinician_label ?? '报告原文',
      }));
    },

    adverseEvents(profileId) {
      return q(
        'SELECT happened_on, term, ctcaegrade, note, source_document_id FROM adverse_event WHERE profile_id = ? ORDER BY happened_on, ordinal',
        profileId,
      ).map((r) => ({
        d: r.happened_on ?? '', name: r.term, grade: r.ctcaegrade,
        note: r.note ?? '', src: r.source_document_id ?? '',
      }));
    },

    documents(profileId) {
      return q('SELECT id, name, doc_type, reported_on, status FROM document WHERE profile_id = ? ORDER BY reported_on', profileId)
        .map((d) => ({ id: d.id, name: d.name, date: d.reported_on ?? '', type: d.doc_type ?? '', status: d.status === 'reviewed' ? '已核对' : '待核对' }));
    },

    questions(profileId) {
      return q('SELECT id, created_on, text, kind, selected, source_text FROM question WHERE profile_id = ? ORDER BY ordinal, id', profileId)
        .map((r) => ({
          id: r.id, text: r.text, source: r.source_text ?? '',
          selected: r.selected === 1, kind: r.kind, createdOn: r.created_on ?? null,
        }));
    },

    viewpoints(profileId, { includePrivate = false } = {}) {
      const sql = includePrivate
        ? 'SELECT id, recorded_on, role, text, is_private FROM viewpoint WHERE profile_id = ? ORDER BY recorded_on, id'
        : 'SELECT id, recorded_on, role, text, is_private FROM viewpoint WHERE profile_id = ? AND is_private = 0 ORDER BY recorded_on, id';
      return q(sql, profileId).map((r) => ({ id: r.id, d: r.recorded_on, text: r.text, role: r.role }));
    },

    tasks(profileId) {
      return q('SELECT id, due_on, title, note, done FROM task WHERE profile_id = ? ORDER BY due_on, id', profileId)
        .map((r) => ({ id: r.id, date: r.due_on, title: r.title, note: r.note ?? '', done: r.done === 1 }));
    },

    labResults(profileId) {
      return q('SELECT measured_on, item, value_text, unit, ref_range, source_text FROM lab_result WHERE profile_id = ? ORDER BY measured_on DESC, item', profileId)
        .map((r) => ({ d: r.measured_on, item: r.item, v: r.value_text ?? '', unit: r.unit ?? '', ref: r.ref_range ?? '', src: r.source_text ?? '' }));
    },

    infectionScreens(profileId) {
      return q('SELECT measured_on, item, result_text, note, source_text FROM infection_screen WHERE profile_id = ? ORDER BY measured_on, id', profileId)
        .map((r) => ({ d: r.measured_on, item: r.item, v: r.result_text ?? '', note: r.note ?? '', src: r.source_text ?? '' }));
    },

    fertilityNotes(profileId) {
      return q('SELECT happened_on, title, detail, status FROM fertility_note WHERE profile_id = ? ORDER BY happened_on', profileId)
        .map((r) => ({ d: r.happened_on, title: r.title, detail: r.detail ?? '', status: r.status ?? '已咨询' }));
    },

    /** 试验线索：只回答"登记了什么"，不排序、不评分、不判断能不能入组。 */
    trials(profileId, { limit = 3 } = {}) {
      if (!kb) return [];
      const id = api.subtypeId(profileId);
      return id ? kb.trialsBySubtype(id, { limit }) : [];
    },

    /** 当前分型 → 知识库 subtype.id。取不到返回 null，不猜。 */
    subtypeId(profileId) {
      const a = one('SELECT abbr, name_zh FROM subtype_assertion WHERE profile_id = ? AND is_current = 1', profileId);
      return a ? subtypeIdByCode(a.abbr ?? '', a.name_zh) : null;
    },

    /**
     * 按当前分型的流程（通用在前，专属在后）。
     * 只是"指南里通常怎么走"的抄录，不是给本人排的方案；界面必须写明未逐条核对。
     */
    flows(profileId) {
      if (!kb) return [];
      const id = api.subtypeId(profileId);
      return id ? kb.flows(id) : kb.flows(null);
    },

    workspace() {
      const w = one('SELECT * FROM workspace WHERE id = 1');
      const files = q('SELECT COUNT(*) AS n FROM document')[0].n;
      return {
        root: w?.root_path ?? '',
        size: { doc: 0, derived: 0, db: files },
        backupAt: w?.backup_at ?? '—',
        consent: (w?.consent_mineru ?? 0) === 1,
        tokenMasked: w?.token_masked ?? '',
        tokenSrc: w?.token_source ?? 'none',
        dbStatus: kb ? '已接入' : '未接入',
        dbChecked: w?.updated_at ?? '—',
      };
    },

    /* ---------------- 写 ---------------- */

    setWorkspace(patch) {
      const cur = one('SELECT * FROM workspace WHERE id = 1');
      const next = {
        root_path: patch.root ?? cur?.root_path ?? null,
        consent_mineru: patch.consent === undefined ? (cur?.consent_mineru ?? 0) : (patch.consent ? 1 : 0),
        token_masked: patch.tokenMasked ?? cur?.token_masked ?? null,
        token_source: patch.tokenSource ?? cur?.token_source ?? 'none',
        backup_at: patch.backupAt ?? cur?.backup_at ?? null,
        created_at: cur?.created_at ?? now(),
        updated_at: now(),
      };
      run(`INSERT INTO workspace (id, root_path, consent_mineru, token_masked, token_source, backup_at, created_at, updated_at)
           VALUES (1, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET root_path=excluded.root_path, consent_mineru=excluded.consent_mineru,
             token_masked=excluded.token_masked, token_source=excluded.token_source,
             backup_at=excluded.backup_at, updated_at=excluded.updated_at`,
        next.root_path, next.consent_mineru, next.token_masked, next.token_source, next.backup_at, next.created_at, next.updated_at);
      return api.workspace();
    },

    addQuestion({ profileId, text, kind = 'fact', source = '本人添加' }) {
      const body = String(text ?? '').trim();
      if (!body) throw new Error('问题内容为空，未保存');
      if (!['fact', 'view'].includes(kind)) throw new Error(`问题类型只能是 fact / view，收到 ${kind}`);
      const info = run(
        'INSERT INTO question (profile_id, created_on, text, kind, selected, source_text, ordinal) VALUES (?, ?, ?, ?, 1, ?, ?)',
        profileId, assertNotFuture(today(), today(), '记录日期'), body, kind, source,
        q('SELECT COALESCE(MAX(ordinal), 0) + 1 AS n FROM question WHERE profile_id = ?', profileId)[0].n,
      );
      return { id: info.lastInsertRowid, ...api.questions(profileId).slice(-1)[0] };
    },

    setQuestionSelected(id, selected) {
      run('UPDATE question SET selected = ? WHERE id = ?', selected ? 1 : 0, id);
      return { id, selected: Boolean(selected) };
    },

    addViewpoint({ profileId, text, role = 'patient', isPrivate = true }) {
      const body = String(text ?? '').trim();
      if (!body) throw new Error('内容为空，未保存');
      if (!['patient', 'caregiver'].includes(role)) throw new Error(`role 只能是 patient / caregiver，收到 ${role}`);
      const info = run(
        'INSERT INTO viewpoint (profile_id, recorded_on, role, text, is_private) VALUES (?, ?, ?, ?, ?)',
        profileId, assertNotFuture(today(), today(), '记录日期'), role, body, isPrivate ? 1 : 0,
      );
      return { id: info.lastInsertRowid, d: today(), text: body, role };
    },

    addTask({ profileId, dueOn, title, note = '' }) {
      const t = String(title ?? '').trim();
      if (!t) throw new Error('待办标题为空，未保存');
      const info = run('INSERT INTO task (profile_id, due_on, title, note, done) VALUES (?, ?, ?, ?, 0)',
        profileId, assertPlanDate(dueOn, '计划日期'), t, note);
      return { id: info.lastInsertRowid, date: dueOn, title: t, note, done: false };
    },

    setTaskDone(id, done) {
      run('UPDATE task SET done = ?, done_on = ? WHERE id = ?', done ? 1 : 0, done ? today() : null, id);
      return { id, done: Boolean(done) };
    },

    /** 新治疗线：线号自动取当前最大 +1，方案与周期各自独立（D24）。 */
    addTreatmentLine({ profileId, regimenName, startedOn, intent = 'curative' }) {
      const name = String(regimenName ?? '').trim();
      if (!name) throw new Error('方案名为空，未保存');
      if (!['curative', 'maintenance', 'salvage', 'palliative'].includes(intent)) {
        throw new Error(`治疗目的只能是 curative / maintenance / salvage / palliative，收到 ${intent}`);
      }
      const next = q('SELECT COALESCE(MAX(line_no), 0) + 1 AS n FROM treatment_line WHERE profile_id = ?', profileId)[0].n;
      const info = run(
        'INSERT INTO treatment_line (profile_id, line_no, regimen_name, intent, status, started_on) VALUES (?, ?, ?, ?, ?, ?)',
        profileId, next, name, intent, 'active', assertNotFuture(startedOn || today(), today(), '开始日期'),
      );
      return { id: info.lastInsertRowid, lineNo: next, regimenName: name };
    },

    /** 记一次给药：挂在当前进行中的治疗线上，周期号自动递增。 */
    addCycle({ profileId, actualOn, doseAdjust = null, note = null }) {
      const line = one(`SELECT * FROM treatment_line WHERE profile_id = ? AND status = 'active' ORDER BY line_no DESC LIMIT 1`, profileId);
      if (!line) throw new Error('没有进行中的治疗线；先在「治疗历程」里记一条新治疗线');
      const day = assertNotFuture(actualOn, today(), '给药日期');
      const n = q('SELECT COALESCE(MAX(n), 0) + 1 AS n FROM cycle WHERE line_id = ?', line.id)[0].n;
      const info = run(
        'INSERT INTO cycle (line_id, n, planned_on, planned_to, actual_on, actual_to, delay_days, delay_reason, dose_adjust, note) VALUES (?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)',
        line.id, n, day, day, day, day, doseAdjust, note,
      );
      return { id: info.lastInsertRowid, lineNo: line.line_no, n };
    },

    addConsultation({ profileId, happenedOn, hospital = '', conclusionKind = 'pending', conclusionText = '' }) {
      const info = run(
        'INSERT INTO consultation (profile_id, happened_on, hospital, conclusion_kind, conclusion_text) VALUES (?, ?, ?, ?, ?)',
        profileId, assertNotFuture(happenedOn, today(), '会诊日期'), hospital, conclusionKind, conclusionText,
      );
      return { id: info.lastInsertRowid };
    },

    /** 体重：走 metric_point，与一图秀同源。 */
    addWeight({ profileId, happenedOn, kg, note = '' }) {
      const v = Number(kg);
      if (!Number.isFinite(v)) throw new Error('体重不是数字，未保存');
      const day = assertNotFuture(happenedOn, today(), '日期');
      const info = run(
        'INSERT INTO metric_point (profile_id, code, measured_on, value_num, value_text, source_text, method) VALUES (?, ?, ?, ?, ?, ?, NULL)',
        profileId, 'wt', day, v, null, note || '本人记录',
      );
      return { id: info.lastInsertRowid, code: 'wt', measuredOn: day, value: v };
    },

    addFeverLog({ profileId, happenedOn, tempC = null, anc = null, note = '', source = '本人记录' }) {
      const info = run(
        'INSERT INTO fever_log (profile_id, happened_on, temp_c, anc, note, source_text) VALUES (?, ?, ?, ?, ?, ?)',
        profileId, assertNotFuture(happenedOn, today(), '发生日期'), tempC, anc, note, source,
      );
      return { id: info.lastInsertRowid };
    },

    addSymptomLog({ profileId, happenedOn, term, grade = null, status = '', note = '', source = '本人记录' }) {
      const t = String(term ?? '').trim();
      if (!t) throw new Error('症状名称为空，未保存');
      const info = run(
        'INSERT INTO symptom_log (profile_id, happened_on, term, grade, status, note, source_text) VALUES (?, ?, ?, ?, ?, ?, ?)',
        profileId, assertNotFuture(happenedOn, today(), '发生日期'), t, grade, status, note, source,
      );
      return { id: info.lastInsertRowid };
    },

    addNutritionLog({ profileId, happenedOn, kind, note = '', source = '本人记录' }) {
      if (!['intake', 'taste', 'oral'].includes(kind)) throw new Error(`营养记录类型只能是 intake / taste / oral，收到 ${kind}`);
      const info = run(
        'INSERT INTO nutrition_log (profile_id, happened_on, kind, note, source_text) VALUES (?, ?, ?, ?, ?)',
        profileId, assertNotFuture(happenedOn, today(), '发生日期'), kind, note, source,
      );
      return { id: info.lastInsertRowid };
    },

    saveTrial({ profileId, trialKey, note = '' }) {
      run('INSERT OR IGNORE INTO saved_trial (profile_id, trial_key, saved_on, note) VALUES (?, ?, ?, ?)',
        profileId, trialKey, today(), note);
      return { profileId, trialKey };
    },

    unsaveTrial({ profileId, trialKey }) {
      run('DELETE FROM saved_trial WHERE profile_id = ? AND trial_key = ?', profileId, trialKey);
      return { profileId, trialKey };
    },

    savedTrials(profileId) {
      return q('SELECT trial_key, saved_on, note FROM saved_trial WHERE profile_id = ? ORDER BY saved_on', profileId);
    },

    /** 收藏 + 登记信息。登记信息来自知识库，不在业务库复制一份。 */
    savedTrialsWithDetail(profileId) {
      const rows = api.savedTrials(profileId);
      // 知识库没接入时不知道登记信息，照实标 missing，不补内容
      if (!kb) return rows.map((r) => ({ trialKey: r.trial_key, savedOn: r.saved_on, note: r.note ?? '', missing: true }));
      return rows.map((r) => {
        const lead = kb.trialById(r.trial_key);
        return lead
          ? { ...lead, trialKey: r.trial_key, savedOn: r.saved_on, note: r.note ?? '' }
          : { trialKey: r.trial_key, savedOn: r.saved_on, note: r.note ?? '', missing: true };
      });
    },

    /* ---------------- 导出（A23 / A24） ---------------- */

    /** 生育节点（D23）：时间点，不做机构推荐。用于治疗历程关键节点。 */
    fertilityMilestones(profileId) {
      return api.fertilityNotes(profileId).map((n) => ({
        kind: 'fertility', title: `生育力保存 · ${n.title}`,
        detail: `${n.detail}${n.detail ? '；' : ''}是否进行由本人与医生决定。`,
        date: n.d,
      }));
    },

    /**
     * 生成导出内容。只含选入项；关键记录缺了写「未记录」，不补。
     * @returns {{ markdown: string, filename: string, count: number, keyRecords: Array }}
     */
    exportPrep(profileId) {
      const profile = api.profiles().find((p) => p.id === profileId) ?? null;
      const all = api.questions(profileId);
      const facts = all.filter((x) => x.selected && x.kind === 'fact').map((x) => ({ text: x.text, source: x.source }));
      const views = all.filter((x) => x.selected && x.kind === 'view').map((x) => ({ text: x.text, recordedOn: x.createdOn ?? null }));
      const keyRecords = api.keyRecords(profileId);
      const nextVisit = api.nextVisitOn(profileId);
      const t = today();
      const markdown = buildPrepMarkdown({ profile, facts, views, keyRecords, nextVisit, today: t });
      return {
        markdown, filename: exportFilename(t), count: facts.length + views.length,
        facts: facts.length, views: views.length, keyRecords, nextVisit, today: t,
      };
    },

    /** 落盘到资料目录 exports/。资料目录没设就报错，不猜路径。 */
    exportPrepFile(profileId) {
      const prep = api.exportPrep(profileId);
      const root = one('SELECT root_path FROM workspace WHERE id = 1')?.root_path;
      if (!root) throw new Error('还没设置资料目录；先在「设置 → 工作区」里选一个目录');
      const written = writeExport({ root, filename: prep.filename, text: prep.markdown });
      return { ...written, count: prep.count };
    },

    /** 关键记录：只抄库里的值，没有就写「未记录」。 */
    keyRecords(profileId) {
      const out = [];

      const a = one('SELECT name_zh, abbr, diagnosed_on FROM subtype_assertion WHERE profile_id = ? AND is_current = 1', profileId);
      out.push({
        label: '分型',
        value: a ? `${a.name_zh}${a.abbr ? `（${a.abbr}）` : ''}${a.diagnosed_on ? `，${a.diagnosed_on} 病理` : ''}` : '未记录',
      });

      const line = one(
        `SELECT l.regimen_name, l.line_no, l.status,
                (SELECT MAX(c.actual_on) FROM cycle c WHERE c.line_id = l.id) AS last_on
         FROM treatment_line l WHERE l.profile_id = ? ORDER BY l.line_no DESC LIMIT 1`, profileId,
      );
      out.push({
        label: '末次治疗',
        value: line
          ? `${line.regimen_name}（第 ${line.line_no} 线 · ${LINE_STATUS_CN[line.status] ?? line.status}）${line.last_on ? `，末次给药 ${line.last_on}` : ''}`
          : '未记录',
      });

      const r = one(
        `SELECT r.assessed_on, r.timepoint, r.deauville, r.clinician_label
         FROM response r JOIN treatment_line l ON l.id = r.line_id
         WHERE l.profile_id = ? ORDER BY r.assessed_on DESC LIMIT 1`, profileId,
      );
      out.push({
        label: '最近疗效评估',
        value: r
          ? `${r.assessed_on}${r.timepoint ? `（${r.timepoint}）` : ''}${r.deauville ? `，Deauville ${r.deauville}` : ''}${r.clinician_label ? `；${r.clinician_label}` : ''}`
          : '未记录',
      });

      // 血象按固定顺序写，避免每次导出顺序不一样；同一天的其他项排在这三项之后
      const labs = api.labResults(profileId);
      if (labs.length) {
        const day = labs[0].d;
        const same = labs.filter((x) => x.d === day);
        const order = BLOOD_ORDER.map((n) => same.find((x) => x.item === n)).filter(Boolean);
        const rest = same.filter((x) => !BLOOD_ORDER.includes(x.item));
        const shown = [...order, ...rest].slice(0, 5);
        out.push({
          label: '最近血象',
          value: `${day}，${shown.map((x) => `${x.item} ${x.v}${x.unit ? ` ${x.unit}` : ''}`).join(' / ')}`,
        });
      } else {
        out.push({ label: '最近血象', value: '未记录' });
      }

      return out;
    },

    /** 下次复诊：取最晚的一条 next_on。没有就返回 null，不编一个日期。 */
    nextVisitOn(profileId) {
      const row = one(
        'SELECT MAX(next_on) AS d FROM treatment_line WHERE profile_id = ? AND next_on IS NOT NULL', profileId,
      );
      return row?.d ?? null;
    },

    /* ---------------- 备份与恢复（M4） ---------------- */

    backup() {
      const w = one('SELECT root_path FROM workspace WHERE id = 1');
      if (!w?.root_path) throw new Error('还没设置资料目录；先在「设置 → 工作区」里选一个目录');
      const at = localStamp(); // 与备份文件名同一把尺子，显示与文件对得上
      const made = createBackup({ db, root: w.root_path, at });
      api.setWorkspace({ backupAt: at.slice(0, 16).replace('T', ' ') });
      return made;
    },

    backups() {
      const w = one('SELECT root_path FROM workspace WHERE id = 1');
      if (!w?.root_path) return [];
      return listBackups(w.root_path);
    },

    /** 恢复：只换文件。调用方需重新打开库，否则后续读写会打到旧句柄。 */
    restore(file) {
      const w = one('SELECT root_path FROM workspace WHERE id = 1');
      if (!w?.root_path) throw new Error('还没设置资料目录；先在「设置 → 工作区」里选一个目录');
      if (!dbPath) throw new Error('本实例的库路径未知，无法恢复（只有以文件路径启动的服务支持）');
      return restoreBackup({ root: w.root_path, dbPath, file, at: now() });
    },
  };

  return api;
}

/* ---------------- helpers ---------------- */

function cm(mm) {
  return (Number(mm) / 10).toFixed(1);
}

function shortTimepoint(tp) {
  const s = String(tp ?? '');
  if (/基线/i.test(s)) return '基线 PET';
  if (/中期/i.test(s)) return '中期 PET';
  if (/结束/i.test(s)) return '结束 PET';
  return s || '评估';
}

function planLabel(line, cycles) {
  if (!line) return '观察等待';
  const name = line.regimen_name ?? '未记录方案';
  const cn = LINE_STATUS_CN[line.status] ?? line.status;
  if (line.status === 'active' && line.intent === 'maintenance') return `${name}（${cn}）`;
  return cycles > 0 ? `${name} ×${cycles} ${cn}` : `${name}（${cn}）`;
}

function phaseLabel(line, cycles, today) {
  if (!line) return '观察等待 · 每 3 月随访';
  if (line.status === 'completed') return '结束治疗 · 随访中';
  if (line.intent === 'maintenance' && line.started_on) {
    return `维持治疗 · 第 ${Math.max(1, monthsBetween(line.started_on, today))} 月`;
  }
  if (line.status === 'active') return cycles > 0 ? `第 ${cycles} 周期后` : '治疗中';
  return '待开始';
}

function monthsBetween(from, to) {
  const a = new Date(`${from}T00:00:00Z`);
  const b = new Date(`${to}T00:00:00Z`);
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}
