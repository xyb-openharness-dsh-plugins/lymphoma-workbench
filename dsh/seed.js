/**
 * 演示数据（M1 的一部分，用于界面走查与 UI 一致性比对）。
 *
 * 事实来源：原型 prototypes/v0.1/app.js 的演示数据，逐条照抄，不改写、不补充。
 * 只有 p1（DEMO-1）有完整的指标序列；p2–p5 只有元数据，界面会明写"示例"，
 * 不假装五套画像都有完整数据。
 *
 * 用法：`npm run db:seed`（幂等：已有档案就跳过，除非 --force）。
 */
import { openDb } from './store.js';

const TODAY = '2026-10-17';

const METRIC_DEFS = [
  ['ldh', 'LDH', 'U/L', '肿瘤负荷', '#7c5cbf', 0, '同一实验室方法可比；升高不特指复发', 1, 1],
  ['lesion', '最大病灶长径', 'mm', '肿瘤负荷', '#a48ad6', 0, '同一部位、同一测量方式才可比', 2, 1],
  ['anc', '中性粒细胞', '10⁹/L', '血象', '#a03d5c', 1, '不同医院参考区间不合并', 3, 1],
  ['hgb', '血红蛋白', 'g/L', '血象', '#c2687f', 0, '输注后需标注', 4, 1],
  ['plt', '血小板', '10⁹/L', '血象', '#c98a9c', 0, '不同检测方法不合并', 5, 1],
  ['igg', 'IgG', 'g/L', '免疫与感染', '#2f6f66', 1, '利妥昔单抗后可能持续偏低', 6, 1],
  ['uric', '尿酸', 'μmol/L', '生化', '#9a6410', 0, '肿瘤溶解风险期需关注', 7, 1],
  ['crp', 'CRP', 'mg/L', '生化', '#b07c2a', 0, '感染与肿瘤均可升高', 8, 1],
  ['ctcae', 'CTCAE 最高分级', '级', '治疗毒性', '#c2551f', 0, '分类变量，不做趋势', 9, 0],
  ['wt', '体重', 'kg', '功能与体重', '#4a6fa5', 1, '单点不连线', 10, 1],
];

/** [code, 日期, 值, 来源] —— 与原型 METRICS 的 points 逐条对应 */
const METRIC_POINTS = [
  ['ldh', '2026-02-10', 380, '初诊生化'], ['ldh', '2026-02-18', 520, '确诊前复查'],
  ['ldh', '2026-03-02', 410, '第 1 周期前'], ['ldh', '2026-04-13', 260, '第 3 周期前'],
  ['ldh', '2026-05-18', 230, '中期评估'], ['ldh', '2026-07-20', 195, '结束评估'],
  ['ldh', '2026-10-09', 202, '随访复查'],
  ['lesion', '2026-02-20', 68, '基线 PET-CT'], ['lesion', '2026-05-18', 22, '中期 PET-CT'],
  ['lesion', '2026-07-20', 9, '结束 PET-CT'], ['lesion', '2026-10-09', 8, '随访 CT'],
  ['anc', '2026-02-18', 4.2, '治疗前血常规'], ['anc', '2026-03-12', 1.1, '第 1 周期后'],
  ['anc', '2026-04-02', 3.6, '第 2 周期前'], ['anc', '2026-04-25', 0.8, '第 3 周期后'],
  ['anc', '2026-05-18', 3.1, '中期评估'], ['anc', '2026-06-05', 1.0, '第 5 周期后'],
  ['anc', '2026-07-20', 3.8, '结束评估'], ['anc', '2026-10-09', 4.4, '随访复查'],
  ['hgb', '2026-02-18', 132, '治疗前血常规'], ['hgb', '2026-04-25', 98, '第 3 周期后'],
  ['hgb', '2026-07-20', 126, '结束评估'], ['hgb', '2026-10-09', 131, '随访复查'],
  ['plt', '2026-02-18', 210, '治疗前血常规'], ['plt', '2026-04-25', 88, '第 3 周期后'],
  ['plt', '2026-07-20', 198, '结束评估'], ['plt', '2026-10-09', 212, '随访复查'],
  ['igg', '2026-02-18', 9.2, '治疗前免疫球蛋白'], ['igg', '2026-05-18', 6.2, '中期评估'],
  ['igg', '2026-07-20', 5.8, '结束评估'], ['igg', '2026-10-09', 6.4, '随访复查'],
  ['uric', '2026-02-18', 468, '治疗前生化'], ['uric', '2026-03-05', 382, '第 1 周期中'],
  ['uric', '2026-07-20', 356, '结束评估'],
  ['crp', '2026-02-18', 28, '治疗前'], ['crp', '2026-04-27', 46, '发热住院期间'],
  ['crp', '2026-07-20', 4, '结束评估'], ['crp', '2026-10-09', 3, '随访复查'],
  ['wt', '2026-02-18', 72.0, '治疗前'], ['wt', '2026-04-25', 69.2, '第 3 周期后'],
  ['wt', '2026-07-20', 70.1, '结束评估'], ['wt', '2026-10-09', 71.3, '随访复查'],
];

const CYCLES = [
  [1, '2026-03-02', '2026-03-07', '2026-03-02', '2026-03-07', 0, null, null, '—'],
  [2, '2026-03-23', '2026-03-28', '2026-03-23', '2026-03-28', 0, null, null, '—'],
  [3, '2026-04-13', '2026-04-18', '2026-04-20', '2026-04-25', 7, '第 2 周期后发热性中性粒细胞减少，待血象恢复', null, '第 2 周期后发热性中性粒细胞减少，待血象恢复'],
  [4, '2026-05-04', '2026-05-09', '2026-05-04', '2026-05-09', 0, null, '长春新碱减量 25%', '手指麻木 1 级'],
  [5, '2026-05-25', '2026-05-30', '2026-05-25', '2026-05-30', 0, null, null, '—'],
  [6, '2026-06-15', '2026-06-20', '2026-06-15', '2026-06-20', 0, null, null, '末次给药'],
];

const RESPONSES = [
  ['基线', '2026-02-20', 5, 68, '多发高代谢淋巴结', '基线'],
  ['中期（第 4 周期后）', '2026-05-18', 3, 22, '代谢明显减低，高于纵隔、低于肝血池', '医生记录：PR（原文）'],
  ['结束治疗', '2026-07-20', 2, 9, '代谢低于纵隔，考虑完全代谢缓解', '医生记录：CR（原文）'],
];

const IHC = [
  ['CD20', '阳性（弥漫）', 'B 细胞来源'], ['CD3', '阴性', 'T 细胞标记'],
  ['CD10', '阴性', '生发中心标记'], ['MUM1', '阳性（约 70%）', '非生发中心表型'],
  ['BCL2', '阳性（约 80%）', ''], ['BCL6', '阳性（约 60%）', ''],
  ['Ki-67', '约 80%', '增殖指数'], ['EBER', '阴性', 'EBV 相关'],
  ['PD-L1', '未检测', '本报告未做'],
];

const FISH = [
  ['MYC 重排', '阴性', '排除 MYC 单独重排'],
  ['BCL2 重排', '阴性', ''],
  ['BCL6 重排', '阴性', '三阴性 → 不支持双打击/三打击'],
];

const LESIONS = [
  ['右颈 II 区淋巴结', 34, 18.2, '基线 PET-CT'],
  ['纵隔 4R 淋巴结', 68, 22.6, '基线 PET-CT'],
  ['右肺门淋巴结', 19, 9.4, '基线 PET-CT'],
];

const AES = [
  ['2026-04-26', '发热性中性粒细胞减少', 3, 'ANC 0.8 + 体温 38.6℃，住院 3 天；医生已处理', '住院记录'],
  ['2026-05-10', '手指麻木', 1, '长春新碱相关，第 4 周期减量后未加重', '本人记录 · 门诊确认'],
  ['2026-05-12', '口腔黏膜炎', 2, '进食受影响，5 天后缓解', '本人记录'],
  ['2026-06-18', '乏力', 2, '爬两层楼需休息', '本人记录'],
];

const LABS = [
  ['2026-10-09', '中性粒细胞', '4.4', '10⁹/L', '1.8–6.3', '随访血常规'],
  ['2026-10-09', '血红蛋白', '131', 'g/L', '130–175', '随访血常规'],
  ['2026-10-09', '血小板', '212', '10⁹/L', '125–350', '随访血常规'],
  ['2026-10-09', 'LDH', '202', 'U/L', '120–250', '随访生化'],
  ['2026-10-09', 'IgG', '6.4', 'g/L', '7.0–16.0', '随访免疫球蛋白'],
];

const INFECTIONS = [
  ['2026-02-18', 'HBsAg', '阴性', '—', '治疗前筛查'],
  ['2026-02-18', 'anti-HBc', '阳性', '既往感染；使用利妥昔单抗需评估再激活风险', '治疗前筛查'],
  ['2026-02-18', 'HBV-DNA', '未检出', '基线', '治疗前筛查'],
  ['2026-07-20', 'HBV-DNA', '未检出', '治疗结束复查', '结束评估'],
  ['2026-02-18', 'EBV-DNA', '未检出', '—', '治疗前筛查'],
  ['2026-02-18', 'HIV 抗原/抗体', '阴性', '—', '治疗前筛查'],
];

const DOCS = [
  ['d1', '病理报告 · 纵隔淋巴结', '2026-02-18', '病理', 'reviewed'],
  ['d2', 'PET-CT · 基线', '2026-02-20', '影像', 'reviewed'],
  ['d3', 'R-CHOP 化疗记录', '2026-06-20', '治疗', 'archived'],
  ['d4', 'PET-CT · 结束评估', '2026-07-20', '影像', 'reviewed'],
  ['d5', '血常规 · 随访', '2026-10-09', '检验', 'reviewed'],
];

const QUESTIONS = [
  ['结束 PET 是 Deauville 2，后续复查还需要做 PET 吗，还是 CT 就够？', '疗效评估 · 本人整理', 'fact', 1],
  ['IgG 一直在 6 左右，需不需要查疫苗抗体或做其他处理？', '免疫球蛋白记录', 'fact', 1],
  ['手指麻木还没完全恢复，随访时需要跟谁说？', '不良事件记录', 'fact', 1],
  ['我担心一停药就会回来，这种担心正常吗？', '本人看法 · 2026-10-10', 'view', 1],
];

const TASKS = [
  ['2026-11-05', '复查（血液科）', '医院安排 · 带好结束 PET 报告', 0],
  ['2026-10-24', '核对化疗记录', '资料整理 · 1 项剂量待确认', 0],
  ['2026-10-20', '把想问的三个问题过一遍', '本人安排', 1],
];

const PROFILES = [
  ['p1', '周先生', '周', 38, 'DEMO-1 侵袭性 B 细胞 · 全程', 'B', '弥漫大 B 细胞淋巴瘤，非特指型', 'DLBCL NOS', 'DLBCL, NOS',
    'Diffuse Large B-Cell Lymphoma, Not Otherwise Specified', 'WHO-HAEM5 · 成熟 B 细胞肿瘤', '2026-02-18', 'II A'],
  ['p2', '陈女士', '陈', 52, 'DEMO-2 惰性 · 观察等待', 'B', '滤泡性淋巴瘤 3A', 'FL', 'FL',
    'Follicular Lymphoma', 'WHO-HAEM5 · 成熟 B 细胞肿瘤', '2026-03-11', 'III A'],
  ['p3', '李同学', '李', 19, 'DEMO-3 霍奇金 · 青少年', 'H', '经典霍奇金淋巴瘤 · 结节硬化型', 'cHL', 'cHL',
    'Classic Hodgkin Lymphoma', 'WHO-HAEM5 · 经典型霍奇金淋巴瘤', '2026-05-06', 'II B'],
  ['p4', '吴先生', '吴', 64, 'DEMO-4 套细胞 · 长期用药', 'B', '套细胞淋巴瘤 · 经典型', 'MCL', 'MCL',
    'Mantle Cell Lymphoma', 'WHO-HAEM5 · 成熟 B 细胞肿瘤', '2026-02-17', 'IV'],
  ['p5', '赵女士', '赵', 45, 'DEMO-5 T 细胞 · 复发难治', 'T', '外周 T 细胞淋巴瘤，非特指型', 'PTCL-NOS', 'PTCL-NOS',
    'Peripheral T-Cell Lymphoma, NOS', 'WHO-HAEM5 · 成熟 T 和 NK 细胞肿瘤', '2026-01-22', 'III'],
];

/** 写入演示数据。已有档案时抛错（调用方决定要不要先清）。 */
export function seed(db, { now = () => new Date().toISOString() } = {}) {
  const has = db.prepare('SELECT COUNT(*) AS n FROM profile').get().n;
  if (has > 0) throw new Error('库里已有档案；要重来请先删库，或改用 seedIfEmpty');

  const run = (sql, ...a) => db.prepare(sql).run(...a);
  const T = now();

  db.exec('BEGIN');
  try {
    run('INSERT INTO workspace (id, root_path, consent_mineru, token_masked, token_source, backup_at, created_at, updated_at) VALUES (1, ?, 0, NULL, ?, ?, ?, ?)',
      '', 'none', '2026-10-16 22:10', T, T);

    for (const [code, name, unit, cat, color, dec, note, ord, num] of METRIC_DEFS) {
      run('INSERT INTO metric_def (code, name, unit, category, color, decimals, note, ordinal, is_numeric) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        code, name, unit, cat, color, dec, note, ord, num);
    }

    for (const [id, name, initial, age, tag, lineage, zh, abbr, whoAbbr, en, who, on, stage] of PROFILES) {
      run('INSERT INTO profile (id, name, initial, age, tag, is_demo, is_archived, created_at) VALUES (?, ?, ?, ?, ?, 1, 0, ?)',
        id, name, initial, age, tag, T);
      const a = run('INSERT INTO subtype_assertion (profile_id, lineage, name_zh, name_en, abbr, who_class, diagnosed_on, institution, report_no, is_current, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
        id, lineage, zh, en, abbr, who, on, '示例医院病理科', `P2026-${on.replace(/-/g, '')}-07`, T);
      run('INSERT INTO staging (profile_id, lugano, assessed_on, bone_marrow, extranodal_note, is_current, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)',
        id, stage, on, id === 'p1' ? '未受累' : null, id === 'p1' ? '基线影像未报告结外器官受累' : null, T);
      if (id === 'p1') {
        for (const kind of ['fever', 'night_sweat', 'weight_loss']) {
          run('INSERT INTO b_symptom (staging_id, kind, present, note) VALUES ((SELECT id FROM staging WHERE profile_id = ? AND is_current = 1), ?, 0, ?)',
            id, kind, '由医生问诊记录');
        }
      }
      void a;
    }

    /* ---- 只有 p1 有完整数据 ---- */
    for (const [id, name, type, date, status] of DOCS) {
      run('INSERT INTO document (id, profile_id, name, doc_type, reported_on, status) VALUES (?, ?, ?, ?, ?, ?)',
        id, 'p1', name, type, date, status);
    }
    let ord = 0;
    for (const [marker, result, comment] of IHC) {
      run('INSERT INTO pathology_marker (profile_id, assertion_id, panel, marker, result_text, result_state, comment, ordinal, source_document_id) VALUES (?, (SELECT id FROM subtype_assertion WHERE profile_id = ? AND is_current = 1), ?, ?, ?, ?, ?, ?, ?)',
        'p1', 'p1', 'IHC', marker, result, result === '未检测' ? 'not_tested' : 'reported', comment, ord += 1, 'd1');
    }
    ord = 0;
    for (const [marker, result, comment] of FISH) {
      run('INSERT INTO pathology_marker (profile_id, assertion_id, panel, marker, result_text, result_state, comment, ordinal, source_document_id) VALUES (?, (SELECT id FROM subtype_assertion WHERE profile_id = ? AND is_current = 1), ?, ?, ?, ?, ?, ?, ?)',
        'p1', 'p1', 'FISH', marker, result, 'reported', comment, ord += 1, 'd1');
    }
    ord = 0;
    for (const [site, mm, suv, src] of LESIONS) {
      run('INSERT INTO lesion (profile_id, site, long_axis_mm, suvmax, is_baseline, measured_on, source_document_id, ordinal) VALUES (?, ?, ?, ?, 1, ?, ?, ?)',
        'p1', site, mm, suv, '2026-02-20', src === '基线 PET-CT' ? 'd2' : null, ord += 1);
    }
    run('INSERT INTO consultation (profile_id, happened_on, hospital, conclusion_kind, conclusion_text, source_document_id) VALUES (?, ?, ?, ?, ?, ?)',
      'p1', '2026-02-26', '上级医院病理科', 'consistent', '与初诊一致（DLBCL, NOS）。未改变分型，未改变治疗方案。', 'd1');

    const line1 = run('INSERT INTO treatment_line (profile_id, line_no, regimen_name, intent, status, started_on, ended_on, next_step, next_on, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      'p1', 1, 'R-CHOP', 'curative', 'completed', '2026-03-02', '2026-06-15', '随访', '2026-11-05', '6 周期，1 次延迟，1 次减量');
    for (const [n, pFrom, pTo, aFrom, aTo, delay, reason, adjust, note] of CYCLES) {
      run('INSERT INTO cycle (line_id, n, planned_on, planned_to, actual_on, actual_to, delay_days, delay_reason, dose_adjust, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        line1.lastInsertRowid, n, pFrom, pTo, aFrom, aTo, delay, reason, adjust, note === '—' ? null : note);
    }
    const drugs = [
      ['利妥昔单抗 R', '375 mg/m²', '静脉输注', ''], ['环磷酰胺 C', '750 mg/m²', '静脉', ''],
      ['多柔比星 H', '50 mg/m²', '静脉', ''], ['长春新碱 O', '1.4 mg/m²（上限 2 mg）', '静脉', '第 4 周期减量 25%'],
      ['泼尼松 P', '100 mg × 5 天', '口服', ''],
    ];
    drugs.forEach(([name, dose, route, note], i) => {
      run('INSERT INTO regimen_drug (line_id, name, dose_text, route, note, ordinal) VALUES (?, ?, ?, ?, ?, ?)',
        line1.lastInsertRowid, name, dose, route, note, i + 1);
    });
    for (const [tp, d, dv, mm, conclusion, label] of RESPONSES) {
      run('INSERT INTO response (line_id, timepoint, assessed_on, deauville, lesion_mm, conclusion_text, clinician_label, source_document_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        line1.lastInsertRowid, tp, d, dv, mm, conclusion, label, tp === '结束治疗' ? 'd4' : (tp === '基线' ? 'd2' : null));
    }
    ord = 0;
    for (const [d, term, grade, note, src] of AES) {
      run('INSERT INTO adverse_event (profile_id, line_id, happened_on, term, ctcaegrade, note, source_document_id, ordinal) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        'p1', line1.lastInsertRowid, d, term, grade, note, src === '住院记录' ? 'd3' : null, ord += 1);
    }
    for (const [code, d, v, src] of METRIC_POINTS) {
      run('INSERT INTO metric_point (profile_id, code, measured_on, value_num, value_text, source_text, method) VALUES (?, ?, ?, ?, ?, ?, NULL)',
        'p1', code, d, v, null, src);
    }
    for (const [d, item, v, unit, ref, src] of LABS) {
      run('INSERT INTO lab_result (profile_id, measured_on, item, value_text, unit, ref_range, source_text) VALUES (?, ?, ?, ?, ?, ?, ?)',
        'p1', d, item, v, unit, ref, src);
    }
    for (const [d, item, v, note, src] of INFECTIONS) {
      run('INSERT INTO infection_screen (profile_id, measured_on, item, result_text, note, source_text) VALUES (?, ?, ?, ?, ?, ?)',
        'p1', d, item, v, note, src);
    }
    run('INSERT INTO fertility_note (profile_id, happened_on, title, detail, status) VALUES (?, ?, ?, ?, ?)',
      'p1', '2026-02-19', '生育力保存咨询', '治疗前已转诊生殖医学中心；是否进行由本人与医生决定', '已咨询');

    QUESTIONS.forEach(([text, source, kind], i) => {
      run('INSERT INTO question (profile_id, created_on, text, kind, selected, source_text, ordinal) VALUES (?, ?, ?, ?, ?, ?, ?)',
        'p1', '2026-10-10', text, kind, 1, source, i + 1);
    });
    run('INSERT INTO viewpoint (profile_id, recorded_on, role, text, is_private) VALUES (?, ?, ?, ?, 1)',
      'p1', '2026-10-10', 'patient', '看到"完全代谢缓解"那天很高兴，但这几天又开始担心复发。');
    for (const [due, title, note, done] of TASKS) {
      run('INSERT INTO task (profile_id, due_on, title, note, done, done_on) VALUES (?, ?, ?, ?, ?, ?)',
        'p1', due, title, note, done, done ? '2026-10-20' : null);
    }

    /* ---- p3 / p4 / p5 的治疗线（只够界面演示元数据）---- */
    const l3 = run('INSERT INTO treatment_line (profile_id, line_no, regimen_name, intent, status, started_on, ended_on, next_step, next_on) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      'p3', 1, 'ABVD', 'curative', 'active', '2026-07-08', null, null, null);
    for (let n = 1; n <= 3; n += 1) {
      const from = new Date(Date.parse(`2026-07-08T00:00:00Z`) + (n - 1) * 14 * 86400000).toISOString().slice(0, 10);
      const to = new Date(Date.parse(`${from}T00:00:00Z`) + 5 * 86400000).toISOString().slice(0, 10);
      run('INSERT INTO cycle (line_id, n, planned_on, planned_to, actual_on, actual_to, delay_days, delay_reason, dose_adjust, note) VALUES (?, ?, ?, ?, ?, ?, 0, NULL, NULL, NULL)',
        l3.lastInsertRowid, n, from, to, from, to);
    }
    run('INSERT INTO treatment_line (profile_id, line_no, regimen_name, intent, status, started_on, ended_on, next_step, next_on) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      'p4', 1, 'BTK 抑制剂维持', 'maintenance', 'active', '2026-02-17', null, null, null);
    run('INSERT INTO treatment_line (profile_id, line_no, regimen_name, intent, status, started_on, ended_on, next_step, next_on) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      'p5', 1, '二线方案', 'salvage', 'completed', '2026-02-02', '2026-06-30', null, null);

    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return { profiles: PROFILES.length, metricPoints: METRIC_POINTS.length, today: TODAY };
}

/** 库为空才播种。返回 true 表示本次写入了。 */
export function seedIfEmpty(db, opts) {
  if (db.prepare('SELECT COUNT(*) AS n FROM profile').get().n > 0) return false;
  seed(db, opts);
  return true;
}

/* CLI */
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const path = process.argv[2] ?? './workspace/lymbell.sqlite';
  const db = openDb(path);
  const force = process.argv.includes('--force');
  if (force) {
    db.exec(`
      DELETE FROM saved_trial; DELETE FROM document; DELETE FROM fertility_note;
      DELETE FROM nutrition_log; DELETE FROM symptom_log; DELETE FROM fever_log;
      DELETE FROM infection_screen; DELETE FROM lab_result; DELETE FROM metric_point;
      DELETE FROM adverse_event; DELETE FROM response; DELETE FROM cycle;
      DELETE FROM regimen_drug; DELETE FROM treatment_line; DELETE FROM consultation;
      DELETE FROM lesion; DELETE FROM b_symptom; DELETE FROM staging;
      DELETE FROM pathology_marker; DELETE FROM subtype_assertion;
      DELETE FROM viewpoint; DELETE FROM question; DELETE FROM task;
      DELETE FROM profile; DELETE FROM metric_def;`);
  }
  try {
    const r = seed(db);
    console.log(`✓ 演示数据已写入 ${path}：${r.profiles} 个档案 · ${r.metricPoints} 个指标点`);
  } catch (e) {
    console.error(`✗ ${e.message}`);
    process.exit(1);
  }
  db.close();
}
